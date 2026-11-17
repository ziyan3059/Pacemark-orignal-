import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function extractPdfGeometryWithPdfJs(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    verbosity: 0,
  });

  let pdfDocument = null;
  try {
    pdfDocument = await loadingTask.promise;
  } catch (loadError) {
    const errorName = loadError && typeof loadError === 'object' && 'name' in loadError ? String(loadError.name) : '';
    const errorMessage = loadError instanceof Error ? loadError.message : String(loadError);
    if (errorName === 'PasswordException' || /password/i.test(errorMessage)) {
      throw new Error('This PDF is password-protected. Please upload an unlocked PDF.');
    }
    throw new Error(`Failed to parse PDF document: ${errorMessage}`);
  }

  try {
    const pageCount = pdfDocument.numPages;
    if (pageCount === 0) {
      throw new Error('The uploaded PDF contains no pages.');
    }

    let documentTitle = '';
    try {
      const metadata = await pdfDocument.getMetadata();
      const metadataInfo = metadata?.info;
      if (metadataInfo && typeof metadataInfo.Title === 'string') {
        documentTitle = metadataInfo.Title.trim();
      }
    } catch (metadataError) {
      console.warn('Could not read PDF title metadata:', metadataError.message);
    }

    const pages = [];
    let imageCount = 0;

    for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
      const page = await pdfDocument.getPage(pageIndex);
      const viewport = page.getViewport({ scale: 1.0 });
      const pageWidth = viewport.width || 595;
      const pageHeight = viewport.height || 842;

      const textContent = await page.getTextContent();
      const styles = textContent.styles || {};
      const spans = [];
      const rawTextChunks = [];

      for (const textItem of textContent.items) {
        if (!('str' in textItem)) continue;
        const normalizedText = textItem.str.replace(/\s+/g, ' ').trim();
        if (!normalizedText) continue;
        rawTextChunks.push(normalizedText);

        const matrix = textItem.transform || [1, 0, 0, 1, 0, 0];
        const fontSize = Math.max(6, Math.hypot(matrix[0] || 0, matrix[1] || 0) || textItem.height || 11);
        const leftX = Number(matrix[4] || 0);
        // Invert PDF bottom-up Y coordinate into top-down visual coordinates
        const baselineYFromBottom = Number(matrix[5] || 0);
        const bottomY = Math.max(0, pageHeight - baselineYFromBottom);
        const topY = Math.max(0, bottomY - fontSize);
        const itemWidth = Math.max(2, Number(textItem.width || normalizedText.length * fontSize * 0.5));
        const rightX = leftX + itemWidth;

        const fontName = textItem.fontName || '';
        const fontFamily = styles[fontName]?.fontFamily || '';
        const isBold = /bold|black|heavy|semibold|demi/i.test(`${fontName} ${fontFamily}`);

        spans.push({
          text: normalizedText,
          x0: leftX,
          y0: topY,
          x1: rightX,
          y1: bottomY,
          size: fontSize,
          is_bold: isBold,
        });
      }

      try {
        const operatorList = await page.getOperatorList();
        const pdfOperators = pdfjs.OPS;
        if (operatorList && Array.isArray(operatorList.fnArray)) {
          for (const operatorCode of operatorList.fnArray) {
            if (
              operatorCode === pdfOperators.paintImageXObject ||
              operatorCode === pdfOperators.paintInlineImageXObject ||
              operatorCode === pdfOperators.paintImageMaskXObject
            ) {
              imageCount += 1;
            }
          }
        }
      } catch (operatorError) {
        console.warn(`Could not inspect operators on page ${pageIndex}:`, operatorError.message);
      }

      pages.push({
        width: pageWidth,
        height: pageHeight,
        spans,
        rawText: rawTextChunks.join(' '),
      });
    }

    return { title: documentTitle, pageCount, imageCount, pages };
  } finally {
    await loadingTask.destroy().catch((destroyError) => {
      console.warn('PDF loading task cleanup warning:', destroyError.message);
    });
  }
}

