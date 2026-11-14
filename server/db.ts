import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'pacemark.db');
const SECRET_PATH = path.join(DATA_DIR, '.session_secret');

fs.mkdirSync(DATA_DIR, { recursive: true });

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  try {
    if (fs.existsSync(SECRET_PATH)) {
      const existing = fs.readFileSync(SECRET_PATH, 'utf8').trim();
      if (existing.length >= 32) return existing;
    }
  } catch {
    // Fall through to generate secret
  }
  const generated = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(SECRET_PATH, generated, { mode: 0o600 });
  } catch {
    // Ignore write failure on read-only paths
  }
  return generated;
}

const SESSION_SECRET = getSessionSecret();

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'admin')) DEFAULT 'user',
    status TEXT NOT NULL CHECK (status IN ('active', 'suspended')) DEFAULT 'active',
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS user_papers (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    page_count INTEGER NOT NULL DEFAULT 0,
    extracted_text TEXT NOT NULL DEFAULT '',
    questions_json TEXT NOT NULL DEFAULT '[]',
    needs_ocr INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exam_results (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    paper_title TEXT NOT NULL,
    score_percent INTEGER NOT NULL,
    avg_time_label TEXT NOT NULL,
    questions_answered INTEGER NOT NULL DEFAULT 0,
    total_questions INTEGER NOT NULL DEFAULT 5,
    summary TEXT NOT NULL DEFAULT '',
    topic_scores_json TEXT NOT NULL DEFAULT '{}',
    completed_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
    event_type TEXT NOT NULL CHECK (event_type IN ('signup', 'login')),
    occurred_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_auth_audit_occurred_at
    ON auth_audit_logs (occurred_at DESC);
`);

function ensureExamResultsColumns() {
  const cols = db.prepare('PRAGMA table_info(exam_results)').all() as Array<{ name: string }>;
  const existing = new Set(cols.map((c) => c.name));
  if (!existing.has('topic_breakdown_json')) {
    db.exec(`ALTER TABLE exam_results ADD COLUMN topic_breakdown_json TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!existing.has('question_logs_json')) {
    db.exec(`ALTER TABLE exam_results ADD COLUMN question_logs_json TEXT NOT NULL DEFAULT '[]'`);
  }
}

ensureExamResultsColumns();

export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'suspended';

export interface PublicUser {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string | null;
}

interface UserRow {
  id: string;
  username: string;
  username_lower: string;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  last_login_at: string | null;
}

export interface StoredPaper {
  id: string;
  title: string;
  pageCount: number;
  extractedText: string;
  needsOcr: boolean;
  questions: Array<{
    questionNumber?: string;
    stemContext?: string;
    prompt: string;
    marks: number;
    recommendedTimeSeconds?: number;
    topicCategory?: string;
    rubricKeywords?: string[];
    page?: number;
  }>;
  createdAt: string;
}

export interface StoredTopicWeakness {
  topic: string;
  weaknessIndex: number;
  scorePercent: number;
  timeRatioPercent: number;
  avgTimeSeconds: number;
  avgRecommendedSeconds: number;
  marksAwarded: number;
  totalMarks: number;
  questionCount: number;
  status: 'Priority Revision' | 'Needs Pacing' | 'Strong';
  action: string;
}

export interface StoredQuestionLog {
  questionIndex: number;
  questionNumber?: string;
  prompt: string;
  topicCategory: string;
  answerText: string;
  marksAwarded: number;
  totalMarks: number;
  timeSpentSeconds: number;
  recommendedTimeSeconds: number;
  confidence: number;
}

export interface StoredExamResult {
  id: string;
  paperTitle: string;
  scorePercent: number;
  avgTimeLabel: string;
  questionsAnswered: number;
  totalQuestions: number;
  summary: string;
  topicScores: {
    computerSystems: number;
    dataStructures: number;
    softwareEngineering: number;
  };
  topicBreakdown?: StoredTopicWeakness[];
  questionLogs?: StoredQuestionLog[];
  completedAt: string;
}

export function sanitizePlainText(input: string, maxLen = 2500): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/[<>]/g, '')
    .slice(0, maxLen);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export function createSessionToken(userId: string): string {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid?: string;
      exp?: number;
    };
    if (!data.uid || !data.exp || Date.now() > data.exp) return null;
    return data.uid;
  } catch {
    return null;
  }
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

