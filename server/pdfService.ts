import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';

export interface PdfSpanGeometry {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  size: number;
  is_bold: boolean;
}

export interface PdfPageGeometry {
  width: number;
  height: number;
  spans: PdfSpanGeometry[];
  rawText: string;
}

export interface ExtractedPdfGeometry {
  title: string;
  pageCount: number;
  imageCount: number;
  pages: PdfPageGeometry[];
}

export async function extractPdfGeometryWithPdfJs(buffer: Buffer): Promise<ExtractedPdfGeometry> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    verbosity: 0,
  });

  let doc: Awaited<typeof loadingTask.promise> | null = null;
  try {
    doc = await loadingTask.promise;
  } catch (err: unknown) {
    const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
    const msg = err instanceof Error ? err.message : String(err);
    if (name === 'PasswordException' || /password/i.test(msg)) {
      throw new Error('This PDF is password-protected. Please upload an unlocked PDF.');
    }
    throw new Error(`Failed to parse PDF document: ${msg}`);
  }

  try {
    const pageCount = doc.numPages;
    if (pageCount === 0) {
      throw new Error('The uploaded PDF contains no pages.');
    }

    let title = '';
    try {
      const meta = await doc.getMetadata();
      const info = meta?.info as Record<string, unknown> | undefined;
      if (info && typeof info.Title === 'string') {
        title = info.Title.trim();
      }
    } catch {
      // Optional metadata
    }

    const pages: PdfPageGeometry[] = [];
    let imageCount = 0;

    for (let i = 1; i <= pageCount; i += 1) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1.0 });
      const pageWidth = viewport.width || 595;
      const pageHeight = viewport.height || 842;

      const textContent = await page.getTextContent();
      const styles = (textContent.styles || {}) as Record<string, { fontFamily?: string }>;
      const spans: PdfSpanGeometry[] = [];
      const rawChunks: string[] = [];

      for (const item of textContent.items) {
        if (!('str' in item)) continue;
        const txt = item.str.replace(/\s+/g, ' ').trim();
        if (!txt) continue;
        rawChunks.push(txt);

        const tx = item.transform || [1, 0, 0, 1, 0, 0];
        const fontSize = Math.max(6, Math.hypot(tx[0] || 0, tx[1] || 0) || item.height || 11);
        const x0 = Number(tx[4] || 0);
        // Convert bottom-up PDF coordinates to top-down coordinates matching PyMuPDF
        const baselineYFromBottom = Number(tx[5] || 0);
        const y1 = Math.max(0, pageHeight - baselineYFromBottom);
        const y0 = Math.max(0, y1 - fontSize);
        const itemWidth = Math.max(2, Number(item.width || txt.length * fontSize * 0.5));
        const x1 = x0 + itemWidth;

        const fontName = item.fontName || '';
        const fontFamily = styles[fontName]?.fontFamily || '';
        const isBold = /bold|black|heavy|semibold|demi/i.test(`${fontName} ${fontFamily}`);

        spans.push({
          text: txt,
          x0,
          y0,
          x1,
          y1,
          size: fontSize,
          is_bold: isBold,
        });
      }

      // Count image paint operators if available
      try {
        const ops = await page.getOperatorList();
        const OPS = pdfjs.OPS;
        if (ops && Array.isArray(ops.fnArray)) {
          for (const fn of ops.fnArray) {
            if (
              fn === OPS.paintImageXObject ||
              fn === OPS.paintInlineImageXObject ||
              fn === OPS.paintImageMaskXObject
            ) {
              imageCount += 1;
            }
          }
        }
      } catch {
        // Non-fatal
      }

      pages.push({
        width: pageWidth,
        height: pageHeight,
        spans,
        rawText: rawChunks.join(' '),
      });
    }

    return { title, pageCount, imageCount, pages };
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

