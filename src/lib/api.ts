import { ActivePaper } from '../components/PaperSession';
import { CompletedPaperResult } from '../components/PerformanceReport';

export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'suspended';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuthSessionPayload {
  user: AuthUser | null;
  token?: string;
  papers: ActivePaper[];
  history: CompletedPaperResult[];
}

export interface UsernameCheckPayload {
  exists: boolean;
  eligible: boolean;
  reason?: 'NOT_FOUND' | 'NOT_ADMIN' | 'SUSPENDED';
  canonicalUsername?: string;
}

export interface AdminOverviewMetrics {
  totalUsers: number;
  activeStudents: number;
  totalExams: number;
  totalPapers: number;
}

export interface AdminUserSummary extends AuthUser {
  examCount: number;
  paperCount: number;
  avgScore: number | null;
}

export interface AdminUserDetail {
  user: AuthUser;
  examHistory: CompletedPaperResult[];
  papers: Array<ActivePaper & { createdAt?: string }>;
}

export interface AuthAuditLogEntry {
  id: string;
  userId: string;
  username: string;
  role: UserRole;
  eventType: 'signup' | 'login';
  occurredAt: string;
}

const TOKEN_STORAGE_KEY = 'pacemark_session_token';

export function getStoredAuthToken(): string | null {
  try {
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredAuthToken(token: string | null) {
  try {
    if (token) {
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction errors
  }
}

export function getAuthHeaders(): Record<string, string> {
  const token = getStoredAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...getAuthHeaders(),
    ...(init.headers as Record<string, string> | undefined),
  };

  if (init.body && typeof init.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}
