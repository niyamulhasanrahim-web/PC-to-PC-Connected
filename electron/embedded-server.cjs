const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

function startEmbeddedServer(preferredPort = 3000) {
  return new Promise((resolve, reject) => {
    const app = express();
    app.use(express.json({ limit: '100mb' }));

    // Enable CORS for LAN cross-origin communication
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
    const clients = new Map();

    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      try {
        const urlObj = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
        if (urlObj.pathname === '/ws') {
          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
          });
        }
      } catch (err) {
        socket.destroy();
      }
    });

    function broadcastToRoom(roomId, message, excludeWs) {
      const payload = JSON.stringify(message);
      for (const [ws, peer] of clients.entries()) {
        if (ws.readyState === WebSocket.OPEN && peer.roomId === roomId && ws !== excludeWs) {
          ws.send(payload);
        }
      }
    }

    function sendToPeer(targetPeerId, message) {
      const payload = JSON.stringify(message);
      for (const [ws, peer] of clients.entries()) {
        if (ws.readyState === WebSocket.OPEN && peer.id === targetPeerId) {
          ws.send(payload);
          return true;
        }
      }
      return false;
    }

    function getRoomPeers(roomId) {
      const list = [];
      for (const [ws, peer] of clients.entries()) {
        if (ws.readyState === WebSocket.OPEN && peer.roomId === roomId) {
          list.push(peer);
        }
      }
      return list;
    }

    wss.on('connection', (ws, req) => {
      const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          const type = msg.type;

          switch (type) {
            case 'join': {
              const clientCleanIp = clientIp.replace(/^.*:/, '');
              const peerInfo = {
                id: msg.id,
                name: msg.name || 'Windows Desktop PC',
                deviceType: msg.deviceType || 'desktop',
                os: msg.os || 'Windows',
                networkTag: msg.networkTag || 'Wi-Fi Dongle',
                targetDrives: msg.targetDrives || ['C:\\', 'D:\\', 'E:\\', 'Downloads'],
                roomId: msg.roomId || 'local-mesh',
                ip: msg.ip || clientCleanIp || '127.0.0.1',
                joinedAt: Date.now(),
              };
              clients.set(ws, peerInfo);

              const otherPeers = getRoomPeers(peerInfo.roomId).filter((p) => p.id !== peerInfo.id);
              ws.send(JSON.stringify({
                type: 'room:peers',
                peers: otherPeers,
                you: peerInfo,
              }));

              broadcastToRoom(peerInfo.roomId, {
                type: 'peer:joined',
                peer: peerInfo,
              }, ws);
              break;
            }

            case 'update-self': {
              const existing = clients.get(ws);
              if (existing) {
                const updated = { ...existing, ...msg.updates };
                clients.set(ws, updated);
                broadcastToRoom(updated.roomId, {
                  type: 'peer:updated',
                  peer: updated,
                });
              }
              break;
            }

            case 'signal': {
              sendToPeer(msg.targetId, {
                type: 'signal',
                fromId: msg.fromId,
                signal: msg.signal,
              });
              break;
            }

            case 'file:announce': {
              if (msg.targetPeerId) {
                sendToPeer(msg.targetPeerId, {
                  type: 'file:announce',
                  fileMeta: msg.fileMeta,
                  fromPeer: msg.fromPeer,
                });
              } else {
                const peer = clients.get(ws);
                if (peer) {
                  broadcastToRoom(peer.roomId, {
                    type: 'file:announce',
                    fileMeta: msg.fileMeta,
                    fromPeer: msg.fromPeer,
                  }, ws);
                }
              }
              break;
            }

            case 'file:request': {
              sendToPeer(msg.targetPeerId, {
                type: 'file:request',
                fileId: msg.fileId,
                fromPeerId: msg.fromPeerId,
                targetDrive: msg.targetDrive,
              });
              break;
            }

            case 'file:chunk': {
              sendToPeer(msg.targetPeerId, {
                type: 'file:chunk',
                fileId: msg.fileId,
                chunkIndex: msg.chunkIndex,
                totalChunks: msg.totalChunks,
                data: msg.data,
              });
              break;
            }

            case 'file:complete': {
              sendToPeer(msg.targetPeerId, {
                type: 'file:complete',
                fileId: msg.fileId,
                fileName: msg.fileName,
              });
              break;
            }

            case 'ping': {
              ws.send(JSON.stringify({ type: 'pong', time: Date.now() }));
              break;
            }

            default:
              break;
          }
        } catch (err) {
          console.error('[Embedded Server] WS message error:', err);
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

    // Endpoint for network info
    app.get('/api/network-info', (_req, res) => {
      const nets = os.networkInterfaces();
      const results = [];

      for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
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
        port: preferredPort,
        localIps: results,
        activePeersCount: clients.size,
      });
    });

    app.get('/api/peers', (_req, res) => {
      const peers = Array.from(clients.values());
      res.json({ peers });
    });

    app.post('/api/direct-connect', (req, res) => {
      const fromPeer = req.body && req.body.peer;
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

    // Static assets
    const distPath = path.resolve(__dirname, '../dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });

    server.listen(preferredPort, '0.0.0.0', () => {
      console.log(`[Embedded Server] Running on http://localhost:${preferredPort}`);
      resolve({ server, port: preferredPort });
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[Embedded Server] Port ${preferredPort} in use, assuming external server is running.`);
        resolve({ server: null, port: preferredPort });
      } else {
        reject(err);
      }
    });
  });
}

module.exports = { startEmbeddedServer };
