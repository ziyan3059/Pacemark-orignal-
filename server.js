import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { buildReportPdfWithPdfLib, extractPdfGeometryWithPdfJs } from './server/pdfService.js';
import {
  authenticateUser,
  checkUsernameEligibility,
  createSessionToken,
  createUser,
  getUserById,
  getUserExamResults,
  getUserPapers,
  saveUserExamResult,
  saveUserPaper,
  verifySessionToken,
} from './server/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const EXTRACT_SCRIPT = path.resolve(__dirname, 'scripts', 'extract_pdf.py');
const SESSION_COOKIE_NAME = 'pacemark_session';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
  fileFilter: (_request, file, callback) => {
    const isPdfMime = file.mimetype === 'application/pdf' || file.mimetype === 'application/x-pdf';
    const isPdfName = file.originalname.toLowerCase().endsWith('.pdf');
    if (isPdfMime || isPdfName) {
      callback(null, true);
    } else {
      callback(new Error('Invalid file type or size exceeded. Only PDF files under 15 MB are supported.'));
    }
  },
});

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  const cookieMap = {};
  for (const cookieSegment of cookieHeader.split(';')) {
    const equalsIndex = cookieSegment.indexOf('=');
    if (equalsIndex === -1) continue;
    const cookieName = cookieSegment.slice(0, equalsIndex).trim();
    const rawCookieValue = cookieSegment.slice(equalsIndex + 1).trim();
    if (cookieName) {
      try {
        cookieMap[cookieName] = decodeURIComponent(rawCookieValue);
      } catch (decodeError) {
        console.warn(`Malformed URI encoding in cookie "${cookieName}":`, decodeError.message);
        cookieMap[cookieName] = rawCookieValue;
      }
    }
  }
  return cookieMap;
}

function resolveSessionUser(request) {
  let token = null;
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (!token) {
    const cookies = parseCookies(request.headers.cookie);
    token = cookies[SESSION_COOKIE_NAME] || null;
  }
  if (!token) return null;

  const userId = verifySessionToken(token);
  if (!userId) return null;

  const user = getUserById(userId);
  if (!user || user.status === 'suspended') return null;
  return user;
}

function setSessionCookie(request, response, token) {
  const isHttps =
    request.secure ||
    request.headers['x-forwarded-proto'] === 'https' ||
    request.headers.origin?.startsWith('https://');
  response.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: Boolean(isHttps),
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearSessionCookie(request, response) {
  const isHttps =
    request.secure ||
    request.headers['x-forwarded-proto'] === 'https' ||
    request.headers.origin?.startsWith('https://');
  response.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: Boolean(isHttps),
    path: '/',
  });
}