function safeStr(val: unknown, fallback = ''): string {
  if (val === null || val === undefined) return fallback;
  // Strip non-WinAnsi characters so StandardFonts never throws
  return String(val)
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatSeconds(sec: unknown): string {
  const s = Math.max(0, Math.round(Number(sec || 0)));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m === 0 ? `${rem}s` : `${m}m ${String(rem).padStart(2, '0')}s`;
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = safeStr(text).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

export async function buildReportPdfWithPdfLib(payload: Record<string, unknown>): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageW = 595;
  const pageH = 842;
  const margin = 42;
  const contentW = pageW - margin * 2;

  let page: PDFPage = pdfDoc.addPage([pageW, pageH]);
  // topY tracks distance from TOP of page downwards; convert to PDF y via (pageH - topY)
  let topY = margin;

  const ensureSpace = (needed: number) => {
    if (topY + needed <= pageH - margin) return;
    page = pdfDoc.addPage([pageW, pageH]);
    topY = margin;
  };

  // Header Banner (#2C3E50 deep slate)
  const bannerH = 64;
  page.drawRectangle({
    x: margin,
    y: pageH - margin - bannerH,
    width: contentW,
    height: bannerH,
    color: rgb(0.173, 0.243, 0.314),
  });
  page.drawText('Performance Analysis Report', {
    x: margin + 16,
    y: pageH - margin - 26,
    size: 16,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  const paperTitle = safeStr(payload.paperTitle, 'Exam Paper');
  const username = safeStr(payload.username, 'Student');
  const completedAt = safeStr(payload.completedAt, '');
  const subtitleParts = [`${paperTitle}`, `Candidate: ${username}`];
  if (completedAt) {
    subtitleParts.push(completedAt.slice(0, 16).replace('T', ' '));
  }
  page.drawText(subtitleParts.join('  |  ').slice(0, 96), {
    x: margin + 16,
    y: pageH - margin - 47,
    size: 9.5,
    font: fontRegular,
    color: rgb(0.86, 0.9, 0.94),
  });

  topY = margin + 84;

  // Overall Summary Metrics
  const score = Math.max(0, Math.min(100, Math.round(Number(payload.scorePercent || 0))));
  const avgTime = safeStr(payload.avgTimeLabel, '0s');
  const answered = Math.max(0, Math.round(Number(payload.questionsAnswered || 0)));
  const totalQ = Math.max(0, Math.round(Number(payload.totalQuestions || 0)));
  const summary = safeStr(payload.summary, '');

  page.drawText(
    `Overall Score: ${score}%    |    Avg Time/Q: ${avgTime}    |    Answered: ${answered}/${totalQ}`,
    {
      x: margin,
      y: pageH - topY,
      size: 12,
      font: fontBold,
      color: rgb(0.06, 0.09, 0.16),
    },
  );
  topY += 18;

  if (summary) {
    const wrapped = wrapText(summary, fontRegular, 9.5, contentW);
    for (const line of wrapped.slice(0, 4)) {
      page.drawText(line, {
        x: margin,
        y: pageH - topY,
        size: 9.5,
        font: fontRegular,
        color: rgb(0.24, 0.29, 0.36),
      });
      topY += 13;
    }
    topY += 6;
  }

  // Priority Weakness Ranking & Vector Bar Chart
  ensureSpace(140);
  page.drawLine({
    start: { x: margin, y: pageH - topY },
    end: { x: pageW - margin, y: pageH - topY },
    thickness: 0.8,
    color: rgb(0.82, 0.85, 0.89),
  });
  topY += 18;

  page.drawText('Priority Weakness Ranking (60% Time Ratio + 40% Accuracy Deficit)', {
    x: margin,
    y: pageH - topY,
    size: 11.5,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16),
  });
  topY += 20;

  let topics = Array.isArray(payload.topicBreakdown)
    ? (payload.topicBreakdown as Array<Record<string, unknown>>)
    : [];
  if (topics.length === 0) {
    const ts = (payload.topicScores || {}) as Record<string, unknown>;
    topics = [
      {
        topic: 'Data Structures',
        scorePercent: Number(ts.dataStructures ?? 58),
        weaknessIndex: 0.9,
        status: 'Priority Revision',
        action: 'Revise core algorithms and trace tables.',
      },
      {
        topic: 'Computer Systems',
        scorePercent: Number(ts.computerSystems ?? 74),
        weaknessIndex: 0.65,
        status: 'Needs Pacing',
        action: 'Practice timed CPU/memory questions.',
      },
      {
        topic: 'Software Engineering',
        scorePercent: Number(ts.softwareEngineering ?? 91),
        weaknessIndex: 0.35,
        status: 'Strong',
        action: 'Maintain current pace.',
      },
    ];
  }

  const barX = margin + 175;
  const barMaxW = contentW - 265;

  topics.forEach((t, idx) => {
    ensureSpace(44);
    const tName = safeStr(t.topic, `Topic ${idx + 1}`);
    const tScore = Math.max(0, Math.min(100, Math.round(Number(t.scorePercent ?? 0))));
    const tWeak = Number(t.weaknessIndex ?? 0.5);
    const tStatus = safeStr(t.status, 'Needs Pacing');
    const tAction = safeStr(t.action, '');

    let barColor = rgb(0.02, 0.59, 0.41);
    if (/priority/i.test(tStatus) || tWeak >= 0.85) {
      barColor = rgb(0.86, 0.15, 0.15);
    } else if (/pacing/i.test(tStatus) || tWeak >= 0.55) {
      barColor = rgb(0.85, 0.47, 0.02);
    }

    page.drawText(`${idx + 1}. ${tName.slice(0, 24)}`, {
      x: margin,
      y: pageH - (topY + 9),
      size: 9.5,
      font: fontBold,
      color: rgb(0.06, 0.09, 0.16),
    });

    // Track
    page.drawRectangle({
      x: barX,
      y: pageH - (topY + 11),
      width: barMaxW,
      height: 10,
      color: rgb(0.91, 0.93, 0.96),
    });
    // Fill
    const fillW = Math.max(4, barMaxW * (tScore / 100));
    page.drawRectangle({
      x: barX,
      y: pageH - (topY + 11),
      width: fillW,
      height: 10,
      color: barColor,
    });

    page.drawText(`${tScore}% (${tStatus})`, {
      x: barX + barMaxW + 8,
      y: pageH - (topY + 9),
      size: 8.5,
      font: fontRegular,
      color: rgb(0.18, 0.23, 0.3),
    });

    topY += 18;
    if (tAction) {
      page.drawText(`Action: ${tAction.slice(0, 92)}`, {
        x: margin + 12,
        y: pageH - (topY + 7),
        size: 8.5,
        font: fontRegular,
        color: rgb(0.35, 0.4, 0.48),
      });
      topY += 17;
    } else {
      topY += 6;
    }
  });

  // Per-Question Timing, Marks & Confidence Table
  const qLogs = Array.isArray(payload.questionLogs)
    ? (payload.questionLogs as Array<Record<string, unknown>>)
    : [];

  if (qLogs.length > 0) {
    ensureSpace(75);
    topY += 8;
    page.drawLine({
      start: { x: margin, y: pageH - topY },
      end: { x: pageW - margin, y: pageH - topY },
      thickness: 0.8,
      color: rgb(0.82, 0.85, 0.89),
    });
    topY += 18;

    page.drawText('Per-Question Timing, Marks & Confidence Log', {
      x: margin,
      y: pageH - topY,
      size: 11.5,
      font: fontBold,
      color: rgb(0.06, 0.09, 0.16),
    });
    topY += 14;

    const drawTableHeader = () => {
      page.drawRectangle({
        x: margin,
        y: pageH - (topY + 18),
        width: contentW,
        height: 18,
        color: rgb(0.94, 0.95, 0.97),
      });
      page.drawText('Question', { x: margin + 6, y: pageH - (topY + 12), size: 8.5, font: fontBold, color: rgb(0.2, 0.25, 0.32) });
      page.drawText('Topic', { x: margin + 175, y: pageH - (topY + 12), size: 8.5, font: fontBold, color: rgb(0.2, 0.25, 0.32) });
      page.drawText('Marks', { x: margin + 320, y: pageH - (topY + 12), size: 8.5, font: fontBold, color: rgb(0.2, 0.25, 0.32) });
      page.drawText('Time / Target', { x: margin + 375, y: pageH - (topY + 12), size: 8.5, font: fontBold, color: rgb(0.2, 0.25, 0.32) });
      page.drawText('Conf.', { x: margin + 462, y: pageH - (topY + 12), size: 8.5, font: fontBold, color: rgb(0.2, 0.25, 0.32) });
      topY += 24;
    };

    drawTableHeader();

    qLogs.forEach((q, idx) => {
      if (topY + 24 > pageH - margin) {
        page = pdfDoc.addPage([pageW, pageH]);
        topY = margin;
        drawTableHeader();
      }
      const qNum = safeStr(q.questionNumber, `Q${idx + 1}`);
      const promptSnip = safeStr(q.prompt, '').slice(0, 28);
      const topicSnip = safeStr(q.topicCategory, 'General').slice(0, 22);
      const mAw = Math.round(Number(q.marksAwarded ?? 0));
      const mTot = Math.max(1, Math.round(Number(q.totalMarks ?? q.marksAvailable ?? 1)));
      const tSpent = formatSeconds(q.timeSpentSeconds);
      const tRec = formatSeconds(q.recommendedTimeSeconds ?? 60);
      const conf = Math.max(1, Math.min(5, Math.round(Number(q.confidence ?? 3))));

      page.drawText(`${qNum}: ${promptSnip}`, {
        x: margin + 6,
        y: pageH - (topY + 10),
        size: 8.2,
        font: fontRegular,
        color: rgb(0.08, 0.1, 0.15),
      });
      page.drawText(topicSnip, {
        x: margin + 175,
        y: pageH - (topY + 10),
        size: 8.2,
        font: fontRegular,
        color: rgb(0.25, 0.3, 0.38),
      });
      page.drawText(`${mAw}/${mTot}`, {
        x: margin + 320,
        y: pageH - (topY + 10),
        size: 8.2,
        font: fontRegular,
        color: rgb(0.08, 0.1, 0.15),
      });
      page.drawText(`${tSpent} / ${tRec}`, {
        x: margin + 375,
        y: pageH - (topY + 10),
        size: 8.2,
        font: fontRegular,
        color: rgb(0.08, 0.1, 0.15),
      });
      page.drawText(`${conf}/5`, {
        x: margin + 465,
        y: pageH - (topY + 10),
        size: 8.2,
        font: fontRegular,
        color: rgb(0.08, 0.1, 0.15),
      });
      page.drawLine({
        start: { x: margin, y: pageH - (topY + 16) },
        end: { x: pageW - margin, y: pageH - (topY + 16) },
        thickness: 0.5,
        color: rgb(0.91, 0.93, 0.95),
      });
      topY += 19;
    });
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
