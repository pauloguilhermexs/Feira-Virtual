/**
 * Cliente de API centralizado com interceptação de tokens, refresh automático e estado de loading.
 */
export const API_BASE = '/api';

let activeRequests = 0;

function updateLoading(delta) {
  activeRequests = Math.max(0, activeRequests + delta);
  window.dispatchEvent(new CustomEvent('fv:loading', { detail: activeRequests > 0 }));
}

export const tokens = {
  get access() {
    return localStorage.getItem('fv_access_token');
  },
  set access(val) {
    if (val) localStorage.setItem('fv_access_token', val);
    else localStorage.removeItem('fv_access_token');
  },
  get refresh() {
    return localStorage.getItem('fv_refresh_token');
  },
  set refresh(val) {
    if (val) localStorage.setItem('fv_refresh_token', val);
    else localStorage.removeItem('fv_refresh_token');
  },
  clear() {
    localStorage.removeItem('fv_access_token');
    localStorage.removeItem('fv_refresh_token');
  },
};

let isRefreshing = false;
let failedQueue = [];

function processQueue(error, token = null) {
  failedQueue.forEach(prom => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
}

export async function refreshAccessToken() {
  const refreshToken = tokens.refresh;
  if (!refreshToken) throw new Error('Sem refresh token');

  const res = await fetch(`${API_BASE}/auth/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: refreshToken }),
  });

  if (!res.ok) {
    tokens.clear();
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const data = await res.json();
  tokens.access = data.access;
  if (data.refresh) tokens.refresh = data.refresh;
  return data.access;
}

export async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = { ...(options.headers || {}) };

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (tokens.access) {
    headers['Authorization'] = `Bearer ${tokens.access}`;
  }

  updateLoading(1);
  try {
    const res = await fetch(url, { ...options, headers });

    if (res.status === 401 && tokens.refresh && !options._retry && !endpoint.includes('/auth/')) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(newToken => {
          headers['Authorization'] = `Bearer ${newToken}`;
          return fetch(url, { ...options, headers });
        });
      }

      options._retry = true;
      isRefreshing = true;

      try {
        const newToken = await refreshAccessToken();
        isRefreshing = false;
        processQueue(null, newToken);
        headers['Authorization'] = `Bearer ${newToken}`;
        return await fetch(url, { ...options, headers });
      } catch (err) {
        isRefreshing = false;
        processQueue(err, null);
        window.dispatchEvent(new CustomEvent('fv:auth-expired'));
        return res;
      }
    }

    return res;
  } catch (err) {
    console.error(`Erro de conexão na rota ${endpoint}:`, err);
    throw err;
  } finally {
    updateLoading(-1);
  }
}

export async function parseError(response) {
  try {
    const data = await response.json();
    if (typeof data === 'string') return data;
    if (data.detail) return data.detail;
    if (data.erro) return data.erro;
    if (data.mensagem) return data.mensagem;
    if (Array.isArray(data.non_field_errors)) return data.non_field_errors[0];
    const firstKey = Object.keys(data)[0];
    if (firstKey) {
      const val = data[firstKey];
      return Array.isArray(val) ? `${firstKey}: ${val[0]}` : `${firstKey}: ${val}`;
    }
  } catch (_) {
    // Resposta não é JSON válido
  }
  return `Erro na requisição (${response.status})`;
}
