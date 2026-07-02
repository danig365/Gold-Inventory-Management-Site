import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  X,
  RefreshCw,
  RotateCcw,
  Clock,
  HardDrive,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ChevronRight,
  Calendar,
  User,
  ServerCrash,
  Info,
} from 'lucide-react';
import { api } from '../api';
import { BackupEntry, AppState } from '../types';

interface BackupStatusProps {
  onClose: () => void;
  onRestoreSuccess: (data: AppState) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 2) return 'Just now';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs} hour${diffHrs !== 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
}

function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function createdByLabel(createdBy: string | null): string {
  if (!createdBy) return 'System';
  if (createdBy === 'system') return 'Auto';
  return 'You';
}

function getDaysCovered(backups: BackupEntry[]): number {
  if (backups.length === 0) return 0;
  const oldest = new Date(backups[backups.length - 1].createdAt).getTime();
  const newest = new Date(backups[0].createdAt).getTime();
  return Math.max(1, Math.round((newest - oldest) / 86_400_000) + 1);
}

function getHealthColor(backups: BackupEntry[]): 'green' | 'yellow' | 'red' {
  if (backups.length === 0) return 'red';
  const hoursAgo = (Date.now() - new Date(backups[0].createdAt).getTime()) / 3_600_000;
  if (hoursAgo <= 25) return 'green';
  if (hoursAgo <= 48) return 'yellow';
  return 'red';
}

// ─── Confirm Restore Modal ────────────────────────────────────────────────────

interface ConfirmRestoreProps {
  backup: BackupEntry;
  onConfirm: () => void;
  onCancel: () => void;
  isRestoring: boolean;
}

const ConfirmRestoreModal: React.FC<ConfirmRestoreProps> = ({ backup, onConfirm, onCancel, isRestoring }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-md p-6">
      <div className="flex items-start gap-4 mb-5">
        <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
          <AlertTriangle size={22} className="text-amber-500" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-white">Restore Backup?</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Your current data will be replaced with the backup from{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {formatDateTime(backup.createdAt)}
            </span>
            .
          </p>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl px-4 py-3 mb-6 flex items-start gap-3">
        <Info size={15} className="text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
          A safety snapshot of your current data will be created automatically before the restore, so you can undo this if needed.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          disabled={isRestoring}
          className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isRestoring}
          className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {isRestoring ? (
            <><Loader2 size={15} className="animate-spin" /> Restoring…</>
          ) : (
            <><RotateCcw size={15} /> Restore Now</>
          )}
        </button>
      </div>
    </div>
  </div>
);

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastProps {
  type: 'success' | 'error';
  message: string;
}

