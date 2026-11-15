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

function getSessionSecret() {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  try {
    if (fs.existsSync(SECRET_PATH)) {
      const existingSecret = fs.readFileSync(SECRET_PATH, 'utf8').trim();
      if (existingSecret.length >= 32) return existingSecret;
    }
  } catch (readError) {
    console.warn('Unable to read existing session secret file; generating a new secret:', readError.message);
  }
  const generatedSecret = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(SECRET_PATH, generatedSecret, { mode: 0o600 });
  } catch (writeError) {
    console.warn('Unable to persist session secret file (using process-scoped key):', writeError.message);
  }
  return generatedSecret;
}

const SESSION_SECRET = getSessionSecret();
const HASH_KEY = crypto.createHmac('sha256', SESSION_SECRET).update('pacemark-lookup-hash').digest();
const CIPHER_KEY = crypto.createHmac('sha256', SESSION_SECRET).update('pacemark-data-seal').digest();

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL UNIQUE,
    username_hash TEXT,
    username_enc TEXT,
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
    data_hash TEXT,
    payload_enc TEXT,
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
    topic_breakdown_json TEXT NOT NULL DEFAULT '[]',
    question_logs_json TEXT NOT NULL DEFAULT '[]',
    data_hash TEXT,
    payload_enc TEXT,
    completed_at TEXT NOT NULL
  );