function sanitizePdfText(rawValue, fallback = '') {
  if (rawValue === null || rawValue === undefined) return fallback;
  // Standard Helvetica fonts only support WinAnsi/Latin-1 codepoints
  return String(rawValue)
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatSeconds(totalSeconds) {
  const safeSeconds = Math.max(0, Math.round(Number(totalSeconds || 0)));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return minutes === 0 ? `${remainingSeconds}s` : `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
}

function wrapText(text, font, fontSize, maxWidth) {
  const words = sanitizePdfText(text).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const wrappedLines = [];
  let currentLine = words[0];
  for (let wordIndex = 1; wordIndex < words.length; wordIndex += 1) {
    const candidateLine = `${currentLine} ${words[wordIndex]}`;
    if (font.widthOfTextAtSize(candidateLine, fontSize) <= maxWidth) {
      currentLine = candidateLine;
    } else {
      wrappedLines.push(currentLine);
      currentLine = words[wordIndex];
    }
  }
  wrappedLines.push(currentLine);
  return wrappedLines;
}

export async function buildReportPdfWithPdfLib(payload) {
  const pdfDocument = await PDFDocument.create();
  const regularFont = await pdfDocument.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDocument.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595;
  const pageHeight = 842;
  const pageMargin = 42;
  const contentWidth = pageWidth - pageMargin * 2;

  let currentPage = pdfDocument.addPage([pageWidth, pageHeight]);
  let cursorTopY = pageMargin;

  const ensureVerticalSpace = (requiredHeight) => {
    if (cursorTopY + requiredHeight <= pageHeight - pageMargin) return;
    currentPage = pdfDocument.addPage([pageWidth, pageHeight]);
    cursorTopY = pageMargin;
  };

  const bannerHeight = 64;
  currentPage.drawRectangle({
    x: pageMargin,
    y: pageHeight - pageMargin - bannerHeight,
    width: contentWidth,
    height: bannerHeight,
    color: rgb(0.173, 0.243, 0.314),
  });
  currentPage.drawText('Performance Analysis Report', {
    x: pageMargin + 16,
    y: pageHeight - pageMargin - 26,
    size: 16,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  const paperTitle = sanitizePdfText(payload.paperTitle, 'Exam Paper');
  const username = sanitizePdfText(payload.username, 'Student');
  const completedAt = sanitizePdfText(payload.completedAt, '');
  const subtitleParts = [paperTitle, `Candidate: ${username}`];
  if (completedAt) {
    subtitleParts.push(completedAt.slice(0, 16).replace('T', ' '));
  }
  currentPage.drawText(subtitleParts.join('  |  ').slice(0, 96), {
    x: pageMargin + 16,
    y: pageHeight - pageMargin - 47,
    size: 9.5,
    font: regularFont,
    color: rgb(0.86, 0.9, 0.94),
  });

  cursorTopY = pageMargin + 84;

  const overallScore = Math.max(0, Math.min(100, Math.round(Number(payload.scorePercent || 0))));
  const avgTimeLabel = sanitizePdfText(payload.avgTimeLabel, '0s');
  const questionsAnswered = Math.max(0, Math.round(Number(payload.questionsAnswered || 0)));
  const totalQuestions = Math.max(0, Math.round(Number(payload.totalQuestions || 0)));
  const summaryText = sanitizePdfText(payload.summary, '');

  currentPage.drawText(
    `Overall Score: ${overallScore}%    |    Avg Time/Q: ${avgTimeLabel}    |    Answered: ${questionsAnswered}/${totalQuestions}`,
    {
      x: pageMargin,
      y: pageHeight - cursorTopY,
      size: 12,
      font: boldFont,
      color: rgb(0.06, 0.09, 0.16),
    },
  );
  cursorTopY += 18;

  if (summaryText) {
    const wrappedSummaryLines = wrapText(summaryText, regularFont, 9.5, contentWidth);
    for (const summaryLine of wrappedSummaryLines.slice(0, 4)) {
      currentPage.drawText(summaryLine, {
        x: pageMargin,
        y: pageHeight - cursorTopY,
        size: 9.5,
        font: regularFont,
        color: rgb(0.24, 0.29, 0.36),
      });
      cursorTopY += 13;
    }
    cursorTopY += 6;
  }

  ensureVerticalSpace(140);
  currentPage.drawLine({
    start: { x: pageMargin, y: pageHeight - cursorTopY },
    end: { x: pageWidth - pageMargin, y: pageHeight - cursorTopY },
    thickness: 0.8,
    color: rgb(0.82, 0.85, 0.89),
  });
  cursorTopY += 18;

  currentPage.drawText('Priority Weakness Ranking (60% Time Ratio + 40% Accuracy Deficit)', {
    x: pageMargin,
    y: pageHeight - cursorTopY,
    size: 11.5,
    font: boldFont,
    color: rgb(0.06, 0.09, 0.16),
  });
  cursorTopY += 20;

  const topicBreakdown = Array.isArray(payload.topicBreakdown) ? payload.topicBreakdown : [];
  if (topicBreakdown.length === 0) {
    currentPage.drawText('No topic breakdown was recorded for this session.', {
      x: pageMargin,
      y: pageHeight - cursorTopY,
      size: 9.5,
      font: regularFont,
      color: rgb(0.35, 0.4, 0.48),
    });
    cursorTopY += 20;
  } else {
    const barOriginX = pageMargin + 175;
    const barMaxWidth = contentWidth - 265;

    topicBreakdown.forEach((topicItem, topicIndex) => {
      ensureVerticalSpace(44);
      const topicName = sanitizePdfText(topicItem.topic, `Topic ${topicIndex + 1}`);
      const topicScore = Math.max(0, Math.min(100, Math.round(Number(topicItem.scorePercent ?? 0))));
      const weaknessScore = Number(topicItem.weaknessIndex ?? 0.5);
      const topicStatus = sanitizePdfText(topicItem.status, 'Needs Pacing');
      const recommendedAction = sanitizePdfText(topicItem.action, '');

      let barColor = rgb(0.02, 0.59, 0.41);
      if (/priority/i.test(topicStatus) || weaknessScore >= 0.85) {
        barColor = rgb(0.86, 0.15, 0.15);
      } else if (/pacing/i.test(topicStatus) || weaknessScore >= 0.55) {
        barColor = rgb(0.85, 0.47, 0.02);
      }

      currentPage.drawText(`${topicIndex + 1}. ${topicName.slice(0, 24)}`, {
        x: pageMargin,
        y: pageHeight - (cursorTopY + 9),
        size: 9.5,
        font: boldFont,
        color: rgb(0.06, 0.09, 0.16),
      });

      currentPage.drawRectangle({
        x: barOriginX,
        y: pageHeight - (cursorTopY + 11),
        width: barMaxWidth,
        height: 10,
        color: rgb(0.91, 0.93, 0.96),
      });

      const filledBarWidth = Math.max(4, barMaxWidth * (topicScore / 100));
      currentPage.drawRectangle({
        x: barOriginX,
        y: pageHeight - (cursorTopY + 11),
        width: filledBarWidth,
        height: 10,
        color: barColor,
      });

      currentPage.drawText(`${topicScore}% (${topicStatus})`, {
        x: barOriginX + barMaxWidth + 8,
        y: pageHeight - (cursorTopY + 9),
        size: 8.5,
        font: regularFont,
        color: rgb(0.18, 0.23, 0.3),
      });

      cursorTopY += 18;
      if (recommendedAction) {
        currentPage.drawText(`Action: ${recommendedAction.slice(0, 92)}`, {
          x: pageMargin + 12,
          y: pageHeight - (cursorTopY + 7),
          size: 8.5,
          font: regularFont,
          color: rgb(0.35, 0.4, 0.48),
        });
        cursorTopY += 17;
      } else {
        cursorTopY += 6;
      }
    });
  }

  const questionLogs = Array.isArray(payload.questionLogs) ? payload.questionLogs : [];

  if (questionLogs.length > 0) {
    ensureVerticalSpace(75);
    cursorTopY += 8;
    currentPage.drawLine({
      start: { x: pageMargin, y: pageHeight - cursorTopY },
      end: { x: pageWidth - pageMargin, y: pageHeight - cursorTopY },
      thickness: 0.8,
      color: rgb(0.82, 0.85, 0.89),
    });
    cursorTopY += 18;

    currentPage.drawText('Per-Question Timing, Marks & Confidence Log', {
      x: pageMargin,
      y: pageHeight - cursorTopY,
      size: 11.5,
      font: boldFont,
      color: rgb(0.06, 0.09, 0.16),
    });
    cursorTopY += 14;

    const drawTableHeader = () => {
      currentPage.drawRectangle({
        x: pageMargin,
        y: pageHeight - (cursorTopY + 18),
        width: contentWidth,
        height: 18,
        color: rgb(0.94, 0.95, 0.97),
      });
      currentPage.drawText('Question', { x: pageMargin + 6, y: pageHeight - (cursorTopY + 12), size: 8.5, font: boldFont, color: rgb(0.2, 0.25, 0.32) });
      currentPage.drawText('Topic', { x: pageMargin + 175, y: pageHeight - (cursorTopY + 12), size: 8.5, font: boldFont, color: rgb(0.2, 0.25, 0.32) });
      currentPage.drawText('Marks', { x: pageMargin + 320, y: pageHeight - (cursorTopY + 12), size: 8.5, font: boldFont, color: rgb(0.2, 0.25, 0.32) });
      currentPage.drawText('Time / Target', { x: pageMargin + 375, y: pageHeight - (cursorTopY + 12), size: 8.5, font: boldFont, color: rgb(0.2, 0.25, 0.32) });
      currentPage.drawText('Conf.', { x: pageMargin + 462, y: pageHeight - (cursorTopY + 12), size: 8.5, font: boldFont, color: rgb(0.2, 0.25, 0.32) });
      cursorTopY += 24;
    };

    drawTableHeader();

    questionLogs.forEach((questionEntry, questionIndex) => {
      if (cursorTopY + 24 > pageHeight - pageMargin) {
        currentPage = pdfDocument.addPage([pageWidth, pageHeight]);
        cursorTopY = pageMargin;
        drawTableHeader();
      }
      const questionLabel = sanitizePdfText(questionEntry.questionNumber, `Q${questionIndex + 1}`);
      const promptSnippet = sanitizePdfText(questionEntry.prompt, '').slice(0, 28);
      const topicSnippet = sanitizePdfText(questionEntry.topicCategory, 'General').slice(0, 22);
      const awardedMarks = Math.round(Number(questionEntry.marksAwarded ?? 0));
      const totalMarks = Math.max(1, Math.round(Number(questionEntry.totalMarks ?? questionEntry.marksAvailable ?? 1)));
      const timeSpentLabel = formatSeconds(questionEntry.timeSpentSeconds);
      const recommendedTimeLabel = formatSeconds(questionEntry.recommendedTimeSeconds ?? 60);
      const confidenceScore =
        questionEntry.confidence == null
          ? null
          : Math.max(1, Math.min(5, Math.round(Number(questionEntry.confidence))));

      currentPage.drawText(`${questionLabel}: ${promptSnippet}`, {
        x: pageMargin + 6,
        y: pageHeight - (cursorTopY + 10),
        size: 8.2,
        font: regularFont,
        color: rgb(0.08, 0.1, 0.15),
      });
      currentPage.drawText(topicSnippet, {
        x: pageMargin + 175,
        y: pageHeight - (cursorTopY + 10),
        size: 8.2,
        font: regularFont,
        color: rgb(0.25, 0.3, 0.38),
      });
      currentPage.drawText(`${awardedMarks}/${totalMarks}`, {
        x: pageMargin + 320,
        y: pageHeight - (cursorTopY + 10),
        size: 8.2,
        font: regularFont,
        color: rgb(0.08, 0.1, 0.15),
      });
      currentPage.drawText(`${timeSpentLabel} / ${recommendedTimeLabel}`, {
        x: pageMargin + 375,
        y: pageHeight - (cursorTopY + 10),
        size: 8.2,
        font: regularFont,
        color: rgb(0.08, 0.1, 0.15),
      });
      currentPage.drawText(confidenceScore == null ? '-' : `${confidenceScore}/5`, {
        x: pageMargin + 465,
        y: pageHeight - (cursorTopY + 10),
        size: 8.2,
        font: regularFont,
        color: rgb(0.08, 0.1, 0.15),
      });
      currentPage.drawLine({
        start: { x: pageMargin, y: pageHeight - (cursorTopY + 16) },
        end: { x: pageWidth - pageMargin, y: pageHeight - (cursorTopY + 16) },
        thickness: 0.5,
        color: rgb(0.91, 0.93, 0.95),
      });
      cursorTopY += 19;
    });
  }

  const pdfBytes = await pdfDocument.save();
  return Buffer.from(pdfBytes);
}
