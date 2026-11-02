import React, { useRef, useState } from 'react';
import { UploadCloud, FolderPlus, FileText, HardDrive, ArrowRight, X, Send, Check } from 'lucide-react';
import { Language, translations } from '../translations';
import { PeerInfo } from '../types';
import { formatBytes, getFileCategory } from '../utils/format';

interface DropZoneProps {
  peers: PeerInfo[];
  selectedPeerId: string | null;
  onSelectPeer: (peerId: string | null) => void;
  onSendFiles: (
    files: File[],
    targetPeerIds: string[],
    sourceDrive: string,
    targetDrive: string
  ) => void;
  lang: Language;
}

export const DropZone: React.FC<DropZoneProps> = ({
  peers,
  selectedPeerId,
  onSelectPeer,
  onSendFiles,
  lang,
}) => {
  const t = translations[lang];
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [sourceDrive, setSourceDrive] = useState<string>('D:\\ (Data Drive)');
  const [targetDrive, setTargetDrive] = useState<string>('D:\\');
  const [sendToAll, setSendToAll] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      setSelectedFiles((prev) => [...prev, ...filesArray]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles((prev) => [...prev, ...filesArray]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleStartTransfer = () => {
    if (selectedFiles.length === 0) return;

    let targetIds: string[] = [];
    if (sendToAll) {
      targetIds = peers.map((p) => p.id);
    } else if (selectedPeerId) {
      targetIds = [selectedPeerId];
    } else if (peers.length > 0) {
      targetIds = [peers[0].id];
    }

    if (targetIds.length === 0) return;

    onSendFiles(selectedFiles, targetIds, sourceDrive, targetDrive);
    setSelectedFiles([]);
  };

  const totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  // Common drives in Windows PCs
  const driveOptions = [
    { id: 'C:\\', label: 'C:\\ (System / Desktop)' },
    { id: 'D:\\', label: 'D:\\ (Data / Files)' },
    { id: 'E:\\', label: 'E:\\ (Storage / Media)' },
    { id: 'F:\\', label: 'F:\\ (External / USB)' },
    { id: 'Downloads', label: 'Downloads' },
  ];

  const targetPeer = peers.find((p) => p.id === selectedPeerId);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-5">
      {/* Target PC Green Signal Status */}
      {targetPeer && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/50 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="font-bold text-emerald-400">
              🟢 {lang === 'bn' ? `সংযুক্ত পিসি: ${targetPeer.name}` : `Connected Target: ${targetPeer.name}`}
            </span>
            <span className="text-slate-400">({targetPeer.networkTag})</span>
          </div>
          <span className="text-emerald-300 font-medium text-[11px]">
            {lang === 'bn' ? 'ফাইল ড্র্যাগ অ্যান্ড ড্রপ করলেই সরাসরি পাঠানো যাবে' : 'Ready for instant transfer'}
          </span>
        </div>
      )}

      {/* Drive Selectors Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-950/70 border border-slate-800/80">
        {/* Source Drive */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
            <span>{t.sourceDrive}</span>
          </label>
          <select
            value={sourceDrive}
            onChange={(e) => setSourceDrive(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="Any Drive (Windows File Explorer)">{lang === 'bn' ? 'যেকোনো ড্রাইভ (Windows Explorer)' : 'Any Drive / File Explorer'}</option>
            <option value="C:\ (Local Disk)">C:\ (Local Disk / Desktop)</option>
            <option value="D:\ (Data Drive)">D:\ (Data Drive)</option>
            <option value="E:\ (Backup Drive)">E:\ (Backup / Media Drive)</option>
            <option value="F:\ (USB / Pen Drive)">F:\ (USB / Pen Drive)</option>
          </select>
          <span className="text-[11px] text-slate-500 block">
            {lang === 'bn'
              ? 'আপনার পিসির যেকোনো ড্রাইভ থেকে ফাইল আনতে পারেন'
              : 'Pick or drag files from any drive on this PC'}
          </span>
        </div>

        {/* Target Drive on Destination PC */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t.targetDrive}</span>
          </label>
          <select
            value={targetDrive}
            onChange={(e) => setTargetDrive(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            {driveOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-slate-500 block">
            {lang === 'bn'
              ? 'অন্য পিসির রিসিভারকে এই ড্রাইভে সেভের পরামর্শ দেওয়া হবে'
              : 'Suggested target drive on the receiving PC'}
          </span>
        </div>
      </div>

      {/* Main Drag & Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
          isDragOver
            ? 'border-indigo-400 bg-indigo-950/40 shadow-inner'
            : 'border-slate-700/80 bg-slate-950/40 hover:border-slate-600 hover:bg-slate-950/60'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-ignore
          webkitdirectory=""
          directory=""
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform ${
              isDragOver
                ? 'bg-indigo-600 text-white scale-110 shadow-lg shadow-indigo-600/30'
                : 'bg-indigo-500/10 text-indigo-400'
            }`}
          >
            <UploadCloud className="w-7 h-7" />
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-semibold text-white">
              {isDragOver
                ? lang === 'bn'
                  ? 'এখনই ড্রপ করুন!'
                  : 'Drop Files Now!'
                : t.dragDropTitle}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {t.dragDropSubtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <span>{t.browseFiles}</span>
            </button>

            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="px-3.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.browseFolder}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Selected Files Preview & Recipient Action */}
      {selectedFiles.length > 0 && (
        <div className="space-y-4 pt-2 border-t border-slate-800 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-300">
                {lang === 'bn' ? 'নির্বাচিত ফাইলসমূহ' : 'Selected Files'} (
                {selectedFiles.length})
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-xs text-indigo-300 font-mono tabular-nums">
                {formatBytes(totalSize)}
              </span>
            </div>
            <button
              onClick={() => setSelectedFiles([])}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            >
              {lang === 'bn' ? 'সব মুছুন' : 'Clear all'}
            </button>
          </div>

          {/* Files List */}
          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {selectedFiles.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs"
              >
                <div className="flex items-center gap-2 truncate">
                  <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-slate-200 font-medium truncate">
                    {file.name}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-slate-500 font-mono tabular-nums text-[11px]">
                    {formatBytes(file.size)}
                  </span>
                  <button
                    onClick={() => removeFile(idx)}
                    className="text-slate-500 hover:text-rose-400 transition-colors p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Target Recipient Selector & Send Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
            {/* Recipient selection toggle */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-400 flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendToAll}
                  onChange={(e) => setSendToAll(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                />
                <span>{t.sendToAll}</span>
              </label>

              {!sendToAll && peers.length > 1 && (
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span>{t.sendTo}:</span>
                  <select
                    value={selectedPeerId || (peers[0]?.id ?? '')}
                    onChange={(e) => onSelectPeer(e.target.value)}
                    className="px-2 py-1 bg-slate-950 border border-slate-700 rounded-md text-slate-200 text-xs"
                  >
                    {peers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Big Send Button */}
            <button
              onClick={handleStartTransfer}
              disabled={peers.length === 0}
              className={`px-5 py-2.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md ${
                peers.length === 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 active:scale-[0.98]'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {t.startTransfer} (
                {sendToAll
                  ? `${peers.length} ${lang === 'bn' ? 'পিসিতে' : 'devices'}`
                  : peers.find((p) => p.id === (selectedPeerId || peers[0]?.id))?.name || (lang === 'bn' ? 'পিসিতে' : 'device')}
                )
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
