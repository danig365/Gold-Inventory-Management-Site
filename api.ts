// API client - replaces Electron IPC calls with REST API calls
const API_BASE = '/api';

export const api = {
  async getAppData() {
    const res = await fetch(`${API_BASE}/data`);
    if (!res.ok) throw new Error('Failed to load data');
    return res.json();
  },

  async saveAppData(state: { customers: any[]; transactions: any[]; banks: any[] }) {
    const res = await fetch(`${API_BASE}/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    if (!res.ok) throw new Error('Failed to save data');
    return res.json();
  },

  async downloadBackup() {
    const res = await fetch(`${API_BASE}/backup`);
    if (!res.ok) throw new Error('Failed to create backup');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `haroon-backup-${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  async restoreBackup(file: File): Promise<{ success: boolean; data?: any; error?: string }> {
    const formData = new FormData();
    formData.append('backup', file);
    const res = await fetch(`${API_BASE}/restore`, {
      method: 'POST',
      body: formData,
    });
    return res.json();
  },
};
