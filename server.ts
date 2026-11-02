import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// AI Studio dev server must strictly run on port 3000
const PORT = 3000;
const isProd = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json({ limit: '100mb' }));

// Enable CORS for LAN cross-origin communication between multiple PCs
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (_req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const server = http.createServer(app);

// Peer structure
interface PeerInfo {
  id: string;
  name: string;
  deviceType: 'desktop' | 'laptop' | 'mobile';
  os: string;
  networkTag: string;
  targetDrives?: string[];
  roomId: string;
  ip?: string;
  joinedAt: number;
}

// Map ws -> PeerInfo
const clients = new Map<WebSocket, PeerInfo>();

// WebSocket Server for LAN auto-discovery and WebRTC signaling
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

function broadcastToRoom(roomId: string, message: any, excludeWs?: WebSocket) {
  const payload = JSON.stringify(message);
  for (const [ws, peer] of clients.entries()) {
    if (ws.readyState === WebSocket.OPEN && peer.roomId === roomId && ws !== excludeWs) {
      ws.send(payload);
    }
  }
}

function sendToPeer(targetPeerId: string, message: any) {
  const payload = JSON.stringify(message);
  for (const [ws, peer] of clients.entries()) {
    if (ws.readyState === WebSocket.OPEN && peer.id === targetPeerId) {
      ws.send(payload);
      return true;
    }
  }
  return false;
}

function getRoomPeers(roomId: string): PeerInfo[] {
  const list: PeerInfo[] = [];
  for (const [ws, peer] of clients.entries()) {
    if (ws.readyState === WebSocket.OPEN && peer.roomId === roomId) {
      list.push(peer);
    }
  }
  return list;
}

wss.on('connection', (ws, req) => {
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || '';

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const type = msg.type;

      switch (type) {
        case 'join': {
          const clientCleanIp = clientIp.replace(/^.*:/, '');
          const peerInfo: PeerInfo = {
            id: msg.id,
            name: msg.name || 'PC / Laptop',
            deviceType: msg.deviceType || 'desktop',
            os: msg.os || 'Windows',
            networkTag: msg.networkTag || 'Wi-Fi Dongle',
            targetDrives: msg.targetDrives || ['C:\\', 'D:\\', 'E:\\', 'Downloads'],
            roomId: msg.roomId || 'local-mesh',
            ip: msg.ip || clientCleanIp || '192.168.1.x',
            joinedAt: Date.now(),
          };
          clients.set(ws, peerInfo);

          // Reply with current peers in room and detected IP
          const peers = getRoomPeers(peerInfo.roomId).filter(p => p.id !== peerInfo.id);
          ws.send(JSON.stringify({
            type: 'room:peers',
            selfId: peerInfo.id,
            detectedIp: peerInfo.ip,
            peers,
          }));

          // Notify others in room
          broadcastToRoom(peerInfo.roomId, {
            type: 'peer:joined',
            peer: peerInfo,
          }, ws);
          break;
        }

        case 'update:profile': {
          const existing = clients.get(ws);
          if (existing) {
            existing.name = msg.name ?? existing.name;
            existing.targetDrives = msg.targetDrives ?? existing.targetDrives;
            existing.networkTag = msg.networkTag ?? existing.networkTag;

            broadcastToRoom(existing.roomId, {
              type: 'peer:updated',
              peer: existing,
            });
          }
          break;
        }

        case 'switch:room': {
          const existing = clients.get(ws);
          if (existing) {
            const oldRoom = existing.roomId;
            const newRoom = msg.newRoomId || 'local-mesh';
            
            // Notify old room
            broadcastToRoom(oldRoom, {
              type: 'peer:left',
              peerId: existing.id,
            }, ws);

            existing.roomId = newRoom;

            // Send peers in new room
            const peers = getRoomPeers(newRoom).filter(p => p.id !== existing.id);
            ws.send(JSON.stringify({
              type: 'room:peers',
              selfId: existing.id,
              peers,
            }));

            // Notify new room
            broadcastToRoom(newRoom, {
              type: 'peer:joined',
              peer: existing,
            }, ws);
          }
          break;
        }

        case 'signal': {
          // WebRTC signaling: offer, answer, ice-candidate
          if (msg.targetId) {
            sendToPeer(msg.targetId, {
              type: 'signal',
              fromId: msg.fromId,
              data: msg.data,
            });
          }
          break;
        }

        case 'file:offer': {
          // Send transfer request to recipient
          if (msg.targetId) {
            sendToPeer(msg.targetId, {
              type: 'file:offer',
              fromId: msg.fromId,
              file: msg.file,
              transferId: msg.transferId,
            });
          }
          break;
        }

        case 'file:response': {
          // Recipient accepted or declined
          if (msg.targetId) {
            sendToPeer(msg.targetId, {
              type: 'file:response',
              fromId: msg.fromId,
              transferId: msg.transferId,
              accepted: msg.accepted,
              chosenDrive: msg.chosenDrive,
              reason: msg.reason,
            });
          }
          break;
        }

        case 'file:relay:chunk': {
          // Fallback direct relay via WebSocket if WebRTC P2P is not direct
          if (msg.targetId) {
            sendToPeer(msg.targetId, {
              type: 'file:relay:chunk',
              fromId: msg.fromId,
              transferId: msg.transferId,
              chunkIndex: msg.chunkIndex,
              totalChunks: msg.totalChunks,
              data: msg.data,
            });
          }
          break;
        }

        case 'file:cancel': {
          if (msg.targetId) {
            sendToPeer(msg.targetId, {
              type: 'file:cancel',
              fromId: msg.fromId,
              transferId: msg.transferId,
            });
          }
          break;
        }

        case 'scan:request': {
          const peer = clients.get(ws);
          if (peer) {
            const peers = getRoomPeers(peer.roomId).filter(p => p.id !== peer.id);
            ws.send(JSON.stringify({
              type: 'scan:response',
              peers,
            }));
          }
          break;
        }

        case 'pair:request': {
          if (msg.targetId) {
            const sender = clients.get(ws);
            sendToPeer(msg.targetId, {
              type: 'pair:request',
              fromPeer: sender,
              autoAccept: msg.autoAccept ?? true,
            });
          }
          break;
        }

        case 'pair:accept': {
          if (msg.targetId) {
            const sender = clients.get(ws);
            sendToPeer(msg.targetId, {
              type: 'pair:accepted',
              fromPeer: sender,
              targetId: msg.targetId,
            });
            ws.send(JSON.stringify({
              type: 'pair:confirmed',
              pairedWithId: msg.targetId,
            }));
          }
          break;
        }

        case 'pair:disconnect': {
          if (msg.targetId) {
            sendToPeer(msg.targetId, {
              type: 'pair:disconnected',
              fromId: msg.fromId,
            });
          }
          break;
        }

        case 'pair:by-ip': {
          const rawTarget = (msg.targetIp || '').trim().toLowerCase();
          const cleanTarget = rawTarget.replace(/^https?:\/\//, '').replace(/:[0-9]+.*$/, '').trim();

          const sender = clients.get(ws);
          let matchedPeer: PeerInfo | undefined;

          for (const [pws, peer] of clients.entries()) {
            if (peer.id !== msg.fromId) {
              const peerIp = (peer.ip || '').toLowerCase();
              if (
                peerIp === cleanTarget ||
                peerIp.includes(cleanTarget) ||
                cleanTarget.includes(peerIp) ||
                peer.name.toLowerCase().includes(cleanTarget)
              ) {
                matchedPeer = peer;
                break;
              }
            }
          }

          if (matchedPeer) {
            sendToPeer(matchedPeer.id, {
              type: 'pair:request',
              fromPeer: sender,
              autoAccept: true,
            });
            ws.send(JSON.stringify({
              type: 'pair:ip-found',
              peer: matchedPeer,
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'pair:ip-not-found',
              searchedIp: msg.targetIp,
            }));
          }
          break;
        }

        case 'clipboard:send': {
          // Text/link sharing
          if (msg.targetId) {
            sendToPeer(msg.targetId, {
              type: 'clipboard:received',
              fromId: msg.fromId,
              text: msg.text,
              timestamp: Date.now(),
            });
          } else {
            const peer = clients.get(ws);
            if (peer) {
              broadcastToRoom(peer.roomId, {
                type: 'clipboard:received',
                fromId: peer.id,
                text: msg.text,
                timestamp: Date.now(),
              }, ws);
            }
          }
          break;
        }

        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        }
      }
    } catch (err) {
      console.error('Error handling WS message:', err);
    }
  });

  ws.on('close', () => {
    const peer = clients.get(ws);
    if (peer) {
      clients.delete(ws);
      broadcastToRoom(peer.roomId, {
        type: 'peer:left',
        peerId: peer.id,
      });
    }
  });

  ws.on('error', () => {
    const peer = clients.get(ws);
    if (peer) {
      clients.delete(ws);
      broadcastToRoom(peer.roomId, {
        type: 'peer:left',
        peerId: peer.id,
      });
    }
  });
});

