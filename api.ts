// API client - replaces Electron IPC calls with REST API calls
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
};
