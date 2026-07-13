// API client - replaces Electron IPC calls with REST API calls
import type { BackupEntry, RestoreResult, TrashEntry, TrashItemType } from './types';

const API_BASE = '/api';
const AUTH_TOKEN_KEY = 'ledger_auth_token';

let authToken = localStorage.getItem(AUTH_TOKEN_KEY) || '';

function setAuthToken(token: string) {
  authToken = token;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function clearAuthToken() {
  authToken = '';
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

async function apiFetch(url: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    clearAuthToken();
  }
  return res;
}

export const api = {
  hasToken() {
    return !!authToken;
  },

  async login(username: string, password: string) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    if (!res.ok || !data?.success || !data?.token) {
      throw new Error(data?.error || 'Login failed');
    }

    setAuthToken(data.token);
    return data.user;
  },

  async getCurrentUser() {
    const res = await apiFetch(`${API_BASE}/auth/me`);
    if (!res.ok) throw new Error('Unauthorized');
    const data = await res.json();
    return data.user;
  },

  async getPresenceUsers() {
    const res = await apiFetch(`${API_BASE}/presence/users`);
    if (res.status === 401) throw new Error('Unauthorized');
    if (!res.ok) throw new Error('Failed to load active users');
    const data = await res.json();
    return {
      users: data.users || [],
      onlineWindowSeconds: Number(data.onlineWindowSeconds || 120),
    };
  },

  async logout() {
    try {
      if (authToken) {
        await apiFetch(`${API_BASE}/auth/logout`, { method: 'POST' });
      }
    } finally {
      clearAuthToken();
    }
  },

  async adminListUsers() {
    const res = await apiFetch(`${API_BASE}/admin/users`);
    if (res.status === 401) throw new Error('Unauthorized');
    if (res.status === 403) throw new Error('Forbidden');
    if (!res.ok) throw new Error('Failed to fetch users');
    const data = await res.json();
    return data.users || [];
  },

  async adminCreateUser(payload: {
    username: string;
    password: string;
    displayName: string;
    projectName: string;
    role?: 'admin' | 'user';
  }) {
    const res = await apiFetch(`${API_BASE}/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new Error('Unauthorized');
    if (res.status === 403) throw new Error('Forbidden');
    const data = await res.json();
    if (!res.ok || !data?.success) {
      throw new Error(data?.error || 'Failed to create user');
    }
    return data.user;
  },

  async adminUpdateUser(
    userId: string,
    payload: Partial<{
      displayName: string;
      projectName: string;
      role: 'admin' | 'user';
      isActive: boolean;
      password: string;
    }>
  ) {
    const res = await apiFetch(`${API_BASE}/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new Error('Unauthorized');
    if (res.status === 403) throw new Error('Forbidden');
    const data = await res.json();
    if (!res.ok || !data?.success) {
      throw new Error(data?.error || 'Failed to update user');
    }
    return data.user;
  },

  async getAppData() {
    const res = await apiFetch(`${API_BASE}/data`);
    if (res.status === 401) throw new Error('Unauthorized');
    if (!res.ok) throw new Error('Failed to load data');
    return res.json();
  },

  async saveAppData(state: { customers: any[]; transactions: any[]; banks: any[] }) {
    const res = await apiFetch(`${API_BASE}/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    if (res.status === 401) throw new Error('Unauthorized');
    if (!res.ok) throw new Error('Failed to save data');
    return res.json();
  },

  async downloadBackup() {
    const res = await apiFetch(`${API_BASE}/backup`);
    if (res.status === 401) throw new Error('Unauthorized');
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
    const res = await apiFetch(`${API_BASE}/restore`, {
      method: 'POST',
      body: formData,
    });
    if (res.status === 401) throw new Error('Unauthorized');
    return res.json();
  },

  async uploadAttachment(file: File): Promise<{ id: string; name: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiFetch(`${API_BASE}/attachments`, {
      method: 'POST',
      body: formData,
    });
    if (res.status === 401) throw new Error('Unauthorized');
    const data = await res.json();
    if (!res.ok || !data?.success) {
      throw new Error(data?.error || 'Failed to upload file');
    }
    return { id: data.id, name: data.name };
  },

  async downloadAttachment(id: string, name: string) {
    const res = await apiFetch(`${API_BASE}/attachments/${encodeURIComponent(id)}`);
    if (res.status === 401) throw new Error('Unauthorized');
    if (!res.ok) throw new Error('Failed to download file');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  },

  // --- Server-side backup management (user self-service) ---

  async listMyBackups(): Promise<BackupEntry[]> {
    const res = await apiFetch(`${API_BASE}/backups`);
    if (res.status === 401) throw new Error('Unauthorized');
    if (!res.ok) throw new Error('Failed to list backups');
    const data = await res.json();
    return (data.backups || []) as BackupEntry[];
  },

  async createMyBackup(note?: string): Promise<BackupEntry> {
    const res = await apiFetch(`${API_BASE}/backups/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: note || 'manual' }),
    });
    if (res.status === 401) throw new Error('Unauthorized');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || 'Failed to create backup');
    }
    const data = await res.json();
    return data.backup as BackupEntry;
  },

  async restoreMyBackup(backupId: string): Promise<RestoreResult> {
    const res = await apiFetch(`${API_BASE}/backups/${encodeURIComponent(backupId)}/restore`, {
      method: 'POST',
    });
    if (res.status === 401) throw new Error('Unauthorized');
    if (res.status === 404) throw new Error('Backup not found');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || 'Failed to restore backup');
    }
    return res.json() as Promise<RestoreResult>;
  },

  // --- Trash (soft-delete) ---

  async moveToTrash(itemType: TrashItemType, itemId: string, itemData: any, label?: string): Promise<TrashEntry> {
    const res = await apiFetch(`${API_BASE}/trash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemType, itemId, itemData, label }),
    });
    if (res.status === 401) throw new Error('Unauthorized');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || 'Failed to move item to trash');
    }
    const data = await res.json();
    return data.item as TrashEntry;
  },

  async listTrash(): Promise<{ items: TrashEntry[]; retentionDays: number }> {
    const res = await apiFetch(`${API_BASE}/trash`);
    if (res.status === 401) throw new Error('Unauthorized');
    if (!res.ok) throw new Error('Failed to load trash');
    const data = await res.json();
    return { items: (data.items || []) as TrashEntry[], retentionDays: Number(data.retentionDays || 30) };
  },

  async restoreFromTrash(trashId: string): Promise<{ success: boolean; itemType: TrashItemType; itemId: string; itemData: any }> {
    const res = await apiFetch(`${API_BASE}/trash/${encodeURIComponent(trashId)}/restore`, {
      method: 'POST',
    });
    if (res.status === 401) throw new Error('Unauthorized');
    if (res.status === 404) throw new Error('Trash item not found');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || 'Failed to restore item');
    }
    return res.json();
  },

  async deleteFromTrash(trashId: string): Promise<{ success: boolean }> {
    const res = await apiFetch(`${API_BASE}/trash/${encodeURIComponent(trashId)}`, {
      method: 'DELETE',
    });
    if (res.status === 401) throw new Error('Unauthorized');
    if (res.status === 404) throw new Error('Trash item not found');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || 'Failed to permanently delete item');
    }
    return res.json();
  },
};