// Endpoint to get server LAN network addresses
app.get('/api/network-info', (_req, res) => {
  const nets = os.networkInterfaces();
  const results: { name: string; address: string; family: string }[] = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        results.push({
          name,
          address: net.address,
          family: net.family,
        });
      }
    }
  }

  res.json({
    hostname: os.hostname(),
    port: PORT,
    localIps: results,
    activePeersCount: clients.size,
  });
});

app.get('/api/peers', (_req, res) => {
  const peers = Array.from(clients.values());
  res.json({ peers });
});

app.post('/api/direct-connect', (req, res) => {
  const fromPeer = req.body?.peer;
  if (fromPeer) {
    broadcastToRoom(fromPeer.roomId || 'local-mesh', {
      type: 'peer:joined',
      peer: fromPeer,
    });
    broadcastToRoom(fromPeer.roomId || 'local-mesh', {
      type: 'pair:request',
      fromPeer: fromPeer,
      autoAccept: true,
    });
  }
  const peers = Array.from(clients.values());
  res.json({ success: true, peers });
});

// Download endpoints for built Windows executables
app.get('/api/download/status', (_req, res) => {
  const portablePath = path.resolve(__dirname, 'release/WiFi-LAN-File-Drop-Portable.zip');
  const setupPath = path.resolve(__dirname, 'release/WiFi LAN File Drop Setup 1.0.0.exe');
  const unpackedExePath = path.resolve(__dirname, 'release/win-unpacked/WiFi LAN File Drop.exe');

  res.json({
    portableAvailable: fs.existsSync(portablePath),
    setupAvailable: fs.existsSync(setupPath),
    unpackedExeAvailable: fs.existsSync(unpackedExePath),
  });
});

app.get('/api/download/portable', (_req, res) => {
  const portablePath = path.resolve(__dirname, 'release/WiFi-LAN-File-Drop-Portable.zip');
  if (fs.existsSync(portablePath)) {
    return res.download(portablePath, 'WiFi-LAN-File-Drop-Windows-Portable.zip');
  }
  return res.status(404).send('Portable build archive not found. Please build first.');
});

app.get('/api/download/setup', (_req, res) => {
  const setupPath = path.resolve(__dirname, 'release/WiFi LAN File Drop Setup 1.0.0.exe');
  if (fs.existsSync(setupPath)) {
    return res.download(setupPath, 'WiFi-LAN-File-Drop-Setup-1.0.0.exe');
  }
  return res.status(404).send('Setup installer not found. Please build first.');
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Wi-Fi LAN File Drop server listening on port ${PORT}`);
  });
}

startServer();