// Seed the requested admin account: username 'ziyan', password '1'
function seedAdminAccount() {
  const existing = db
    .prepare('SELECT id, role FROM users WHERE username_lower = ?')
    .get('ziyan') as { id: string; role: string } | undefined;

  if (!existing) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, username, username_lower, password_hash, role, status, created_at, last_login_at)
       VALUES (?, ?, ?, ?, 'admin', 'active', ?, NULL)`,
    ).run(`usr-admin-${crypto.randomUUID()}`, 'ziyan', 'ziyan', hashPassword('1'), now);
  } else if (existing.role !== 'admin') {
    db.prepare(`UPDATE users SET role = 'admin', status = 'active' WHERE id = ?`).run(existing.id);
  }
}

export interface AuthAuditLogEntry {
  id: string;
  userId: string;
  username: string;
  role: UserRole;
  eventType: 'signup' | 'login';
  occurredAt: string;
}

function recordAuditEvent(
  userId: string,
  username: string,
  role: UserRole,
  eventType: 'signup' | 'login',
  occurredAt: string,
) {
  db.prepare(
    `INSERT INTO auth_audit_logs (id, user_id, username, role, event_type, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(`aud-${crypto.randomUUID()}`, userId, username, role, eventType, occurredAt);
}

function backfillAuditLogs() {
  const users = db
    .prepare('SELECT id, username, role, created_at, last_login_at FROM users')
    .all() as Array<{
    id: string;
    username: string;
    role: UserRole;
    created_at: string;
    last_login_at: string | null;
  }>;

  const hasEventStmt = db.prepare(
    'SELECT 1 FROM auth_audit_logs WHERE user_id = ? AND event_type = ? LIMIT 1',
  );

  for (const u of users) {
    if (!hasEventStmt.get(u.id, 'signup')) {
      recordAuditEvent(u.id, u.username, u.role, 'signup', u.created_at);
    }
    if (u.last_login_at && !hasEventStmt.get(u.id, 'login')) {
      recordAuditEvent(u.id, u.username, u.role, 'login', u.last_login_at);
    }
  }
}

seedAdminAccount();
backfillAuditLogs();

export function createUser(username: string, password: string): PublicUser {
  const trimmed = username.trim();
  const lower = trimmed.toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE username_lower = ?').get(lower);
  if (existing) {
    throw new Error('USERNAME_EXISTS');
  }

  const now = new Date().toISOString();
  const id = `usr-${crypto.randomUUID()}`;
  const passwordHash = hashPassword(password);

  db.prepare(
    `INSERT INTO users (id, username, username_lower, password_hash, role, status, created_at, last_login_at)
     VALUES (?, ?, ?, ?, 'user', 'active', ?, ?)`,
  ).run(id, trimmed, lower, passwordHash, now, now);

  recordAuditEvent(id, trimmed, 'user', 'signup', now);

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow;
  return toPublicUser(row);
}

export function authenticateUser(username: string, password: string): PublicUser | 'SUSPENDED' | null {
  const lower = username.trim().toLowerCase();
  const row = db.prepare('SELECT * FROM users WHERE username_lower = ?').get(lower) as UserRow | undefined;
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  if (row.status === 'suspended') return 'SUSPENDED';

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, row.id);
  recordAuditEvent(row.id, row.username, row.role, 'login', now);
  return { ...toPublicUser(row), lastLoginAt: now };
}

export interface UsernameCheckResult {
  exists: boolean;
  eligible: boolean;
  reason?: 'NOT_FOUND' | 'NOT_ADMIN' | 'SUSPENDED';
  canonicalUsername?: string;
}

export function checkUsernameEligibility(
  username: string,
  scope: 'user' | 'admin',
): UsernameCheckResult {
  const lower = username.trim().toLowerCase();
  if (!lower) {
    return { exists: false, eligible: false, reason: 'NOT_FOUND' };
  }

  const row = db
    .prepare('SELECT username, role, status FROM users WHERE username_lower = ?')
    .get(lower) as { username: string; role: UserRole; status: UserStatus } | undefined;

  if (!row) {
    return { exists: false, eligible: false, reason: 'NOT_FOUND' };
  }
  if (row.status === 'suspended') {
    return { exists: true, eligible: false, reason: 'SUSPENDED' };
  }
  if (scope === 'admin' && row.role !== 'admin') {
    return { exists: true, eligible: false, reason: 'NOT_ADMIN' };
  }

  return {
    exists: true,
    eligible: true,
    canonicalUsername: row.username,
  };
}