const Toast: React.FC<ToastProps> = ({ type, message }) => (
  <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in slide-in-from-bottom-4 duration-300 ${
    type === 'success'
      ? 'bg-emerald-600 text-white'
      : 'bg-rose-600 text-white'
  }`}>
    {type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
    {message}
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const BackupStatus: React.FC<BackupStatusProps> = ({ onClose, onRestoreSuccess }) => {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<BackupEntry | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [toast, setToast] = useState<ToastProps | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const loadBackups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listMyBackups();
      setBackups(list);
    } catch (err) {
      setError((err as Error).message || 'Failed to load backups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  const handleCreateBackup = async () => {
    setCreating(true);
    try {
      const entry = await api.createMyBackup('manual');
      setBackups(prev => [entry, ...prev]);
      showToast('success', 'Backup created successfully');
    } catch (err) {
      showToast('error', (err as Error).message || 'Failed to create backup');
    } finally {
      setCreating(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!confirmRestore) return;
    setIsRestoring(true);
    try {
      const result = await api.restoreMyBackup(confirmRestore.id);
      setConfirmRestore(null);
      onRestoreSuccess(result.data);
      showToast('success', 'Data restored successfully. A safety snapshot was saved.');
      // Reload the backup list to reflect the new safety snapshot
      await loadBackups();
    } catch (err) {
      setConfirmRestore(null);
      showToast('error', (err as Error).message || 'Restore failed');
    } finally {
      setIsRestoring(false);
    }
  };

  const health = getHealthColor(backups);
  const daysCovered = getDaysCovered(backups);
  const lastBackup = backups[0] ?? null;

  const healthConfig = {
    green: {
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      border: 'border-emerald-200 dark:border-emerald-800/50',
      dot: 'bg-emerald-500',
      text: 'text-emerald-700 dark:text-emerald-400',
      label: 'Protected',
    },
    yellow: {
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      border: 'border-amber-200 dark:border-amber-800/50',
      dot: 'bg-amber-400',
      text: 'text-amber-700 dark:text-amber-400',
      label: 'Aging',
    },
    red: {
      bg: 'bg-rose-50 dark:bg-rose-900/20',
      border: 'border-rose-200 dark:border-rose-900/50',
      dot: 'bg-rose-500',
      text: 'text-rose-700 dark:text-rose-400',
      label: 'No Backup',
    },
  }[health];

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Slide-in Panel */}
      <div className="fixed top-0 right-0 h-full z-[160] w-full max-w-md flex flex-col bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-slate-800 shadow-2xl animate-in slide-in-from-right duration-300">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
              <ShieldCheck size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-white tracking-wide">Data Backup</h2>
              <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">Your backup history</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Status Card */}
          {!loading && !error && (
            <div className={`rounded-2xl border p-4 ${healthConfig.bg} ${healthConfig.border}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${healthConfig.dot} ${health === 'green' ? 'animate-pulse' : ''}`} />
                  <span className={`text-xs font-bold tracking-wide ${healthConfig.text}`}>{healthConfig.label}</span>
                </div>
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Status</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-lg font-black text-slate-800 dark:text-white">{backups.length}</p>
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">Backups</p>
                </div>
                <div className="text-center border-x border-slate-200 dark:border-slate-700">
                  <p className="text-lg font-black text-slate-800 dark:text-white">{daysCovered}</p>
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">Days Covered</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-black text-slate-800 dark:text-white leading-tight">
                    {lastBackup ? formatRelativeTime(lastBackup.createdAt) : '—'}
                  </p>
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">Last Backup</p>
                </div>
              </div>
            </div>
          )}

          {/* Create Backup Button */}
          <button
            onClick={handleCreateBackup}
            disabled={creating || loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors disabled:opacity-60 shadow-md shadow-indigo-900/20"
          >
            {creating ? (
              <><Loader2 size={16} className="animate-spin" /> Creating Backup…</>
            ) : (
              <><HardDrive size={16} /> Create Backup Now</>
            )}
          </button>

          {/* Backup List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                Backup History
              </h3>
              <button
                onClick={loadBackups}
                disabled={loading}
                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                title="Refresh"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-14 gap-3">
                <Loader2 size={28} className="animate-spin text-indigo-500" />
                <p className="text-sm font-medium text-slate-400">Loading backups…</p>
              </div>
            )}

            {/* Error */}
            {!loading && error && (
              <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                <ServerCrash size={32} className="text-rose-400" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Could not load backups</p>
                <p className="text-xs text-slate-400">{error}</p>
                <button
                  onClick={loadBackups}
                  className="mt-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Empty State */}
            {!loading && !error && backups.length === 0 && (
              <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
                <ShieldCheck size={36} className="text-slate-300 dark:text-slate-700" />
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">No backups yet</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 max-w-[220px] leading-relaxed">
                  Your first automatic backup will run tonight. You can also create one manually above.
                </p>
              </div>
            )}

            {/* Backup Entries */}
            {!loading && !error && backups.length > 0 && (
              <div className="space-y-2">
                {backups.map((backup, index) => {
                  const isLatest = index === 0;
                  const isPreRestore = backup.note === 'pre-restore-snapshot';
                  const isManual = backup.note === 'manual';
                  const isAuto = backup.createdBy === 'system' || backup.createdBy === null;

                  return (
                    <div
                      key={backup.id}
                      className={`rounded-xl border p-3.5 transition-colors ${
                        isLatest
                          ? 'border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/60 dark:bg-indigo-950/20'
                          : 'border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {/* Date + badge row */}
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <div className="flex items-center gap-1.5">
                              <Calendar size={12} className="text-slate-400 shrink-0" />
                              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                                {formatDateTime(backup.createdAt)}
                              </span>
                            </div>
                            {isLatest && (
                              <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400">
                                Latest
                              </span>
                            )}
                            {isPreRestore && (
                              <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
                                Safety
                              </span>
                            )}
                          </div>

                          {/* Meta row */}
                          <div className="flex items-center gap-3 mt-1">
                            <div className="flex items-center gap-1">
                              <User size={10} className="text-slate-400" />
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                {isAuto ? 'Auto' : isManual ? 'You (manual)' : createdByLabel(backup.createdBy)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <HardDrive size={10} className="text-slate-400" />
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                {formatSize(backup.size)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock size={10} className="text-slate-400" />
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                {formatRelativeTime(backup.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Restore button */}
                        <button
                          onClick={() => setConfirmRestore(backup)}
                          className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400 dark:hover:border-amber-600 transition-colors"
                          title="Restore this backup"
                        >
                          <RotateCcw size={12} />
                          <span>Restore</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Info Footer */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 px-4 py-3 flex items-start gap-3">
            <Info size={13} className="text-slate-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
              Backups run automatically every 24 hours. Up to 7 days of history is kept. Restoring always creates a safety snapshot of your current data first.
            </p>
          </div>
        </div>
      </div>

      {/* Confirm Restore Modal */}
      {confirmRestore && (
        <ConfirmRestoreModal
          backup={confirmRestore}
          onConfirm={handleConfirmRestore}
          onCancel={() => setConfirmRestore(null)}
          isRestoring={isRestoring}
        />
      )}

      {/* Toast */}
      {toast && <Toast type={toast.type} message={toast.message} />}
    </>
  );
};

export default BackupStatus;
