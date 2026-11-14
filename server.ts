import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { buildReportPdfWithPdfLib, extractPdfGeometryWithPdfJs } from './server/pdfService.ts';
import {
  authenticateUser,
  checkUsernameEligibility,
  createSessionToken,
  createUser,
  getAdminUserDetail,
  getUserById,
  getUserExamResults,
  getUserPapers,
  listAllUsersForAdmin,
  listAuthAuditLogs,
  PublicUser,
  saveUserExamResult,
  saveUserPaper,
  StoredExamResult,
  updateUserRoleAndStatus,
  UserRole,
  UserStatus,
  verifySessionToken,
} from './server/db.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const EXTRACT_SCRIPT = path.resolve(__dirname, 'scripts', 'extract_pdf.py');
const SESSION_COOKIE_NAME = 'pacemark_session';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB limit per Criterion 5
  },
  fileFilter: (_req, file, cb) => {
    const isPdfMime = file.mimetype === 'application/pdf' || file.mimetype === 'application/x-pdf';
    const isPdfName = file.originalname.toLowerCase().endsWith('.pdf');
    if (isPdfMime || isPdfName) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type or size exceeded. Only PDF files under 15 MB are supported.'));
    }
  },
});

interface PyMuPdfQuestion {
  questionNumber?: string;
  stemContext?: string;
  prompt: string;
  marks: number;
  recommendedTimeSeconds?: number;
  topicCategory?: string;
  rubricKeywords?: string[];
  page?: number;
}

interface PyMuPdfOutput {
  title?: string;
  pageCount?: number;
  characterCount?: number;
  needsOcr?: boolean;
  extractedText?: string;
  questions?: PyMuPdfQuestion[];
  error?: string;
}

interface AuthedRequest extends Request {
  currentUser?: PublicUser;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

function resolveSessionUser(req: Request): PublicUser | null {
  let token: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (!token) {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies[SESSION_COOKIE_NAME] || null;
  }
  if (!token) return null;

  const userId = verifySessionToken(token);
  if (!userId) return null;

  const user = getUserById(userId);
  if (!user || user.status === 'suspended') return null;
  return user;
}

function setSessionCookie(req: Request, res: Response, token: string) {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    req.headers.origin?.startsWith('https://');
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: Boolean(isHttps),
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearSessionCookie(req: Request, res: Response) {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    req.headers.origin?.startsWith('https://');
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: Boolean(isHttps),
    path: '/',
  });
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const user = resolveSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  req.currentUser = user;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const user = resolveSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Administrator sign-in required.' });
    return;
  }
  if (user.role !== 'admin') {
    res.status(403).json({ error: 'Administrator privileges required.' });
    return;
  }
  req.currentUser = user;
  next();
}