export function getUserById(userId: string): PublicUser | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
  return row ? toPublicUser(row) : null;
}

export function getUserPapers(userId: string): StoredPaper[] {
  const rows = db
    .prepare('SELECT * FROM user_papers WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as Array<{
    id: string;
    title: string;
    page_count: number;
    extracted_text: string;
    questions_json: string;
    needs_ocr: number;
    created_at: string;
  }>;

  return rows.map((r) => {
    let parsedQuestions: StoredPaper['questions'] = [];
    try {
      parsedQuestions = JSON.parse(r.questions_json || '[]');
    } catch {
      parsedQuestions = [];
    }
    return {
      id: r.id,
      title: r.title,
      pageCount: r.page_count,
      extractedText: r.extracted_text,
      needsOcr: Boolean(r.needs_ocr),
      questions: Array.isArray(parsedQuestions) ? parsedQuestions : [],
      createdAt: r.created_at,
    };
  });
}

export function saveUserPaper(
  userId: string,
  paper: Omit<StoredPaper, 'id' | 'createdAt'> & { id?: string },
): StoredPaper {
  const id = paper.id || `paper-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO user_papers (id, user_id, title, page_count, extracted_text, questions_json, needs_ocr, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    paper.title,
    paper.pageCount,
    paper.extractedText,
    JSON.stringify(paper.questions || []),
    paper.needsOcr ? 1 : 0,
    createdAt,
  );

  return {
    id,
    title: paper.title,
    pageCount: paper.pageCount,
    extractedText: paper.extractedText,
    needsOcr: paper.needsOcr,
    questions: paper.questions || [],
    createdAt,
  };
}

export function getUserExamResults(userId: string): StoredExamResult[] {
  const rows = db
    .prepare('SELECT * FROM exam_results WHERE user_id = ? ORDER BY completed_at DESC')
    .all(userId) as Array<{
    id: string;
    paper_title: string;
    score_percent: number;
    avg_time_label: string;
    questions_answered: number;
    total_questions: number;
    summary: string;
    topic_scores_json: string;
    topic_breakdown_json: string;
    question_logs_json: string;
    completed_at: string;
  }>;

  return rows.map((r) => {
    let topicScores = { computerSystems: 72, dataStructures: 58, softwareEngineering: 91 };
    let topicBreakdown: StoredTopicWeakness[] = [];
    let questionLogs: StoredQuestionLog[] = [];
    try {
      const parsed = JSON.parse(r.topic_scores_json || '{}');
      if (typeof parsed.computerSystems === 'number') {
        topicScores = parsed;
      }
    } catch {
      // Keep default fallback
    }
    try {
      const parsedBreakdown = JSON.parse(r.topic_breakdown_json || '[]');
      if (Array.isArray(parsedBreakdown)) {
        topicBreakdown = parsedBreakdown;
      }
    } catch {
      // Ignore parse error
    }
    try {
      const parsedLogs = JSON.parse(r.question_logs_json || '[]');
      if (Array.isArray(parsedLogs)) {
        questionLogs = parsedLogs;
      }
    } catch {
      // Ignore parse error
    }
    return {
      id: r.id,
      paperTitle: r.paper_title,
      scorePercent: r.score_percent,
      avgTimeLabel: r.avg_time_label,
      questionsAnswered: r.questions_answered,
      totalQuestions: r.total_questions,
      summary: r.summary,
      topicScores,
      topicBreakdown,
      questionLogs,
      completedAt: r.completed_at,
    };
  });
}

export function saveUserExamResult(userId: string, result: StoredExamResult): StoredExamResult {
  const id = result.id || `res-${crypto.randomUUID()}`;
  const completedAt = result.completedAt || new Date().toISOString();
  const cleanSummary = sanitizePlainText(result.summary ?? '', 600);
  const cleanLogs = Array.isArray(result.questionLogs)
    ? result.questionLogs.map((q) => ({
        ...q,
        prompt: sanitizePlainText(q.prompt || '', 500),
        answerText: sanitizePlainText(q.answerText || '', 2500),
        topicCategory: sanitizePlainText(q.topicCategory || 'General Specification', 100),
        confidence: Math.max(1, Math.min(5, Math.round(Number(q.confidence ?? 3)))),
      }))
    : [];

  db.prepare(
    `INSERT OR REPLACE INTO exam_results (
      id, user_id, paper_title, score_percent, avg_time_label,
      questions_answered, total_questions, summary, topic_scores_json,
      topic_breakdown_json, question_logs_json, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    sanitizePlainText(result.paperTitle, 200),
    result.scorePercent,
    sanitizePlainText(result.avgTimeLabel, 40),
    result.questionsAnswered ?? 0,
    result.totalQuestions ?? 5,
    cleanSummary,
    JSON.stringify(result.topicScores ?? {}),
    JSON.stringify(result.topicBreakdown ?? []),
    JSON.stringify(cleanLogs),
    completedAt,
  );

  return {
    ...result,
    id,
    summary: cleanSummary,
    questionLogs: cleanLogs,
    completedAt,
  };
}

