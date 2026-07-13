import React, { useEffect, useState } from 'react';
import { TrashEntry } from '../types';
import { api } from '../api';
import { Trash2, RotateCcw, Users, Landmark, Receipt, AlertTriangle, Inbox, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface TrashProps {
  onRestore: (entry: TrashEntry) => Promise<void>;
}

const ITEM_ICONS: Record<TrashEntry['itemType'], React.ElementType> = {
  customer: Users,
  bank: Landmark,
  transaction: Receipt,
};

const ITEM_LABELS: Record<TrashEntry['itemType'], string> = {
  customer: 'Customer',
  bank: 'Bank Account',
  transaction: 'Transaction',
};

const Trash: React.FC<TrashProps> = ({ onRestore }) => {
  const [items, setItems] = useState<TrashEntry[]>([]);
  const [retentionDays, setRetentionDays] = useState(30);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<TrashEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadTrash = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { items: list, retentionDays: days } = await api.listTrash();
      setItems(list);
      setRetentionDays(days);
    } catch (err) {
      setError((err as Error).message || 'Failed to load trash');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTrash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const daysLeft = (deletedAt: string): number => {
    const elapsedMs = Date.now() - new Date(deletedAt).getTime();
    const elapsedDays = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
    return Math.max(0, retentionDays - elapsedDays);
  };

  const handleRestore = async (entry: TrashEntry) => {
    setRestoringId(entry.id);
    try {
      await onRestore(entry);
      setItems(prev => prev.filter(i => i.id !== entry.id));
    } catch (err) {
      alert('Failed to restore: ' + (err as Error).message);
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async () => {
    if (!deletingEntry) return;
    setIsDeleting(true);
    try {
      await api.deleteFromTrash(deletingEntry.id);
      setItems(prev => prev.filter(i => i.id !== deletingEntry.id));
      setDeletingEntry(null);
    } catch (err) {
      alert('Failed to permanently delete: ' + (err as Error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-5 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
          <Clock size={20} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-gray-800 dark:text-slate-100">Items are kept for {retentionDays} days</h2>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            Deleted customers, bank accounts, and transactions land here first. Restore them anytime, or they will be permanently removed automatically once their time runs out.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-gray-400 dark:text-slate-500 text-sm font-medium">Loading trash...</div>
      ) : error ? (
        <div className="text-center py-20 text-rose-500 text-sm font-medium">{error}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-24 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800">
          <Inbox size={40} className="mx-auto text-gray-300 dark:text-slate-700 mb-3" />
          <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">Trash is empty</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800/60 text-gray-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Type</th>
                <th className="px-4 py-3 text-left font-semibold">Item</th>
                <th className="px-4 py-3 text-left font-semibold">Deleted On</th>
                <th className="px-4 py-3 text-left font-semibold">Time Left</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {items.map(entry => {
                const Icon = ITEM_ICONS[entry.itemType];
                const remaining = daysLeft(entry.deletedAt);
                const isUrgent = remaining <= 3;
                return (
                  <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300">
                        <Icon size={14} />
                        {ITEM_LABELS[entry.itemType]}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-slate-200">{entry.label || entry.itemId}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-slate-400">{format(new Date(entry.deletedAt), 'dd/MM/yyyy HH:mm')}</td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${isUrgent ? 'text-rose-600 dark:text-rose-400' : 'text-gray-600 dark:text-slate-300'}`}>
                        {remaining === 0 ? 'Expires today' : `${remaining} day${remaining === 1 ? '' : 's'} left`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleRestore(entry)}
                          disabled={restoringId === entry.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                        >
                          <RotateCcw size={13} />
                          {restoringId === entry.id ? 'Restoring...' : 'Restore'}
                        </button>
                        <button
                          onClick={() => setDeletingEntry(entry)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 text-xs font-semibold hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
                        >
                          <Trash2 size={13} />
                          Delete Forever
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {deletingEntry && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-[340px] w-full p-8 shadow-2xl text-center animate-in zoom-in duration-200 border border-gray-100 dark:border-slate-800">
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-600 dark:text-rose-400">
              <AlertTriangle size={32} />
            </div>
            <h3 className="font-display text-xl font-semibold mb-1 tracking-tight text-gray-800 dark:text-slate-100">Delete Forever?</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-8 font-medium px-2">
              "{deletingEntry.label || deletingEntry.itemId}" will be permanently removed and cannot be recovered.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDeletingEntry(null)} className="py-3 text-sm font-semibold text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-800 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 transition-all">Cancel</button>
              <button
                onClick={handlePermanentDelete}
                disabled={isDeleting}
                className="py-3 bg-rose-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-rose-100 dark:shadow-rose-900/20 hover:bg-rose-700 active:scale-95 transition-all disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Trash;