async function runPdfQuestionParser(buffer: Buffer): Promise<PyMuPdfOutput> {
  const geometry = await extractPdfGeometryWithPdfJs(buffer);
  return new Promise((resolve, reject) => {
    const child = spawn('python3', [EXTRACT_SCRIPT, '--stdin-spans'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGKILL');
        reject(new Error('PDF analysis timed out. Please try a smaller PDF.'));
      }
    }, 25_000);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Failed to launch python3: ${err.message}`));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdout.trim() || '{}') as PyMuPdfOutput;
        if (code !== 0 || parsed.error) {
          reject(new Error(parsed.error || stderr.trim() || `Question parser exited with code ${code}`));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new Error(stderr.trim() || `Invalid output from question parser (exit ${code})`));
      }
    });

    child.stdin.write(JSON.stringify(geometry));
    child.stdin.end();
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // ---------- Auth Endpoints ----------
  app.get('/api/auth/me', (req: Request, res: Response) => {
    const user = resolveSessionUser(req);
    if (!user) {
      res.json({ user: null, papers: [], history: [] });
      return;
    }
    res.json({
      user,
      papers: getUserPapers(user.id),
      history: getUserExamResults(user.id),
    });
  });

  app.post('/api/auth/check-username', (req: Request, res: Response) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const scope = req.body?.scope === 'admin' ? 'admin' : 'user';

    if (!username) {
      res.status(400).json({ error: 'Please enter a Username/Email first.' });
      return;
    }

    const result = checkUsernameEligibility(username, scope);
    res.json(result);
  });

  app.post('/api/auth/register', (req: Request, res: Response) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (req.body?.role && req.body.role !== 'user') {
      res.status(403).json({ error: 'Administrator accounts cannot be created via sign-up.' });
      return;
    }
    if (username.length < 2 || username.length > 64) {
      res.status(400).json({ error: 'Username/Email must be between 2 and 64 characters.' });
      return;
    }
    const hasMinLen = password.length >= 8 && password.length <= 128;
    const hasNum = /\d/.test(password);
    const hasSpecial = /[^A-Za-z0-9\s]/.test(password);
    if (!hasMinLen || !hasNum || !hasSpecial) {
      res.status(400).json({
        error: 'Password must be at least 8 characters and include at least 1 number and 1 special character.',
      });
      return;
    }

    try {
      const user = createUser(username, password);
      const token = createSessionToken(user.id);
      setSessionCookie(req, res, token);
      res.status(201).json({
        user,
        token,
        papers: [],
        history: [],
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'USERNAME_EXISTS') {
        res.status(409).json({ error: 'An account with that Username/Email already exists.' });
        return;
      }
      res.status(500).json({ error: 'Failed to register account.' });
    }
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const adminOnly = Boolean(req.body?.adminOnly);

    if (!username || !password) {
      res.status(400).json({ error: 'Please enter both Username/Email and Password.' });
      return;
    }

    const result = authenticateUser(username, password);
    if (result === null) {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }
    if (result === 'SUSPENDED') {
      res.status(403).json({ error: 'This account has been suspended by an administrator.' });
      return;
    }
    if (adminOnly && result.role !== 'admin') {
      res.status(403).json({ error: 'Administrator privileges are required to sign in here.' });
      return;
    }

    const token = createSessionToken(result.id);
    setSessionCookie(req, res, token);

    res.json({
      user: result,
      token,
      papers: getUserPapers(result.id),
      history: getUserExamResults(result.id),
    });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  // ---------- Exam Results Persistence ----------
  app.post('/api/results', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const body = req.body || {};

    if (typeof body.paperTitle !== 'string' || typeof body.scorePercent !== 'number') {
      res.status(400).json({ error: 'Invalid exam result payload.' });
      return;
    }

    const saved = saveUserExamResult(user.id, {
      id: typeof body.id === 'string' ? body.id : '',
      paperTitle: body.paperTitle.slice(0, 200),
      scorePercent: Math.max(0, Math.min(100, Math.round(body.scorePercent))),
      avgTimeLabel: typeof body.avgTimeLabel === 'string' ? body.avgTimeLabel.slice(0, 40) : '1m 20s',
      questionsAnswered: Number(body.questionsAnswered ?? 0),
      totalQuestions: Number(body.totalQuestions ?? 5),
      summary: typeof body.summary === 'string' ? body.summary.slice(0, 500) : '',
      topicScores: body.topicScores || {
        computerSystems: 72,
        dataStructures: 58,
        softwareEngineering: 91,
      },
      topicBreakdown: Array.isArray(body.topicBreakdown) ? body.topicBreakdown : [],
      questionLogs: Array.isArray(body.questionLogs) ? body.questionLogs : [],
      completedAt: typeof body.completedAt === 'string' ? body.completedAt : new Date().toISOString(),
    } as StoredExamResult);

    res.status(201).json({ result: saved });
  });

  // ---------- Binary Performance PDF Report Export ----------
  app.post('/api/reports/pdf', async (req: Request, res: Response) => {
    try {
      const user = resolveSessionUser(req);
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const payload = {
        ...body,
        username: typeof body.username === 'string' && body.username.trim()
          ? body.username.trim()
          : user?.username || 'Student',
      };
      const pdfBuffer = await buildReportPdfWithPdfLib(payload);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="performance-analysis-report.pdf"');
      res.send(pdfBuffer);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to generate PDF report.',
      });
    }
  });

  // ---------- PyMuPDF Analysis & Paper Persistence ----------
  app.post(
    '/api/papers/analyze',
    upload.single('file'),
    async (req: Request, res: Response) => {
      if (!req.file) {
        res.status(400).json({ error: 'No PDF file was uploaded.' });
        return;
      }

      const header = req.file.buffer.subarray(0, 5).toString('ascii');
      if (header !== '%PDF-') {
        res.status(400).json({ error: 'Invalid PDF file header. Please upload a genuine PDF document.' });
        return;
      }

      try {
        const analysis = await runPdfQuestionParser(req.file.buffer);
        const fallbackTitle = req.file.originalname.replace(/\.pdf$/i, '').trim() || 'Uploaded Paper';
        const resolvedTitle =
          analysis.title && analysis.title.length > 2 ? analysis.title : fallbackTitle;
        const pageCount = analysis.pageCount ?? 0;
        const extractedText = analysis.extractedText ?? '';
        const needsOcr = Boolean(analysis.needsOcr);
        const questions = Array.isArray(analysis.questions) ? analysis.questions : [];

        const user = resolveSessionUser(req);
        let savedId = `uploaded-${Date.now()}`;
        if (user) {
          const saved = saveUserPaper(user.id, {
            title: resolvedTitle,
            pageCount,
            extractedText,
            needsOcr,
            questions,
          });
          savedId = saved.id;
        }

        res.json({
          id: savedId,
          title: resolvedTitle,
          fileName: req.file.originalname,
          pageCount,
          characterCount: analysis.characterCount ?? 0,
          needsOcr,
          extractedText,
          questions,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to analyze PDF document.';
        res.status(422).json({ error: message });
      }
    },
  );

  // ---------- Admin Console APIs (strict RBAC via requireAdmin) ----------
  app.get('/api/admin/users', requireAdmin, (req: AuthedRequest, res: Response) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const filter = typeof req.query.filter === 'string' ? req.query.filter : 'all';

    const { overview, users } = listAllUsersForAdmin();

    const filteredUsers = users.filter((u) => {
      if (filter === 'admin' && u.role !== 'admin') return false;
      if (filter === 'user' && u.role !== 'user') return false;
      if (filter === 'suspended' && u.status !== 'suspended') return false;
      if (query && !u.username.toLowerCase().includes(query) && !u.id.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });

    res.json({ overview, users: filteredUsers });
  });

  app.get('/api/admin/users/:id', requireAdmin, (req: AuthedRequest, res: Response) => {
    const targetId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const detail = getAdminUserDetail(targetId);
    if (!detail) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    res.json(detail);
  });

  app.patch('/api/admin/users/:id', requireAdmin, (req: AuthedRequest, res: Response) => {
    const targetId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const currentAdmin = req.currentUser!;
    const role = req.body?.role as UserRole | undefined;
    const status = req.body?.status as UserStatus | undefined;

    if (role !== undefined && role !== 'user' && role !== 'admin') {
      res.status(400).json({ error: 'Invalid role value.' });
      return;
    }
    if (status !== undefined && status !== 'active' && status !== 'suspended') {
      res.status(400).json({ error: 'Invalid status value.' });
      return;
    }

    if (targetId === currentAdmin.id) {
      if (role === 'user') {
        res.status(400).json({ error: 'You cannot demote your own active admin account.' });
        return;
      }
      if (status === 'suspended') {
        res.status(400).json({ error: 'You cannot suspend your own active admin account.' });
        return;
      }
    }

    const updated = updateUserRoleAndStatus(targetId, { role, status });
    if (!updated) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.json({ user: updated });
  });

  app.get('/api/admin/audit-logs', requireAdmin, (req: AuthedRequest, res: Response) => {
    const rawEvent = typeof req.query.event === 'string' ? req.query.event : 'all';
    const eventType =
      rawEvent === 'signup' || rawEvent === 'login' ? rawEvent : undefined;
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const logs = listAuthAuditLogs({ eventType, query, limit: 150 });
    res.json({ logs });
  });

  // Multer & upload error handler
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'Invalid file type or size exceeded. Maximum PDF size is 15 MB.' });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  });

  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