`);

export function hashLookupValue(rawValue) {
  return crypto
    .createHmac('sha256', HASH_KEY)
    .update(String(rawValue).trim().toLowerCase())
    .digest('hex');
}

export function hashIntegrityPayload(payloadString) {
  return crypto
    .createHmac('sha256', HASH_KEY)
    .update(String(payloadString))
    .digest('hex');
}

function verifyIntegrityHash(payloadString, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false;
  const expectedHash = hashIntegrityPayload(payloadString);
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  const storedBuffer = Buffer.from(storedHash, 'hex');
  if (expectedBuffer.length === 0 || expectedBuffer.length !== storedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, storedBuffer);
}

function sealText(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', CIPHER_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function unsealText(sealedPayload, recordLabel = 'record') {
  if (!sealedPayload || typeof sealedPayload !== 'string') return null;
  const segments = sealedPayload.split(':');
  if (segments.length !== 3) return null;
  try {
    const [ivHex, tagHex, encryptedHex] = segments;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      CIPHER_KEY,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (decryptError) {
    console.warn(`Failed to unseal encrypted ${recordLabel}:`, decryptError.message);
    return null;
  }
}

function ensureSchemaColumns() {
  const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((column) => column.name));
  if (!userColumns.has('username_hash')) {
    db.exec('ALTER TABLE users ADD COLUMN username_hash TEXT');
  }
  if (!userColumns.has('username_enc')) {
    db.exec('ALTER TABLE users ADD COLUMN username_enc TEXT');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_username_hash ON users (username_hash)');

  const paperColumns = new Set(db.prepare('PRAGMA table_info(user_papers)').all().map((column) => column.name));
  if (!paperColumns.has('data_hash')) {
    db.exec('ALTER TABLE user_papers ADD COLUMN data_hash TEXT');
  }
  if (!paperColumns.has('payload_enc')) {
    db.exec('ALTER TABLE user_papers ADD COLUMN payload_enc TEXT');
  }

  const resultColumns = new Set(db.prepare('PRAGMA table_info(exam_results)').all().map((column) => column.name));
  if (!resultColumns.has('topic_breakdown_json')) {
    db.exec(`ALTER TABLE exam_results ADD COLUMN topic_breakdown_json TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!resultColumns.has('question_logs_json')) {
    db.exec(`ALTER TABLE exam_results ADD COLUMN question_logs_json TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!resultColumns.has('data_hash')) {
    db.exec('ALTER TABLE exam_results ADD COLUMN data_hash TEXT');
  }
  if (!resultColumns.has('payload_enc')) {
    db.exec('ALTER TABLE exam_results ADD COLUMN payload_enc TEXT');
  }
}

function migrateExistingRowsToHashes() {
  const userRows = db
    .prepare('SELECT id, username, username_lower, username_hash, username_enc FROM users')
    .all();

  const updateUserStatement = db.prepare(
    'UPDATE users SET username = ?, username_lower = ?, username_hash = ?, username_enc = ? WHERE id = ?',
  );

  for (const userRow of userRows) {
    if (!userRow.username_hash || !userRow.username_enc) {
      const displayUsername = String(userRow.username || userRow.username_lower || 'student').trim();
      const usernameHash = hashLookupValue(displayUsername);
      const encryptedUsername = sealText(displayUsername);
      const maskedLabel = `hashed:${usernameHash.slice(0, 16)}`;
      updateUserStatement.run(maskedLabel, usernameHash, usernameHash, encryptedUsername, userRow.id);
    }
  }

  const paperRows = db
    .prepare(
      'SELECT id, title, page_count, extracted_text, questions_json, needs_ocr, data_hash, payload_enc FROM user_papers',
    )
    .all();

  const updatePaperStatement = db.prepare(
    `UPDATE user_papers
     SET title = ?, extracted_text = '', questions_json = '[]', data_hash = ?, payload_enc = ?
     WHERE id = ?`,
  );

  for (const paperRow of paperRows) {
    if (!paperRow.data_hash || !paperRow.payload_enc) {
      let parsedQuestions = [];
      try {
        parsedQuestions = JSON.parse(paperRow.questions_json || '[]');
      } catch (parseError) {
        console.warn(`Invalid questions_json while migrating paper ${paperRow.id}:`, parseError.message);
        parsedQuestions = [];
      }
      const canonicalPayload = JSON.stringify({
        title: paperRow.title,
        pageCount: paperRow.page_count,
        extractedText: paperRow.extracted_text || '',
        needsOcr: Boolean(paperRow.needs_ocr),
        questions: Array.isArray(parsedQuestions) ? parsedQuestions : [],
      });
      const dataHash = hashIntegrityPayload(canonicalPayload);
      const sealedPayload = sealText(canonicalPayload);
      updatePaperStatement.run(`hashed:${dataHash.slice(0, 16)}`, dataHash, sealedPayload, paperRow.id);
    }
  }

  const resultRows = db
    .prepare(
      `SELECT id, paper_title, score_percent, avg_time_label, questions_answered,
              total_questions, summary, topic_scores_json, topic_breakdown_json,
              question_logs_json, data_hash, payload_enc
       FROM exam_results`,
    )
    .all();

  const updateResultStatement = db.prepare(
    `UPDATE exam_results
     SET paper_title = ?, avg_time_label = 'hashed', summary = '',
         topic_scores_json = '{}', topic_breakdown_json = '[]',
         question_logs_json = '[]', data_hash = ?, payload_enc = ?
     WHERE id = ?`,
  );

  for (const resultRow of resultRows) {
    if (!resultRow.data_hash || !resultRow.payload_enc) {
      let topicBreakdown = [];
      let questionLogs = [];
      try {
        const parsedBreakdown = JSON.parse(resultRow.topic_breakdown_json || '[]');
        if (Array.isArray(parsedBreakdown)) topicBreakdown = parsedBreakdown;
      } catch (parseError) {
        console.warn(`Invalid topic_breakdown_json while migrating result ${resultRow.id}:`, parseError.message);
      }
      try {
        const parsedLogs = JSON.parse(resultRow.question_logs_json || '[]');
        if (Array.isArray(parsedLogs)) questionLogs = parsedLogs;
      } catch (parseError) {
        console.warn(`Invalid question_logs_json while migrating result ${resultRow.id}:`, parseError.message);
      }
      const canonicalPayload = JSON.stringify({
        paperTitle: resultRow.paper_title,
        scorePercent: resultRow.score_percent,
        avgTimeLabel: resultRow.avg_time_label,
        questionsAnswered: resultRow.questions_answered,
        totalQuestions: resultRow.total_questions,
        summary: resultRow.summary,
        topicBreakdown,
        questionLogs,
      });
      const dataHash = hashIntegrityPayload(canonicalPayload);
      const sealedPayload = sealText(canonicalPayload);
      updateResultStatement.run(`hashed:${dataHash.slice(0, 16)}`, dataHash, sealedPayload, resultRow.id);
    }
  }
}

ensureSchemaColumns();
migrateExistingRowsToHashes();

export function sanitizePlainText(inputText, maxLength = 2500) {
  return String(inputText || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/[<>]/g, '')
    .slice(0, maxLength);
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

export function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split(':');
  if (parts.length !== 2) return false;
  const [salt, storedKeyHex] = parts;
  const storedKeyBuffer = Buffer.from(storedKeyHex, 'hex');
  const derivedKeyBuffer = crypto.scryptSync(password, salt, 64);
  if (storedKeyBuffer.length !== derivedKeyBuffer.length) return false;
  return crypto.timingSafeEqual(storedKeyBuffer, derivedKeyBuffer);
}

export function createSessionToken(userId) {
  const expiresAtMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const encodedPayload = Buffer.from(JSON.stringify({ uid: userId, exp: expiresAtMs })).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(encodedPayload).digest('base64url');
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }
  try {
    const tokenPayload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!tokenPayload.uid || !tokenPayload.exp || Date.now() > tokenPayload.exp) return null;
    return tokenPayload.uid;
  } catch (parseError) {
    console.warn('Invalid session token payload:', parseError.message);
    return null;
  }
}

function toPublicUser(userRow) {
  const displayUsername = unsealText(userRow.username_enc, `user ${userRow.id}`) || userRow.username;
  return {
    id: userRow.id,
    username: displayUsername,
    status: userRow.status,
    createdAt: userRow.created_at,
    lastLoginAt: userRow.last_login_at,
  };
}

export function createUser(username, password) {
  const trimmedUsername = username.trim();
  const usernameHash = hashLookupValue(trimmedUsername);
  const existingUser = db
    .prepare('SELECT id FROM users WHERE username_hash = ? OR username_lower = ?')
    .get(usernameHash, usernameHash);
  if (existingUser) {
    throw new Error('USERNAME_EXISTS');
  }

  const createdAt = new Date().toISOString();
  const userId = `usr-${crypto.randomUUID()}`;
  const passwordHash = hashPassword(password);
  const encryptedUsername = sealText(trimmedUsername);
  const hashedDisplayMarker = `hashed:${usernameHash.slice(0, 16)}`;

  db.prepare(
    `INSERT INTO users (
      id, username, username_lower, username_hash, username_enc,
      password_hash, role, status, created_at, last_login_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'user', 'active', ?, ?)`,
  ).run(userId, hashedDisplayMarker, usernameHash, usernameHash, encryptedUsername, passwordHash, createdAt, createdAt);

  const insertedRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  return toPublicUser(insertedRow);
}

export function authenticateUser(username, password) {
  const usernameHash = hashLookupValue(username);
  const userRow = db
    .prepare('SELECT * FROM users WHERE username_hash = ? OR username_lower = ?')
    .get(usernameHash, usernameHash);
  if (!userRow) return null;
  if (!verifyPassword(password, userRow.password_hash)) return null;
  if (userRow.status === 'suspended') return 'SUSPENDED';

  const loginTimestamp = new Date().toISOString();
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(loginTimestamp, userRow.id);
  return { ...toPublicUser(userRow), lastLoginAt: loginTimestamp };
}

export function checkUsernameEligibility(username) {
  const trimmedUsername = String(username || '').trim();
  if (!trimmedUsername) {
    return { exists: false, eligible: false, reason: 'NOT_FOUND' };
  }

  const usernameHash = hashLookupValue(trimmedUsername);
  const userRow = db
    .prepare('SELECT id, username, username_enc, status FROM users WHERE username_hash = ? OR username_lower = ?')
    .get(usernameHash, usernameHash);

  if (!userRow) {
    return { exists: false, eligible: false, reason: 'NOT_FOUND' };
  }
  if (userRow.status === 'suspended') {
    return { exists: true, eligible: false, reason: 'SUSPENDED' };
  }

  return {
    exists: true,
    eligible: true,
    canonicalUsername: unsealText(userRow.username_enc, `user ${userRow.id}`) || trimmedUsername,
  };
}

export function getUserById(userId) {
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  return userRow ? toPublicUser(userRow) : null;
}

export function getUserPapers(userId) {
  const paperRows = db
    .prepare('SELECT * FROM user_papers WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId);

  const papers = [];
  for (const paperRow of paperRows) {
    if (!paperRow.payload_enc || !paperRow.data_hash) {
      console.warn(`Skipping paper ${paperRow.id}: missing encrypted payload or integrity hash.`);
      continue;
    }
    const unsealedPayload = unsealText(paperRow.payload_enc, `paper ${paperRow.id}`);
    if (!unsealedPayload || !verifyIntegrityHash(unsealedPayload, paperRow.data_hash)) {
      console.warn(`Skipping paper ${paperRow.id}: integrity check failed.`);
      continue;
    }
    try {
      const parsedPaper = JSON.parse(unsealedPayload);
      papers.push({
        id: paperRow.id,
        title: parsedPaper.title,
        pageCount: parsedPaper.pageCount ?? 0,
        extractedText: parsedPaper.extractedText ?? '',
        needsOcr: Boolean(parsedPaper.needsOcr),
        questions: Array.isArray(parsedPaper.questions) ? parsedPaper.questions : [],
        createdAt: paperRow.created_at,
      });
    } catch (parseError) {
      console.warn(`Skipping paper ${paperRow.id}: invalid JSON payload (${parseError.message}).`);
    }
  }
  return papers;
}

export function saveUserPaper(userId, paperInput) {
  const paperId = paperInput.id || `paper-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  const canonicalPayload = JSON.stringify({
    title: paperInput.title,
    pageCount: paperInput.pageCount ?? 0,
    extractedText: paperInput.extractedText ?? '',
    needsOcr: Boolean(paperInput.needsOcr),
    questions: paperInput.questions || [],
  });
  const dataHash = hashIntegrityPayload(canonicalPayload);
  const sealedPayload = sealText(canonicalPayload);

  db.prepare(
    `INSERT INTO user_papers (
      id, user_id, title, page_count, extracted_text, questions_json,
      needs_ocr, data_hash, payload_enc, created_at
    ) VALUES (?, ?, ?, ?, '', '[]', ?, ?, ?, ?)`,
  ).run(
    paperId,
    userId,
    `hashed:${dataHash.slice(0, 16)}`,
    paperInput.pageCount ?? 0,
    paperInput.needsOcr ? 1 : 0,
    dataHash,
    sealedPayload,
    createdAt,
  );

  return {
    id: paperId,
    title: paperInput.title,
    pageCount: paperInput.pageCount ?? 0,
    extractedText: paperInput.extractedText ?? '',
    needsOcr: Boolean(paperInput.needsOcr),
    questions: paperInput.questions || [],
    createdAt,
  };
}

export function getUserExamResults(userId) {
  const resultRows = db
    .prepare('SELECT * FROM exam_results WHERE user_id = ? ORDER BY completed_at DESC')
    .all(userId);

  const examResults = [];
  for (const resultRow of resultRows) {
    if (!resultRow.payload_enc || !resultRow.data_hash) {
      console.warn(`Skipping exam result ${resultRow.id}: missing encrypted payload or integrity hash.`);
      continue;
    }
    const unsealedPayload = unsealText(resultRow.payload_enc, `result ${resultRow.id}`);
    if (!unsealedPayload || !verifyIntegrityHash(unsealedPayload, resultRow.data_hash)) {
      console.warn(`Skipping exam result ${resultRow.id}: integrity check failed.`);
      continue;
    }
    try {
      const parsedResult = JSON.parse(unsealedPayload);
      examResults.push({
        id: resultRow.id,
        paperTitle: parsedResult.paperTitle,
        scorePercent: parsedResult.scorePercent,
        avgTimeLabel: parsedResult.avgTimeLabel,
        questionsAnswered: parsedResult.questionsAnswered,
        totalQuestions: parsedResult.totalQuestions,
        summary: parsedResult.summary,
        topicBreakdown: Array.isArray(parsedResult.topicBreakdown) ? parsedResult.topicBreakdown : [],
        questionLogs: Array.isArray(parsedResult.questionLogs) ? parsedResult.questionLogs : [],
        completedAt: resultRow.completed_at,
      });
    } catch (parseError) {
      console.warn(`Skipping exam result ${resultRow.id}: invalid JSON payload (${parseError.message}).`);
    }
  }
  return examResults;
}

export function saveUserExamResult(userId, resultInput) {
  const resultId = resultInput.id || `res-${crypto.randomUUID()}`;
  const completedAt = resultInput.completedAt || new Date().toISOString();
  const cleanTitle = sanitizePlainText(resultInput.paperTitle, 200);
  const cleanAvgTime = sanitizePlainText(resultInput.avgTimeLabel, 40);
  const cleanSummary = sanitizePlainText(resultInput.summary ?? '', 600);
  const cleanLogs = Array.isArray(resultInput.questionLogs)
    ? resultInput.questionLogs.map((questionLog) => ({
        ...questionLog,
        prompt: sanitizePlainText(questionLog.prompt || '', 500),
        answerText: sanitizePlainText(questionLog.answerText || '', 2500),
        topicCategory: sanitizePlainText(questionLog.topicCategory || 'General Specification', 100),
        confidence: Math.max(1, Math.min(5, Math.round(Number(questionLog.confidence ?? 3)))),
      }))
    : [];

  const topicBreakdown = Array.isArray(resultInput.topicBreakdown) ? resultInput.topicBreakdown : [];
  const canonicalObject = {
    paperTitle: cleanTitle,
    scorePercent: resultInput.scorePercent,
    avgTimeLabel: cleanAvgTime,
    questionsAnswered: resultInput.questionsAnswered ?? 0,
    totalQuestions: resultInput.totalQuestions ?? cleanLogs.length,
    summary: cleanSummary,
    topicBreakdown,
    questionLogs: cleanLogs,
  };
  const canonicalJson = JSON.stringify(canonicalObject);
  const dataHash = hashIntegrityPayload(canonicalJson);
  const sealedPayload = sealText(canonicalJson);

  db.prepare(
    `INSERT OR REPLACE INTO exam_results (
      id, user_id, paper_title, score_percent, avg_time_label,
      questions_answered, total_questions, summary, topic_scores_json,
      topic_breakdown_json, question_logs_json, data_hash, payload_enc, completed_at
    ) VALUES (?, ?, ?, ?, 'hashed', ?, ?, '', '{}', '[]', '[]', ?, ?, ?)`,
  ).run(
    resultId,
    userId,
    `hashed:${dataHash.slice(0, 16)}`,
    resultInput.scorePercent,
    resultInput.questionsAnswered ?? 0,
    resultInput.totalQuestions ?? cleanLogs.length,
    dataHash,
    sealedPayload,
    completedAt,
  );

  return {
    id: resultId,
    paperTitle: cleanTitle,
    scorePercent: resultInput.scorePercent,
    avgTimeLabel: cleanAvgTime,
    questionsAnswered: resultInput.questionsAnswered ?? 0,
    totalQuestions: resultInput.totalQuestions ?? cleanLogs.length,
    summary: cleanSummary,
    topicBreakdown,
    questionLogs: cleanLogs,
    completedAt,
  };
}
