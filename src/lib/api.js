const TOKEN_STORAGE_KEY = 'pacemark_session_token';

export function getStoredAuthToken() {
  try {
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch (storageError) {
    console.warn('Unable to read session token from storage:', storageError);
    return null;
  }
}

export function setStoredAuthToken(token) {
  try {
    if (token) {
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch (storageError) {
    console.warn('Unable to update session token in storage:', storageError);
  }
}

export function getAuthHeaders() {
  const token = getStoredAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiJson(url, requestInit = {}) {
  const headers = {
    ...getAuthHeaders(),
    ...(requestInit.headers || {}),
  };

  if (requestInit.body && typeof requestInit.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...requestInit,
    credentials: 'include',
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  let responseBody = {};
  if (contentType.includes('application/json')) {
    try {
      responseBody = await response.json();
    } catch (parseError) {
      console.warn(`Failed to parse JSON response from ${url}:`, parseError);
    }
  }

  if (!response.ok) {
    throw new Error(responseBody?.error || `Request failed (${response.status})`);
  }
  return responseBody;
}