function requireAuth(request, response, next) {
  const user = resolveSessionUser(request);
  if (!user) {
    response.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  request.currentUser = user;
  next();
}

async function runPdfQuestionParser(buffer) {
  const geometry = await extractPdfGeometryWithPdfJs(buffer);
  return new Promise((resolve, reject) => {
    const childProcess = spawn('python3', [EXTRACT_SCRIPT, '--stdin-spans'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let settled = false;

    const timeoutHandle = setTimeout(() => {
      if (!settled) {
        settled = true;
        childProcess.kill('SIGKILL');
        reject(new Error('PDF analysis timed out. Please try a smaller PDF.'));
      }
    }, 25_000);

    childProcess.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString('utf8');
    });

    childProcess.stderr.on('data', (chunk) => {
      stderrBuffer += chunk.toString('utf8');
    });

    childProcess.on('error', (spawnError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      reject(new Error(`Failed to launch python3: ${spawnError.message}`));
    });

    childProcess.on('close', (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      try {
        const parsedOutput = JSON.parse(stdoutBuffer.trim() || '{}');
        if (exitCode !== 0 || parsedOutput.error) {
          reject(
            new Error(
              parsedOutput.error ||
                stderrBuffer.trim() ||
                `Question parser exited with code ${exitCode}`,
            ),
          );
          return;
        }
        resolve(parsedOutput);
      } catch (parseError) {
        console.error('Failed to parse question parser JSON output:', parseError.message);
        reject(
          new Error(
            stderrBuffer.trim() || `Invalid output from question parser (exit ${exitCode})`,
          ),
        );
      }
    });

    childProcess.stdin.write(JSON.stringify(geometry));
    childProcess.stdin.end();
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/auth/me', (request, response) => {
    const user = resolveSessionUser(request);
    if (!user) {
      response.json({ user: null, papers: [], history: [] });
      return;
    }
    response.json({
      user,
      papers: getUserPapers(user.id),
      history: getUserExamResults(user.id),
    });
  });

  app.post('/api/auth/check-username', (request, response) => {
    const username = typeof request.body?.username === 'string' ? request.body.username.trim() : '';

    if (!username) {
      response.status(400).json({ error: 'Please enter a Username/Email first.' });
      return;
    }

    const eligibility = checkUsernameEligibility(username);
    response.json(eligibility);
  });

  app.post('/api/auth/register', (request, response) => {
    const username = typeof request.body?.username === 'string' ? request.body.username.trim() : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';

    if (username.length < 2 || username.length > 64) {
      response.status(400).json({ error: 'Username/Email must be between 2 and 64 characters.' });
      return;
    }
    const hasMinLength = password.length >= 8 && password.length <= 128;
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[^A-Za-z0-9\s]/.test(password);
    if (!hasMinLength || !hasNumber || !hasSpecial) {
      response.status(400).json({
        error: 'Password must be at least 8 characters and include at least 1 number and 1 special character.',
      });
      return;
    }

    try {
      const user = createUser(username, password);
      const token = createSessionToken(user.id);
      setSessionCookie(request, response, token);
      response.status(201).json({
        user,
        token,
        papers: [],
        history: [],
      });
    } catch (registerError) {
      if (registerError instanceof Error && registerError.message === 'USERNAME_EXISTS') {
        response.status(409).json({ error: 'An account with that Username/Email already exists.' });
        return;
      }
      console.error('Account registration failed:', registerError);
      response.status(500).json({ error: 'Failed to register account.' });
    }
  });

  app.post('/api/auth/login', (request, response) => {
    const username = typeof request.body?.username === 'string' ? request.body.username.trim() : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';

    if (!username || !password) {
      response.status(400).json({ error: 'Please enter both Username/Email and Password.' });
      return;
    }

    const authResult = authenticateUser(username, password);
    if (authResult === null) {
      response.status(401).json({ error: 'Invalid username or password.' });
      return;
    }
    if (authResult === 'SUSPENDED') {
      response.status(403).json({ error: 'This account has been suspended.' });
      return;
    }

    const token = createSessionToken(authResult.id);
    setSessionCookie(request, response, token);

    response.json({
      user: authResult,
      token,
      papers: getUserPapers(authResult.id),
      history: getUserExamResults(authResult.id),
    });
  });

  app.post('/api/auth/logout', (request, response) => {
    clearSessionCookie(request, response);
    response.json({ ok: true });
  });

  app.post('/api/results', requireAuth, (request, response) => {
    const user = request.currentUser;
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    const paperTitle = typeof body.paperTitle === 'string' ? body.paperTitle.trim() : '';

    if (
      !paperTitle ||
      typeof body.scorePercent !== 'number' ||
      !Number.isFinite(body.scorePercent)
    ) {
      response.status(400).json({ error: 'Invalid exam result payload.' });
      return;
    }

    const topicBreakdown = Array.isArray(body.topicBreakdown) ? body.topicBreakdown : [];
    const questionLogs = Array.isArray(body.questionLogs) ? body.questionLogs : [];
    const totalQuestions = Math.max(
      0,
      Math.round(Number(body.totalQuestions ?? questionLogs.length)),
    );
    const questionsAnswered = Math.max(
      0,
      Math.min(totalQuestions, Math.round(Number(body.questionsAnswered ?? 0))),
    );

    const savedResult = saveUserExamResult(user.id, {
      id: typeof body.id === 'string' ? body.id : '',
      paperTitle: paperTitle.slice(0, 200),
      scorePercent: Math.max(0, Math.min(100, Math.round(body.scorePercent))),
      avgTimeLabel: typeof body.avgTimeLabel === 'string' ? body.avgTimeLabel.slice(0, 40) : '0s',
      questionsAnswered,
      totalQuestions,
      summary: typeof body.summary === 'string' ? body.summary.slice(0, 500) : '',
      topicBreakdown,
      questionLogs,
      completedAt: typeof body.completedAt === 'string' ? body.completedAt : new Date().toISOString(),
    });

    response.status(201).json({ result: savedResult });
  });

  app.post('/api/reports/pdf', async (request, response) => {
    try {
      const user = resolveSessionUser(request);
      const body = request.body && typeof request.body === 'object' ? request.body : {};
      const payload = {
        ...body,
        username:
          typeof body.username === 'string' && body.username.trim()
            ? body.username.trim()
            : user?.username || 'Student',
      };
      const pdfBuffer = await buildReportPdfWithPdfLib(payload);
      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader('Content-Disposition', 'attachment; filename="performance-analysis-report.pdf"');
      response.send(pdfBuffer);
    } catch (pdfError) {
      console.error('Failed to generate PDF report:', pdfError);
      response.status(500).json({
        error: pdfError instanceof Error ? pdfError.message : 'Failed to generate PDF report.',
      });
    }
  });

  app.post(
    '/api/papers/analyze',
    upload.single('file'),
    async (request, response) => {
      if (!request.file) {
        response.status(400).json({ error: 'No PDF file was uploaded.' });
        return;
      }

      const header = request.file.buffer.subarray(0, 5).toString('ascii');
      if (header !== '%PDF-') {
        response.status(400).json({ error: 'Invalid PDF file header. Please upload a genuine PDF document.' });
        return;
      }

      try {
        const analysis = await runPdfQuestionParser(request.file.buffer);
        const fallbackTitle = request.file.originalname.replace(/\.pdf$/i, '').trim() || 'Uploaded Paper';
        const resolvedTitle =
          analysis.title && analysis.title.length > 2 ? analysis.title : fallbackTitle;
        const pageCount = analysis.pageCount ?? 0;
        const extractedText = analysis.extractedText ?? '';
        const needsOcr = Boolean(analysis.needsOcr);
        const questions = Array.isArray(analysis.questions) ? analysis.questions : [];

        const user = resolveSessionUser(request);
        let savedPaperId = `uploaded-${Date.now()}`;
        if (user) {
          const savedPaper = saveUserPaper(user.id, {
            title: resolvedTitle,
            pageCount,
            extractedText,
            needsOcr,
            questions,
          });
          savedPaperId = savedPaper.id;
        }

        response.json({
          id: savedPaperId,
          title: resolvedTitle,
          fileName: request.file.originalname,
          pageCount,
          characterCount: analysis.characterCount ?? 0,
          needsOcr,
          extractedText,
          questions,
        });
      } catch (analysisError) {
        const message =
          analysisError instanceof Error ? analysisError.message : 'Failed to analyze PDF document.';
        response.status(422).json({ error: message });
      }
    },
  );

  app.use((uploadError, _request, response, next) => {
    if (uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE') {
      response.status(400).json({ error: 'Invalid file type or size exceeded. Maximum PDF size is 15 MB.' });
      return;
    }
    if (uploadError instanceof Error) {
      response.status(400).json({ error: uploadError.message });
      return;
    }
    next(uploadError);
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
    app.get('*', (_request, response) => {
      response.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((startupError) => {
  console.error('Failed to start server:', startupError);
  process.exit(1);
});