export interface AdminUserSummary extends PublicUser {
  examCount: number;
  paperCount: number;
  avgScore: number | null;
}

export interface AdminOverviewStats {
  totalUsers: number;
  activeStudents: number;
  totalExams: number;
  totalPapers: number;
}

export function listAllUsersForAdmin(): {
  overview: AdminOverviewStats;
  users: AdminUserSummary[];
} {
  const rows = db
    .prepare(
      `SELECT
        u.id, u.username, u.role, u.status, u.created_at, u.last_login_at,
        (SELECT COUNT(*) FROM exam_results e WHERE e.user_id = u.id) AS exam_count,
        (SELECT COUNT(*) FROM user_papers p WHERE p.user_id = u.id) AS paper_count,
        (SELECT ROUND(AVG(e.score_percent)) FROM exam_results e WHERE e.user_id = u.id) AS avg_score
      FROM users u
      ORDER BY CASE WHEN u.role = 'admin' THEN 0 ELSE 1 END, u.created_at DESC`,
    )
    .all() as Array<{
    id: string;
    username: string;
    role: UserRole;
    status: UserStatus;
    created_at: string;
    last_login_at: string | null;
    exam_count: number;
    paper_count: number;
    avg_score: number | null;
  }>;

  const users: AdminUserSummary[] = rows.map((r) => ({
    id: r.id,
    username: r.username,
    role: r.role,
    status: r.status,
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at,
    examCount: r.exam_count,
    paperCount: r.paper_count,
    avgScore: r.avg_score !== null ? Number(r.avg_score) : null,
  }));

  const overview: AdminOverviewStats = {
    totalUsers: users.length,
    activeStudents: users.filter((u) => u.role === 'user' && u.status === 'active').length,
    totalExams: users.reduce((sum, u) => sum + u.examCount, 0),
    totalPapers: users.reduce((sum, u) => sum + u.paperCount, 0),
  };

  return { overview, users };
}

export function getAdminUserDetail(userId: string) {
  const user = getUserById(userId);
  if (!user) return null;
  return {
    user,
    examHistory: getUserExamResults(userId),
    papers: getUserPapers(userId),
  };
}

export function updateUserRoleAndStatus(
  targetUserId: string,
  updates: { role?: UserRole; status?: UserStatus },
): PublicUser | null {
  const existing = getUserById(targetUserId);
  if (!existing) return null;

  const nextRole = updates.role ?? existing.role;
  const nextStatus = updates.status ?? existing.status;

  db.prepare('UPDATE users SET role = ?, status = ? WHERE id = ?').run(
    nextRole,
    nextStatus,
    targetUserId,
  );

  return getUserById(targetUserId);
}

export function listAuthAuditLogs(options?: {
  eventType?: 'signup' | 'login';
  query?: string;
  limit?: number;
}): AuthAuditLogEntry[] {
  const limit = Math.max(1, Math.min(250, options?.limit ?? 100));
  const rows = db
    .prepare(
      `SELECT
        a.id,
        a.user_id,
        a.username,
        COALESCE(u.role, a.role) AS role,
        a.event_type,
        a.occurred_at
      FROM auth_audit_logs a
      LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.occurred_at DESC
      LIMIT ?`,
    )
    .all(limit) as Array<{
    id: string;
    user_id: string;
    username: string;
    role: UserRole;
    event_type: 'signup' | 'login';
    occurred_at: string;
  }>;

  const q = options?.query?.trim().toLowerCase() ?? '';

  return rows
    .filter((r) => {
      if (options?.eventType && r.event_type !== options.eventType) return false;
      if (q && !r.username.toLowerCase().includes(q) && !r.user_id.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    })
    .map((r) => ({
      id: r.id,
      userId: r.user_id,
      username: r.username,
      role: r.role,
      eventType: r.event_type,
      occurredAt: r.occurred_at,
    }));
}
