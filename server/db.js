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

function tableHasColumn(tableName, columnName) {
  const tableRows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return tableRows.some((columnInfo) => columnInfo.name === columnName);
}

function tableExists(tableName) {
  const match = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return Boolean(match);
}

function createNormalizedSchema() {
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

    CREATE INDEX IF NOT EXISTS idx_users_username_hash ON users (username_hash);

    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS user_papers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title_enc TEXT NOT NULL,
      extracted_text_enc TEXT NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 0,
      needs_ocr INTEGER NOT NULL DEFAULT 0,
      data_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_user_papers_user ON user_papers (user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS paper_questions (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL REFERENCES user_papers(id) ON DELETE CASCADE,
      topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
      question_order INTEGER NOT NULL,
      question_number TEXT NOT NULL,
      prompt_enc TEXT NOT NULL,
      marks INTEGER NOT NULL DEFAULT 2,
      recommended_time_seconds INTEGER NOT NULL DEFAULT 120,
      data_hash TEXT NOT NULL,
      UNIQUE (paper_id, question_order)
    );

    CREATE INDEX IF NOT EXISTS idx_paper_questions_paper ON paper_questions (paper_id, question_order);
    CREATE INDEX IF NOT EXISTS idx_paper_questions_topic ON paper_questions (topic_id);

    CREATE TABLE IF NOT EXISTS question_rubric_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id TEXT NOT NULL REFERENCES paper_questions(id) ON DELETE CASCADE,
      keyword_order INTEGER NOT NULL,
      keyword_enc TEXT NOT NULL,
      UNIQUE (question_id, keyword_order)
    );

    CREATE INDEX IF NOT EXISTS idx_question_rubric_keywords_question ON question_rubric_keywords (question_id, keyword_order);

    CREATE TABLE IF NOT EXISTS exam_results (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      paper_id TEXT REFERENCES user_papers(id) ON DELETE SET NULL,
      paper_title_enc TEXT NOT NULL,
      score_percent INTEGER NOT NULL,
      avg_time_label_enc TEXT NOT NULL,
      questions_answered INTEGER NOT NULL DEFAULT 0,
      total_questions INTEGER NOT NULL DEFAULT 5,
      summary_enc TEXT NOT NULL,
      data_hash TEXT NOT NULL,
      completed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_exam_results_user ON exam_results (user_id, completed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_exam_results_paper ON exam_results (paper_id);

    CREATE TABLE IF NOT EXISTS exam_topic_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      result_id TEXT NOT NULL REFERENCES exam_results(id) ON DELETE CASCADE,
      topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
      rank_order INTEGER NOT NULL,
      weakness_index REAL NOT NULL,
      score_percent INTEGER NOT NULL,
      time_ratio_percent INTEGER NOT NULL,
      avg_time_seconds INTEGER NOT NULL,
      avg_recommended_seconds INTEGER NOT NULL,
      marks_awarded INTEGER NOT NULL,
      total_marks INTEGER NOT NULL,
      question_count INTEGER NOT NULL,
      status TEXT NOT NULL,
      action_enc TEXT NOT NULL,
      data_hash TEXT NOT NULL,
      UNIQUE (result_id, topic_id)
    );

    CREATE INDEX IF NOT EXISTS idx_exam_topic_summaries_result ON exam_topic_summaries (result_id, rank_order);
    CREATE INDEX IF NOT EXISTS idx_exam_topic_summaries_topic ON exam_topic_summaries (topic_id);

    CREATE TABLE IF NOT EXISTS question_attempts (
      id TEXT PRIMARY KEY,
      result_id TEXT NOT NULL REFERENCES exam_results(id) ON DELETE CASCADE,
      paper_question_id TEXT REFERENCES paper_questions(id) ON DELETE SET NULL,
      topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
      question_index INTEGER NOT NULL,
      question_number TEXT NOT NULL,
      prompt_enc TEXT NOT NULL,
      answer_text_enc TEXT NOT NULL,
      marks_awarded INTEGER NOT NULL,
      total_marks INTEGER NOT NULL,
      time_spent_seconds INTEGER NOT NULL,
      recommended_time_seconds INTEGER NOT NULL,
      confidence INTEGER,
      data_hash TEXT NOT NULL,
      UNIQUE (result_id, question_index)
    );

    CREATE INDEX IF NOT EXISTS idx_question_attempts_result ON question_attempts (result_id, question_index);
    CREATE INDEX IF NOT EXISTS idx_question_attempts_topic ON question_attempts (topic_id);
    CREATE INDEX IF NOT EXISTS idx_question_attempts_paper_question ON question_attempts (paper_question_id);

    CREATE TABLE IF NOT EXISTS attempt_keyword_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id TEXT NOT NULL REFERENCES question_attempts(id) ON DELETE CASCADE,
      match_status TEXT NOT NULL CHECK (match_status IN ('matched', 'missed')),
      keyword_order INTEGER NOT NULL,
      keyword_enc TEXT NOT NULL,
      UNIQUE (attempt_id, match_status, keyword_order)
    );

    CREATE INDEX IF NOT EXISTS idx_attempt_keyword_matches_attempt ON attempt_keyword_matches (attempt_id, match_status, keyword_order);
  `);
}

function ensureTopicId(topicName) {
  const cleanName = sanitizePlainText(topicName || 'General Specification', 100).trim() || 'General Specification';
  db.prepare('INSERT OR IGNORE INTO topics (name) VALUES (?)').run(cleanName);
  const topicRow = db.prepare('SELECT id, name FROM topics WHERE name = ?').get(cleanName);
  return { id: topicRow.id, name: topicRow.name };
}

function extractLegacyPaperRecord(legacyRow) {
  if (legacyRow.payload_enc && legacyRow.data_hash) {
    const unsealedPayload = unsealText(legacyRow.payload_enc, `legacy paper ${legacyRow.id}`);
    if (unsealedPayload && verifyIntegrityHash(unsealedPayload, legacyRow.data_hash)) {
      try {
        const parsedPaper = JSON.parse(unsealedPayload);
        return {
          id: legacyRow.id,
          userId: legacyRow.user_id,
          createdAt: legacyRow.created_at,
          title: parsedPaper.title || 'Uploaded Paper',
          pageCount: parsedPaper.pageCount ?? 0,
          extractedText: parsedPaper.extractedText ?? '',
          needsOcr: Boolean(parsedPaper.needsOcr),
          questions: Array.isArray(parsedPaper.questions) ? parsedPaper.questions : [],
        };
      } catch (parseError) {
        console.warn(`Skipping corrupt legacy paper ${legacyRow.id}:`, parseError.message);
      }
    }
    return null;
  }

  let parsedQuestions = [];
  try {
    const rawQuestions = JSON.parse(legacyRow.questions_json || '[]');
    if (Array.isArray(rawQuestions)) parsedQuestions = rawQuestions;
  } catch (parseError) {
    console.warn(`Invalid legacy questions_json on paper ${legacyRow.id}:`, parseError.message);
  }
  return {
    id: legacyRow.id,
    userId: legacyRow.user_id,
    createdAt: legacyRow.created_at,
    title: legacyRow.title || 'Uploaded Paper',
    pageCount: legacyRow.page_count ?? 0,
    extractedText: legacyRow.extracted_text ?? '',
    needsOcr: Boolean(legacyRow.needs_ocr),
    questions: parsedQuestions,
  };
}

function extractLegacyExamResultRecord(legacyRow) {
  if (legacyRow.payload_enc && legacyRow.data_hash) {
    const unsealedPayload = unsealText(legacyRow.payload_enc, `legacy result ${legacyRow.id}`);
    if (unsealedPayload && verifyIntegrityHash(unsealedPayload, legacyRow.data_hash)) {
      try {
        const parsedResult = JSON.parse(unsealedPayload);
        return {
          id: legacyRow.id,
          userId: legacyRow.user_id,
          completedAt: legacyRow.completed_at,
          paperTitle: parsedResult.paperTitle || 'Exam Paper',
          scorePercent: parsedResult.scorePercent ?? 0,
          avgTimeLabel: parsedResult.avgTimeLabel || '0s',
          questionsAnswered: parsedResult.questionsAnswered ?? 0,
          totalQuestions: parsedResult.totalQuestions ?? 0,
          summary: parsedResult.summary || '',
          topicBreakdown: Array.isArray(parsedResult.topicBreakdown) ? parsedResult.topicBreakdown : [],
          questionLogs: Array.isArray(parsedResult.questionLogs) ? parsedResult.questionLogs : [],
        };
      } catch (parseError) {
        console.warn(`Skipping corrupt legacy result ${legacyRow.id}:`, parseError.message);
      }
    }
    return null;
  }

  let topicBreakdown = [];
  let questionLogs = [];
  try {
    const parsedBreakdown = JSON.parse(legacyRow.topic_breakdown_json || '[]');
    if (Array.isArray(parsedBreakdown)) topicBreakdown = parsedBreakdown;
  } catch (parseError) {
    console.warn(`Invalid legacy topic_breakdown_json on result ${legacyRow.id}:`, parseError.message);
  }
  try {
    const parsedLogs = JSON.parse(legacyRow.question_logs_json || '[]');
    if (Array.isArray(parsedLogs)) questionLogs = parsedLogs;
  } catch (parseError) {
    console.warn(`Invalid legacy question_logs_json on result ${legacyRow.id}:`, parseError.message);
  }

  return {
    id: legacyRow.id,
    userId: legacyRow.user_id,
    completedAt: legacyRow.completed_at,
    paperTitle: legacyRow.paper_title || 'Exam Paper',
    scorePercent: legacyRow.score_percent ?? 0,
    avgTimeLabel: legacyRow.avg_time_label || '0s',
    questionsAnswered: legacyRow.questions_answered ?? 0,
    totalQuestions: legacyRow.total_questions ?? questionLogs.length,
    summary: legacyRow.summary || '',
    topicBreakdown,
    questionLogs,
  };
}

function initializeDatabaseSchema() {
  const hasLegacyPapersTable = tableExists('user_papers') && tableHasColumn('user_papers', 'questions_json');
  const hasLegacyResultsTable =
    tableExists('exam_results') && tableHasColumn('exam_results', 'topic_breakdown_json');

  const legacyPapers = hasLegacyPapersTable
    ? db.prepare('SELECT * FROM user_papers').all().map(extractLegacyPaperRecord).filter(Boolean)
    : [];
  const legacyResults = hasLegacyResultsTable
    ? db.prepare('SELECT * FROM exam_results').all().map(extractLegacyExamResultRecord).filter(Boolean)
    : [];

  if (hasLegacyPapersTable || hasLegacyResultsTable) {
    db.pragma('foreign_keys = OFF');
    const migrateTransaction = db.transaction(() => {
      if (hasLegacyResultsTable) {
        db.exec('DROP TABLE IF EXISTS exam_results');
      }
      if (hasLegacyPapersTable) {
        db.exec('DROP TABLE IF EXISTS user_papers');
      }
      createNormalizedSchema();
      for (const paperRecord of legacyPapers) {
        insertPaperNormalized(paperRecord.userId, paperRecord, paperRecord.createdAt);
      }
      for (const resultRecord of legacyResults) {
        insertExamResultNormalized(resultRecord.userId, resultRecord);
      }
    });
    try {
      migrateTransaction();
    } finally {
      db.pragma('foreign_keys = ON');
    }
  } else {
    createNormalizedSchema();
  }

  const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((column) => column.name));
  if (!userColumns.has('username_hash')) {
    db.exec('ALTER TABLE users ADD COLUMN username_hash TEXT');
  }
  if (!userColumns.has('username_enc')) {
    db.exec('ALTER TABLE users ADD COLUMN username_enc TEXT');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_username_hash ON users (username_hash)');

  const legacyUsers = db
    .prepare('SELECT id, username, username_lower, username_hash, username_enc FROM users')
    .all();
  const updateUserStatement = db.prepare(
    'UPDATE users SET username = ?, username_lower = ?, username_hash = ?, username_enc = ? WHERE id = ?',
  );
  for (const userRow of legacyUsers) {
    if (!userRow.username_hash || !userRow.username_enc) {
      const displayUsername = String(userRow.username || userRow.username_lower || 'student').trim();
      const usernameHash = hashLookupValue(displayUsername);
      const encryptedUsername = sealText(displayUsername);
      const maskedLabel = `hashed:${usernameHash.slice(0, 16)}`;
      updateUserStatement.run(maskedLabel, usernameHash, usernameHash, encryptedUsername, userRow.id);
    }
  }
}

function buildPaperDataHash(paperFields) {
  return hashIntegrityPayload(
    JSON.stringify({
      title: paperFields.title,
      pageCount: paperFields.pageCount,
      extractedText: paperFields.extractedText,
      needsOcr: Boolean(paperFields.needsOcr),
    }),
  );
}

function buildQuestionDataHash(questionFields) {
  return hashIntegrityPayload(
    JSON.stringify({
      questionOrder: questionFields.questionOrder,
      questionNumber: questionFields.questionNumber,
      prompt: questionFields.prompt,
      marks: questionFields.marks,
      recommendedTimeSeconds: questionFields.recommendedTimeSeconds,
      topicName: questionFields.topicName,
    }),
  );
}

function buildResultDataHash(resultFields) {
  return hashIntegrityPayload(
    JSON.stringify({
      paperId: resultFields.paperId || null,
      paperTitle: resultFields.paperTitle,
      scorePercent: resultFields.scorePercent,
      avgTimeLabel: resultFields.avgTimeLabel,
      questionsAnswered: resultFields.questionsAnswered,
      totalQuestions: resultFields.totalQuestions,
      summary: resultFields.summary,
    }),
  );
}

function buildTopicSummaryDataHash(summaryFields) {
  return hashIntegrityPayload(
    JSON.stringify({
      topic: summaryFields.topic,
      rankOrder: summaryFields.rankOrder,
      weaknessIndex: summaryFields.weaknessIndex,
      scorePercent: summaryFields.scorePercent,
      timeRatioPercent: summaryFields.timeRatioPercent,
      avgTimeSeconds: summaryFields.avgTimeSeconds,
      avgRecommendedSeconds: summaryFields.avgRecommendedSeconds,
      marksAwarded: summaryFields.marksAwarded,
      totalMarks: summaryFields.totalMarks,
      questionCount: summaryFields.questionCount,
      status: summaryFields.status,
      action: summaryFields.action,
    }),
  );
}

function buildAttemptDataHash(attemptFields) {
  return hashIntegrityPayload(
    JSON.stringify({
      paperQuestionId: attemptFields.paperQuestionId || null,
      questionIndex: attemptFields.questionIndex,
      questionNumber: attemptFields.questionNumber,
      prompt: attemptFields.prompt,
      answerText: attemptFields.answerText,
      marksAwarded: attemptFields.marksAwarded,
      totalMarks: attemptFields.totalMarks,
      timeSpentSeconds: attemptFields.timeSpentSeconds,
      recommendedTimeSeconds: attemptFields.recommendedTimeSeconds,
      confidence: attemptFields.confidence,
      topicName: attemptFields.topicName,
    }),
  );
}

function insertPaperNormalized(userId, paperInput, explicitCreatedAt) {
  const paperId = paperInput.id || `paper-${crypto.randomUUID()}`;
  const createdAt = explicitCreatedAt || new Date().toISOString();
  const cleanTitle = sanitizePlainText(paperInput.title || 'Uploaded Paper', 200) || 'Uploaded Paper';
  const pageCount = Math.max(0, Math.round(Number(paperInput.pageCount ?? 0)));
  const extractedText = String(paperInput.extractedText ?? '');
  const needsOcr = Boolean(paperInput.needsOcr);
  const paperHash = buildPaperDataHash({
    title: cleanTitle,
    pageCount,
    extractedText,
    needsOcr,
  });

  db.prepare(
    `INSERT INTO user_papers (
      id, user_id, title_enc, extracted_text_enc, page_count, needs_ocr, data_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    paperId,
    userId,
    sealText(cleanTitle),
    sealText(extractedText),
    pageCount,
    needsOcr ? 1 : 0,
    paperHash,
    createdAt,
  );

  const insertQuestionStatement = db.prepare(
    `INSERT INTO paper_questions (
      id, paper_id, topic_id, question_order, question_number,
      prompt_enc, marks, recommended_time_seconds, data_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertKeywordStatement = db.prepare(
    `INSERT INTO question_rubric_keywords (
      question_id, keyword_order, keyword_enc
    ) VALUES (?, ?, ?)`,
  );

  const rawQuestions = Array.isArray(paperInput.questions) ? paperInput.questions : [];
  const normalizedQuestions = [];

  rawQuestions.forEach((rawQuestion, questionOrder) => {
    const questionId = `pq-${crypto.randomUUID()}`;
    const resolvedTopic = ensureTopicId(rawQuestion.topicCategory || 'General Specification');
    const questionNumber = sanitizePlainText(
      rawQuestion.questionNumber || String(questionOrder + 1),
      20,
    );
    const cleanPrompt = sanitizePlainText(rawQuestion.prompt || '', 1500);
    const marks = Math.max(1, Math.round(Number(rawQuestion.marks) || 2));
    const recommendedTimeSeconds = Math.max(
      15,
      Math.round(Number(rawQuestion.recommendedTimeSeconds) || marks * 60),
    );
    const questionHash = buildQuestionDataHash({
      questionOrder,
      questionNumber,
      prompt: cleanPrompt,
      marks,
      recommendedTimeSeconds,
      topicName: resolvedTopic.name,
    });

    insertQuestionStatement.run(
      questionId,
      paperId,
      resolvedTopic.id,
      questionOrder,
      questionNumber,
      sealText(cleanPrompt),
      marks,
      recommendedTimeSeconds,
      questionHash,
    );

    const rubricKeywords = Array.isArray(rawQuestion.rubricKeywords)
      ? rawQuestion.rubricKeywords
          .map((keywordEntry) => sanitizePlainText(keywordEntry, 120).trim())
          .filter(Boolean)
      : [];

    rubricKeywords.forEach((keywordText, keywordOrder) => {
      insertKeywordStatement.run(questionId, keywordOrder, sealText(keywordText));
    });

    normalizedQuestions.push({
      id: questionId,
      questionNumber,
      prompt: cleanPrompt,
      marks,
      recommendedTimeSeconds,
      topicCategory: resolvedTopic.name,
      rubricKeywords,
    });
  });

  return {
    id: paperId,
    title: cleanTitle,
    pageCount,
    extractedText,
    needsOcr,
    questions: normalizedQuestions,
    createdAt,
  };
}

function insertExamResultNormalized(userId, resultInput) {
  let resultId = resultInput.id || `res-${crypto.randomUUID()}`;
  const existingResultRow = db.prepare('SELECT user_id FROM exam_results WHERE id = ?').get(resultId);
  if (existingResultRow && existingResultRow.user_id !== userId) {
    resultId = `res-${crypto.randomUUID()}`;
  }

  let linkedPaperId = null;
  const candidatePaperId = typeof resultInput.paperId === 'string' ? resultInput.paperId.trim() : '';
  if (candidatePaperId) {
    const ownedPaper = db
      .prepare('SELECT id FROM user_papers WHERE id = ? AND user_id = ?')
      .get(candidatePaperId, userId);
    if (ownedPaper) {
      linkedPaperId = ownedPaper.id;
    }
  }

  const completedAt = resultInput.completedAt || new Date().toISOString();
  const cleanTitle = sanitizePlainText(resultInput.paperTitle, 200);
  const cleanAvgTime = sanitizePlainText(resultInput.avgTimeLabel, 40);
  const cleanSummary = sanitizePlainText(resultInput.summary ?? '', 600);
  const scorePercent = Math.max(0, Math.min(100, Math.round(Number(resultInput.scorePercent ?? 0))));
  const cleanLogs = Array.isArray(resultInput.questionLogs)
    ? resultInput.questionLogs.map((questionLog, arrayIndex) => ({
        questionIndex: Math.max(0, Math.round(Number(questionLog.questionIndex ?? arrayIndex))),
        questionNumber: sanitizePlainText(
          questionLog.questionNumber || String(arrayIndex + 1),
          20,
        ),
        prompt: sanitizePlainText(questionLog.prompt || '', 500),
        topicCategory: sanitizePlainText(
          questionLog.topicCategory || 'General Specification',
          100,
        ),
        answerText: sanitizePlainText(questionLog.answerText || '', 2500),
        marksAwarded: Math.max(0, Math.round(Number(questionLog.marksAwarded ?? 0))),
        totalMarks: Math.max(1, Math.round(Number(questionLog.totalMarks ?? 1))),
        timeSpentSeconds: Math.max(0, Math.round(Number(questionLog.timeSpentSeconds ?? 0))),
        recommendedTimeSeconds: Math.max(
          15,
          Math.round(Number(questionLog.recommendedTimeSeconds ?? 60)),
        ),
        confidence:
          questionLog.confidence == null
            ? null
            : Math.max(1, Math.min(5, Math.round(Number(questionLog.confidence)))),
        matchedKeywords: Array.isArray(questionLog.matchedKeywords)
          ? questionLog.matchedKeywords
              .map((keywordEntry) => sanitizePlainText(keywordEntry, 120).trim())
              .filter(Boolean)
          : [],
        missedKeywords: Array.isArray(questionLog.missedKeywords)
          ? questionLog.missedKeywords
              .map((keywordEntry) => sanitizePlainText(keywordEntry, 120).trim())
              .filter(Boolean)
          : [],
      }))
    : [];

  const totalQuestions = Math.max(
    0,
    Math.round(Number(resultInput.totalQuestions ?? cleanLogs.length)),
  );
  const questionsAnswered = Math.max(
    0,
    Math.min(totalQuestions, Math.round(Number(resultInput.questionsAnswered ?? 0))),
  );

  const resultHash = buildResultDataHash({
    paperId: linkedPaperId,
    paperTitle: cleanTitle,
    scorePercent,
    avgTimeLabel: cleanAvgTime,
    questionsAnswered,
    totalQuestions,
    summary: cleanSummary,
  });

  db.prepare(
    `INSERT INTO exam_results (
      id, user_id, paper_id, paper_title_enc, score_percent, avg_time_label_enc,
      questions_answered, total_questions, summary_enc, data_hash, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      paper_id = excluded.paper_id,
      paper_title_enc = excluded.paper_title_enc,
      score_percent = excluded.score_percent,
      avg_time_label_enc = excluded.avg_time_label_enc,
      questions_answered = excluded.questions_answered,
      total_questions = excluded.total_questions,
      summary_enc = excluded.summary_enc,
      data_hash = excluded.data_hash,
      completed_at = excluded.completed_at
    WHERE exam_results.user_id = excluded.user_id`,
  ).run(
    resultId,
    userId,
    linkedPaperId,
    sealText(cleanTitle),
    scorePercent,
    sealText(cleanAvgTime),
    questionsAnswered,
    totalQuestions,
    sealText(cleanSummary),
    resultHash,
    completedAt,
  );

  db.prepare('DELETE FROM exam_topic_summaries WHERE result_id = ?').run(resultId);
  db.prepare('DELETE FROM question_attempts WHERE result_id = ?').run(resultId);

  const insertSummaryStatement = db.prepare(
    `INSERT INTO exam_topic_summaries (
      result_id, topic_id, rank_order, weakness_index, score_percent,
      time_ratio_percent, avg_time_seconds, avg_recommended_seconds,
      marks_awarded, total_marks, question_count, status, action_enc, data_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const rawSummaries = Array.isArray(resultInput.topicBreakdown) ? resultInput.topicBreakdown : [];
  const seenSummaryTopicIds = new Set();
  const normalizedTopicBreakdown = [];

  rawSummaries.forEach((summaryEntry, rankOrder) => {
    const resolvedTopic = ensureTopicId(summaryEntry.topic || 'General Specification');
    if (seenSummaryTopicIds.has(resolvedTopic.id)) return;
    seenSummaryTopicIds.add(resolvedTopic.id);

    const weaknessIndex = Number(Number(summaryEntry.weaknessIndex ?? 0).toFixed(2));
    const topicScorePercent = Math.max(0, Math.min(100, Math.round(Number(summaryEntry.scorePercent ?? 0))));
    const timeRatioPercent = Math.max(0, Math.round(Number(summaryEntry.timeRatioPercent ?? 0)));
    const avgTimeSeconds = Math.max(0, Math.round(Number(summaryEntry.avgTimeSeconds ?? 0)));
    const avgRecommendedSeconds = Math.max(
      15,
      Math.round(Number(summaryEntry.avgRecommendedSeconds ?? 60)),
    );
    const marksAwarded = Math.max(0, Math.round(Number(summaryEntry.marksAwarded ?? 0)));
    const totalMarks = Math.max(1, Math.round(Number(summaryEntry.totalMarks ?? 1)));
    const questionCount = Math.max(1, Math.round(Number(summaryEntry.questionCount ?? 1)));
    const status = sanitizePlainText(summaryEntry.status || 'Strong', 40);
    const action = sanitizePlainText(summaryEntry.action || '', 600);
    const summaryHash = buildTopicSummaryDataHash({
      topic: resolvedTopic.name,
      rankOrder,
      weaknessIndex,
      scorePercent: topicScorePercent,
      timeRatioPercent,
      avgTimeSeconds,
      avgRecommendedSeconds,
      marksAwarded,
      totalMarks,
      questionCount,
      status,
      action,
    });

    insertSummaryStatement.run(
      resultId,
      resolvedTopic.id,
      rankOrder,
      weaknessIndex,
      topicScorePercent,
      timeRatioPercent,
      avgTimeSeconds,
      avgRecommendedSeconds,
      marksAwarded,
      totalMarks,
      questionCount,
      status,
      sealText(action),
      summaryHash,
    );

    normalizedTopicBreakdown.push({
      topic: resolvedTopic.name,
      weaknessIndex,
      scorePercent: topicScorePercent,
      timeRatioPercent,
      avgTimeSeconds,
      avgRecommendedSeconds,
      marksAwarded,
      totalMarks,
      questionCount,
      status,
      action,
    });
  });

  const paperQuestionLookup = new Map();
  if (linkedPaperId) {
    const linkedQuestionRows = db
      .prepare('SELECT id, question_order FROM paper_questions WHERE paper_id = ?')
      .all(linkedPaperId);
    for (const linkedQuestionRow of linkedQuestionRows) {
      paperQuestionLookup.set(linkedQuestionRow.question_order, linkedQuestionRow.id);
    }
  }

  const insertAttemptStatement = db.prepare(
    `INSERT INTO question_attempts (
      id, result_id, paper_question_id, topic_id, question_index, question_number,
      prompt_enc, answer_text_enc, marks_awarded, total_marks, time_spent_seconds,
      recommended_time_seconds, confidence, data_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertAttemptKeywordStatement = db.prepare(
    `INSERT INTO attempt_keyword_matches (
      attempt_id, match_status, keyword_order, keyword_enc
    ) VALUES (?, ?, ?, ?)`,
  );

  for (const questionLog of cleanLogs) {
    const attemptId = `qa-${crypto.randomUUID()}`;
    const resolvedTopic = ensureTopicId(questionLog.topicCategory);
    const paperQuestionId = paperQuestionLookup.get(questionLog.questionIndex) || null;
    const attemptHash = buildAttemptDataHash({
      paperQuestionId,
      questionIndex: questionLog.questionIndex,
      questionNumber: questionLog.questionNumber,
      prompt: questionLog.prompt,
      answerText: questionLog.answerText,
      marksAwarded: questionLog.marksAwarded,
      totalMarks: questionLog.totalMarks,
      timeSpentSeconds: questionLog.timeSpentSeconds,
      recommendedTimeSeconds: questionLog.recommendedTimeSeconds,
      confidence: questionLog.confidence,
      topicName: resolvedTopic.name,
    });

    insertAttemptStatement.run(
      attemptId,
      resultId,
      paperQuestionId,
      resolvedTopic.id,
      questionLog.questionIndex,
      questionLog.questionNumber,
      sealText(questionLog.prompt),
      sealText(questionLog.answerText),
      questionLog.marksAwarded,
      questionLog.totalMarks,
      questionLog.timeSpentSeconds,
      questionLog.recommendedTimeSeconds,
      questionLog.confidence,
      attemptHash,
    );

    questionLog.matchedKeywords.forEach((keywordText, keywordOrder) => {
      insertAttemptKeywordStatement.run(attemptId, 'matched', keywordOrder, sealText(keywordText));
    });
    questionLog.missedKeywords.forEach((keywordText, keywordOrder) => {
      insertAttemptKeywordStatement.run(attemptId, 'missed', keywordOrder, sealText(keywordText));
    });
  }

  return {
    id: resultId,
    paperId: linkedPaperId,
    paperTitle: cleanTitle,
    scorePercent,
    avgTimeLabel: cleanAvgTime,
    questionsAnswered,
    totalQuestions,
    summary: cleanSummary,
    topicBreakdown: normalizedTopicBreakdown,
    questionLogs: cleanLogs,
    completedAt,
  };
}

initializeDatabaseSchema();

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
  if (!salt || !/^[0-9a-f]{128}$/i.test(storedKeyHex)) return false;
  try {
    const storedKeyBuffer = Buffer.from(storedKeyHex, 'hex');
    const derivedKeyBuffer = crypto.scryptSync(password, salt, 64);
    if (storedKeyBuffer.length !== derivedKeyBuffer.length) return false;
    return crypto.timingSafeEqual(storedKeyBuffer, derivedKeyBuffer);
  } catch (verifyError) {
    console.warn('Password verification failed:', verifyError.message);
    return false;
  }
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
  const joinedRows = db
    .prepare(
      `SELECT
        p.id AS paper_id,
        p.title_enc AS paper_title_enc,
        p.extracted_text_enc AS paper_extracted_text_enc,
        p.page_count,
        p.needs_ocr,
        p.data_hash AS paper_data_hash,
        p.created_at,
        q.id AS question_id,
        q.question_order,
        q.question_number,
        q.prompt_enc AS question_prompt_enc,
        q.marks,
        q.recommended_time_seconds,
        q.data_hash AS question_data_hash,
        t.name AS topic_name,
        rk.keyword_order,
        rk.keyword_enc
      FROM user_papers AS p
      LEFT JOIN paper_questions AS q ON q.paper_id = p.id
      LEFT JOIN topics AS t ON t.id = q.topic_id
      LEFT JOIN question_rubric_keywords AS rk ON rk.question_id = q.id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC, q.question_order ASC, rk.keyword_order ASC`,
    )
    .all(userId);

  const paperMap = new Map();

  for (const joinedRow of joinedRows) {
    let paperEntry = paperMap.get(joinedRow.paper_id);
    if (!paperEntry) {
      const title = unsealText(joinedRow.paper_title_enc, `paper title ${joinedRow.paper_id}`);
      const extractedText = unsealText(
        joinedRow.paper_extracted_text_enc,
        `paper text ${joinedRow.paper_id}`,
      );
      if (title === null || extractedText === null) {
        paperEntry = { corrupted: true };
        paperMap.set(joinedRow.paper_id, paperEntry);
        continue;
      }

      const canonicalPaperFields = {
        title,
        pageCount: joinedRow.page_count,
        extractedText,
        needsOcr: Boolean(joinedRow.needs_ocr),
      };
      if (!verifyIntegrityHash(JSON.stringify(canonicalPaperFields), joinedRow.paper_data_hash)) {
        console.warn(`Skipping paper ${joinedRow.paper_id}: integrity check failed.`);
        paperEntry = { corrupted: true };
        paperMap.set(joinedRow.paper_id, paperEntry);
        continue;
      }

      paperEntry = {
        corrupted: false,
        id: joinedRow.paper_id,
        title,
        pageCount: joinedRow.page_count,
        extractedText,
        needsOcr: Boolean(joinedRow.needs_ocr),
        questionsMap: new Map(),
        createdAt: joinedRow.created_at,
      };
      paperMap.set(joinedRow.paper_id, paperEntry);
    }

    if (paperEntry.corrupted || !joinedRow.question_id) continue;

    let questionEntry = paperEntry.questionsMap.get(joinedRow.question_id);
    if (!questionEntry) {
      const prompt = unsealText(joinedRow.question_prompt_enc, `question ${joinedRow.question_id}`);
      if (prompt === null) {
        paperEntry.corrupted = true;
        continue;
      }
      const canonicalQuestionFields = {
        questionOrder: joinedRow.question_order,
        questionNumber: joinedRow.question_number,
        prompt,
        marks: joinedRow.marks,
        recommendedTimeSeconds: joinedRow.recommended_time_seconds,
        topicName: joinedRow.topic_name,
      };
      if (!verifyIntegrityHash(JSON.stringify(canonicalQuestionFields), joinedRow.question_data_hash)) {
        console.warn(`Skipping paper ${joinedRow.paper_id}: question ${joinedRow.question_id} integrity check failed.`);
        paperEntry.corrupted = true;
        continue;
      }

      questionEntry = {
        id: joinedRow.question_id,
        questionNumber: joinedRow.question_number,
        prompt,
        marks: joinedRow.marks,
        recommendedTimeSeconds: joinedRow.recommended_time_seconds,
        topicCategory: joinedRow.topic_name,
        rubricKeywords: [],
      };
      paperEntry.questionsMap.set(joinedRow.question_id, questionEntry);
    }

    if (joinedRow.keyword_enc) {
      const keywordText = unsealText(joinedRow.keyword_enc, `rubric keyword ${joinedRow.question_id}`);
      if (keywordText === null) {
        paperEntry.corrupted = true;
        continue;
      }
      questionEntry.rubricKeywords.push(keywordText);
    }
  }

  const papers = [];
  for (const paperEntry of paperMap.values()) {
    if (paperEntry.corrupted) continue;
    papers.push({
      id: paperEntry.id,
      title: paperEntry.title,
      pageCount: paperEntry.pageCount,
      extractedText: paperEntry.extractedText,
      needsOcr: paperEntry.needsOcr,
      questions: Array.from(paperEntry.questionsMap.values()),
      createdAt: paperEntry.createdAt,
    });
  }
  return papers;
}

export function saveUserPaper(userId, paperInput) {
  const writePaperTransaction = db.transaction(() => insertPaperNormalized(userId, paperInput));
  return writePaperTransaction();
}

export function getUserExamResults(userId) {
  const summaryJoinRows = db
    .prepare(
      `SELECT
        r.id AS result_id,
        r.paper_id,
        r.paper_title_enc,
        r.score_percent AS result_score_percent,
        r.avg_time_label_enc,
        r.questions_answered,
        r.total_questions,
        r.summary_enc,
        r.data_hash AS result_data_hash,
        r.completed_at,
        ts.id AS summary_row_id,
        t.name AS topic_name,
        ts.rank_order,
        ts.weakness_index,
        ts.score_percent AS topic_score_percent,
        ts.time_ratio_percent,
        ts.avg_time_seconds,
        ts.avg_recommended_seconds,
        ts.marks_awarded AS topic_marks_awarded,
        ts.total_marks AS topic_total_marks,
        ts.question_count,
        ts.status,
        ts.action_enc,
        ts.data_hash AS summary_data_hash
      FROM exam_results AS r
      LEFT JOIN exam_topic_summaries AS ts ON ts.result_id = r.id
      LEFT JOIN topics AS t ON t.id = ts.topic_id
      WHERE r.user_id = ?
      ORDER BY r.completed_at DESC, ts.rank_order ASC`,
    )
    .all(userId);

  const attemptJoinRows = db
    .prepare(
      `SELECT
        qa.id AS attempt_id,
        qa.result_id,
        qa.paper_question_id,
        qa.question_index,
        qa.question_number,
        qa.prompt_enc,
        qa.answer_text_enc,
        qa.marks_awarded,
        qa.total_marks,
        qa.time_spent_seconds,
        qa.recommended_time_seconds,
        qa.confidence,
        qa.data_hash AS attempt_data_hash,
        t.name AS topic_name,
        akm.match_status,
        akm.keyword_order,
        akm.keyword_enc
      FROM question_attempts AS qa
      INNER JOIN exam_results AS r ON r.id = qa.result_id
      INNER JOIN topics AS t ON t.id = qa.topic_id
      LEFT JOIN attempt_keyword_matches AS akm ON akm.attempt_id = qa.id
      WHERE r.user_id = ?
      ORDER BY r.completed_at DESC, qa.question_index ASC, akm.keyword_order ASC`,
    )
    .all(userId);

  const resultMap = new Map();

  for (const summaryJoinRow of summaryJoinRows) {
    let resultEntry = resultMap.get(summaryJoinRow.result_id);
    if (!resultEntry) {
      const paperTitle = unsealText(summaryJoinRow.paper_title_enc, `result title ${summaryJoinRow.result_id}`);
      const avgTimeLabel = unsealText(summaryJoinRow.avg_time_label_enc, `result avgTime ${summaryJoinRow.result_id}`);
      const summary = unsealText(summaryJoinRow.summary_enc, `result summary ${summaryJoinRow.result_id}`);
      if (paperTitle === null || avgTimeLabel === null || summary === null) {
        resultMap.set(summaryJoinRow.result_id, { corrupted: true });
        continue;
      }

      const canonicalResultFields = {
        paperId: summaryJoinRow.paper_id,
        paperTitle,
        scorePercent: summaryJoinRow.result_score_percent,
        avgTimeLabel,
        questionsAnswered: summaryJoinRow.questions_answered,
        totalQuestions: summaryJoinRow.total_questions,
        summary,
      };
      if (!verifyIntegrityHash(JSON.stringify(canonicalResultFields), summaryJoinRow.result_data_hash)) {
        console.warn(`Skipping exam result ${summaryJoinRow.result_id}: integrity check failed.`);
        resultMap.set(summaryJoinRow.result_id, { corrupted: true });
        continue;
      }

      resultEntry = {
        corrupted: false,
        id: summaryJoinRow.result_id,
        paperId: summaryJoinRow.paper_id || null,
        paperTitle,
        scorePercent: summaryJoinRow.result_score_percent,
        avgTimeLabel,
        questionsAnswered: summaryJoinRow.questions_answered,
        totalQuestions: summaryJoinRow.total_questions,
        summary,
        topicBreakdown: [],
        attemptsMap: new Map(),
        completedAt: summaryJoinRow.completed_at,
      };
      resultMap.set(summaryJoinRow.result_id, resultEntry);
    }

    if (resultEntry.corrupted || !summaryJoinRow.summary_row_id) continue;

    const action = unsealText(
      summaryJoinRow.action_enc,
      `topic summary ${summaryJoinRow.summary_row_id}`,
    );
    if (action === null) {
      resultEntry.corrupted = true;
      continue;
    }

    const canonicalSummaryFields = {
      topic: summaryJoinRow.topic_name,
      rankOrder: summaryJoinRow.rank_order,
      weaknessIndex: summaryJoinRow.weakness_index,
      scorePercent: summaryJoinRow.topic_score_percent,
      timeRatioPercent: summaryJoinRow.time_ratio_percent,
      avgTimeSeconds: summaryJoinRow.avg_time_seconds,
      avgRecommendedSeconds: summaryJoinRow.avg_recommended_seconds,
      marksAwarded: summaryJoinRow.topic_marks_awarded,
      totalMarks: summaryJoinRow.topic_total_marks,
      questionCount: summaryJoinRow.question_count,
      status: summaryJoinRow.status,
      action,
    };
    if (!verifyIntegrityHash(JSON.stringify(canonicalSummaryFields), summaryJoinRow.summary_data_hash)) {
      console.warn(`Skipping exam result ${summaryJoinRow.result_id}: topic summary integrity check failed.`);
      resultEntry.corrupted = true;
      continue;
    }

    resultEntry.topicBreakdown.push({
      topic: summaryJoinRow.topic_name,
      weaknessIndex: summaryJoinRow.weakness_index,
      scorePercent: summaryJoinRow.topic_score_percent,
      timeRatioPercent: summaryJoinRow.time_ratio_percent,
      avgTimeSeconds: summaryJoinRow.avg_time_seconds,
      avgRecommendedSeconds: summaryJoinRow.avg_recommended_seconds,
      marksAwarded: summaryJoinRow.topic_marks_awarded,
      totalMarks: summaryJoinRow.topic_total_marks,
      questionCount: summaryJoinRow.question_count,
      status: summaryJoinRow.status,
      action,
    });
  }

  for (const attemptJoinRow of attemptJoinRows) {
    const resultEntry = resultMap.get(attemptJoinRow.result_id);
    if (!resultEntry || resultEntry.corrupted) continue;

    let attemptEntry = resultEntry.attemptsMap.get(attemptJoinRow.attempt_id);
    if (!attemptEntry) {
      const prompt = unsealText(attemptJoinRow.prompt_enc, `attempt prompt ${attemptJoinRow.attempt_id}`);
      const answerText = unsealText(attemptJoinRow.answer_text_enc, `attempt answer ${attemptJoinRow.attempt_id}`);
      if (prompt === null || answerText === null) {
        resultEntry.corrupted = true;
        continue;
      }

      const canonicalAttemptFields = {
        paperQuestionId: attemptJoinRow.paper_question_id,
        questionIndex: attemptJoinRow.question_index,
        questionNumber: attemptJoinRow.question_number,
        prompt,
        answerText,
        marksAwarded: attemptJoinRow.marks_awarded,
        totalMarks: attemptJoinRow.total_marks,
        timeSpentSeconds: attemptJoinRow.time_spent_seconds,
        recommendedTimeSeconds: attemptJoinRow.recommended_time_seconds,
        confidence: attemptJoinRow.confidence,
        topicName: attemptJoinRow.topic_name,
      };
      if (!verifyIntegrityHash(JSON.stringify(canonicalAttemptFields), attemptJoinRow.attempt_data_hash)) {
        console.warn(`Skipping exam result ${attemptJoinRow.result_id}: attempt integrity check failed.`);
        resultEntry.corrupted = true;
        continue;
      }

      attemptEntry = {
        questionIndex: attemptJoinRow.question_index,
        questionNumber: attemptJoinRow.question_number,
        prompt,
        topicCategory: attemptJoinRow.topic_name,
        answerText,
        marksAwarded: attemptJoinRow.marks_awarded,
        totalMarks: attemptJoinRow.total_marks,
        timeSpentSeconds: attemptJoinRow.time_spent_seconds,
        recommendedTimeSeconds: attemptJoinRow.recommended_time_seconds,
        confidence: attemptJoinRow.confidence,
        matchedKeywords: [],
        missedKeywords: [],
      };
      resultEntry.attemptsMap.set(attemptJoinRow.attempt_id, attemptEntry);
    }

    if (attemptJoinRow.keyword_enc && attemptJoinRow.match_status) {
      const keywordText = unsealText(
        attemptJoinRow.keyword_enc,
        `attempt keyword ${attemptJoinRow.attempt_id}`,
      );
      if (keywordText === null) {
        resultEntry.corrupted = true;
        continue;
      }
      if (attemptJoinRow.match_status === 'matched') {
        attemptEntry.matchedKeywords.push(keywordText);
      } else if (attemptJoinRow.match_status === 'missed') {
        attemptEntry.missedKeywords.push(keywordText);
      }
    }
  }

  const examResults = [];
  for (const resultEntry of resultMap.values()) {
    if (resultEntry.corrupted) continue;
    examResults.push({
      id: resultEntry.id,
      paperId: resultEntry.paperId,
      paperTitle: resultEntry.paperTitle,
      scorePercent: resultEntry.scorePercent,
      avgTimeLabel: resultEntry.avgTimeLabel,
      questionsAnswered: resultEntry.questionsAnswered,
      totalQuestions: resultEntry.totalQuestions,
      summary: resultEntry.summary,
      topicBreakdown: resultEntry.topicBreakdown,
      questionLogs: Array.from(resultEntry.attemptsMap.values()),
      completedAt: resultEntry.completedAt,
    });
  }
  return examResults;
}

export function saveUserExamResult(userId, resultInput) {
  const writeResultTransaction = db.transaction(() => insertExamResultNormalized(userId, resultInput));
  return writeResultTransaction();
}
