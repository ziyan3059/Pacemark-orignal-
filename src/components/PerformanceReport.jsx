import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Clock, Contrast, Download, Loader2, RefreshCw } from 'lucide-react';
import { FluidButton } from './ui/fluid-button';
import { ContinuousTabs } from './watermelon/continuous-tabs';
import { formatDurationCompact } from '../lib/examEngine';
import { getAuthHeaders } from '../lib/api';

const PERFORMANCE_SUBTABS = [
  { id: 'report', label: 'Report' },
  { id: 'history', label: 'History' },
];

const PIE_COLORS = ['#0071E3', '#0D9488', '#D97706', '#5856D6', '#15803D'];

function formatTimestamp(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  const datePart = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timePart = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${datePart} · ${timePart}`;
}

function buildSvgArcPath(centerX, centerY, radius, startAngleDeg, endAngleDeg) {
  const toRadians = (degrees) => ((degrees - 90) * Math.PI) / 180;
  const startX = centerX + radius * Math.cos(toRadians(startAngleDeg));
  const startY = centerY + radius * Math.sin(toRadians(startAngleDeg));
  const endX = centerX + radius * Math.cos(toRadians(endAngleDeg));
  const endY = centerY + radius * Math.sin(toRadians(endAngleDeg));
  const isLargeArc = endAngleDeg - startAngleDeg > 180 ? 1 : 0;
  return `M ${centerX} ${centerY} L ${startX.toFixed(2)} ${startY.toFixed(2)} A ${radius} ${radius} 0 ${isLargeArc} 1 ${endX.toFixed(2)} ${endY.toFixed(2)} Z`;
}

export const PerformanceReport = ({
  result,
  history = [],
  username,
  highContrast = false,
  onToggleHighContrast,
  onSelectResult,
  saveError = '',
  onRetrySave,
  onNavigateToPapers,
}) => {
  const [activeSubView, setActiveSubView] = useState('report');
  const [exportFeedback, setExportFeedback] = useState(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const activeResult = result ?? history[0] ?? null;

  useEffect(() => {
    if (result?.id) {
      setActiveSubView('report');
    }
  }, [result?.id]);

  const rankedTopics = useMemo(() => {
    if (!activeResult || !Array.isArray(activeResult.topicBreakdown)) {
      return [];
    }
    return activeResult.topicBreakdown;
  }, [activeResult]);

  const pieSlices = useMemo(() => {
    if (rankedTopics.length === 0) return [];
    const weights = rankedTopics.map((topicSummary) => Math.max(0.25, topicSummary.weaknessIndex));
    const totalWeight = weights.reduce((accumulator, weight) => accumulator + weight, 0) || 1;
    let currentAngle = 0;

    return rankedTopics.map((topicSummary, sliceIndex) => {
      const sweepAngle = (weights[sliceIndex] / totalWeight) * 360;
      const startAngle = currentAngle;
      const endAngle =
        sliceIndex === rankedTopics.length - 1 ? 360 : currentAngle + sweepAngle;
      currentAngle = endAngle;
      const midAngleRadians = (((startAngle + endAngle) / 2 - 90) * Math.PI) / 180;
      // Offset slice center slightly outward for visual separation between adjacent segments
      const offsetX = rankedTopics.length > 1 ? Math.cos(midAngleRadians) * 4 : 0;
      const offsetY = rankedTopics.length > 1 ? Math.sin(midAngleRadians) * 4 : 0;
      const clampedEndAngle =
        rankedTopics.length === 1 ? 359.99 : Math.max(startAngle + 1, endAngle - 0.8);

      return {
        topic: topicSummary.topic,
        sharePercent: Math.round((weights[sliceIndex] / totalWeight) * 100),
        color: PIE_COLORS[sliceIndex % PIE_COLORS.length],
        path: buildSvgArcPath(110 + offsetX, 110 + offsetY, 82, startAngle, clampedEndAngle),
      };
    });
  }, [rankedTopics]);

  const handleExportPDF = async () => {
    if (!activeResult) return;
    setIsExportingPdf(true);
    setExportFeedback({ type: 'info', message: 'Generating downloadable PDF report...' });

    try {
      const response = await fetch('/api/reports/pdf', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          ...activeResult,
          topicBreakdown: rankedTopics,
          username: username || 'Student',
        }),
      });

      if (!response.ok) {
        let errorPayload = {};
        try {
          errorPayload = await response.json();
        } catch (parseError) {
          console.warn('Unable to parse PDF error response:', parseError);
        }
        throw new Error(errorPayload?.error || 'PDF generation failed.');
      }

      const pdfBlob = await response.blob();
      const objectUrl = URL.createObjectURL(pdfBlob);
      const downloadLink = document.createElement('a');
      const filenameSlug = (activeResult.paperTitle || 'performance-report')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48);
      downloadLink.href = objectUrl;
      downloadLink.download = `${filenameSlug || 'performance-report'}.pdf`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(objectUrl);

      setExportFeedback({ type: 'success', message: 'Downloaded PDF report.' });
    } catch (exportError) {
      setExportFeedback({
        type: 'error',
        message: exportError instanceof Error ? exportError.message : 'PDF export failed.',
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportCSV = () => {
    if (!activeResult) return;
    const csvLines = [
      'Metric,Value',
      `Paper,"${(activeResult.paperTitle || 'Exam Paper').replace(/"/g, '""')}"`,
      `Candidate,"${(username || 'Student').replace(/"/g, '""')}"`,
      `Overall Score,${activeResult.scorePercent}%`,
      `Average Time Per Question,${activeResult.avgTimeLabel}`,
      `Completed At,"${activeResult.completedAt ? formatTimestamp(activeResult.completedAt) : 'N/A'}"`,
      '',
      'Topic,Score (%),Time vs Target (%),Weakness Index,Priority Tier,Recommended Action',
      ...rankedTopics.map(
        (topicSummary) =>
          `"${topicSummary.topic}",${topicSummary.scorePercent}%,${topicSummary.timeRatioPercent}%,${topicSummary.weaknessIndex},"${topicSummary.status}","${(topicSummary.action || '').replace(/"/g, '""')}"`,
      ),
    ];

    if (activeResult.questionLogs && activeResult.questionLogs.length > 0) {
      csvLines.push('');
      csvLines.push('Question,Topic,Marks Awarded,Total Marks,Time Spent (s),Recommended (s),Confidence (1-5)');
      for (const questionLog of activeResult.questionLogs) {
        csvLines.push(
          `"Q${questionLog.questionNumber || questionLog.questionIndex + 1}","${questionLog.topicCategory}",${questionLog.marksAwarded},${questionLog.totalMarks},${questionLog.timeSpentSeconds},${questionLog.recommendedTimeSeconds},${questionLog.confidence ?? 'Unrated'}`,
        );
      }
    }

    const csvBlob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const objectUrl = URL.createObjectURL(csvBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = objectUrl;
    downloadLink.download = 'performance-analysis-report.csv';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(objectUrl);

    setExportFeedback({ type: 'success', message: 'Downloaded performance-analysis-report.csv' });
  };

  const handleInspectHistoryEntry = (historyEntry) => {
    onSelectResult?.(historyEntry);
    setActiveSubView('report');
  };

  const cardSurfaceClass = highContrast
    ? 'bg-white border-2 border-black text-black shadow-none'
    : 'bg-white/90 backdrop-blur-2xl border border-black/10 text-[#1D1D1F] shadow-[0_20px_50px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.95)]';

  const headerBarClass = highContrast
    ? 'bg-black border-2 border-black text-white'
    : 'bg-[#1D1D1F] border border-black/15 text-white shadow-sm';

  return (
    <section className="relative pt-12 pb-20 px-6 w-full max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className={`w-full rounded-[32px] p-6 sm:p-10 ${cardSurfaceClass}`}
      >
        <div className={`w-full rounded-2xl px-5 sm:px-6 py-3 mb-7 flex flex-wrap items-center justify-between gap-3 ${headerBarClass}`}>
          <h1 className="text-base sm:text-lg font-semibold tracking-tight text-white">
            {activeSubView === 'report' ? 'Performance Analysis Report' : 'Completed Exam History'}
          </h1>

          <div className="flex items-center gap-2.5 sm:gap-3">
            {onToggleHighContrast && (
              <button
                type="button"
                aria-pressed={highContrast}
                onClick={onToggleHighContrast}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white/15 hover:bg-white/25 text-white cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white transition-colors"
              >
                <Contrast className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{highContrast ? 'Standard' : 'High Contrast'}</span>
              </button>
            )}

            <ContinuousTabs
              tabs={PERFORMANCE_SUBTABS}
              activeId={activeSubView}
              highContrast={highContrast}
              onChange={(tabId) => setActiveSubView(tabId === 'history' ? 'history' : 'report')}
              groupId="performance-subtabs"
              className="scale-90 origin-right"
            />

            <motion.button
              type="button"
              aria-label="Download PDF Report"
              title="Download PDF Report"
              disabled={isExportingPdf || !activeResult}
              onClick={handleExportPDF}
              whileHover={activeResult && !isExportingPdf ? { scale: 1.05 } : undefined}
              whileTap={activeResult && !isExportingPdf ? { scale: 0.94 } : undefined}
              transition={{ type: 'spring', stiffness: 460, damping: 28 }}
              className={`w-10 h-10 rounded-full inline-flex items-center justify-center shrink-0 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#1D1D1F] disabled:opacity-40 disabled:cursor-not-allowed ${
                highContrast
                  ? 'bg-white text-black border-2 border-white hover:bg-neutral-200'
                  : 'bg-[#0071E3] text-white hover:bg-[#0077ED] shadow-[0_4px_14px_rgba(0,113,227,0.45),inset_0_1px_0_rgba(255,255,255,0.3)]'
              }`}
            >
              {isExportingPdf ? (
                <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden="true" />
              ) : (
                <Download className="w-[18px] h-[18px]" strokeWidth={2.1} aria-hidden="true" />
              )}
            </motion.button>
          </div>
        </div>

        {saveError && (
          <div
            role="alert"
            className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-xs sm:text-sm font-semibold ${
              highContrast
                ? 'bg-white border-2 border-black text-black'
                : 'bg-[#FEE2E2] border border-[#FCA5A5] text-[#991B1B]'
            }`}
          >
            <span>{saveError}</span>
            {onRetrySave && (
              <FluidButton
                variant="secondary"
                size="sm"
                highContrast={highContrast}
                icon={<RefreshCw className="w-3.5 h-3.5" />}
                onClick={onRetrySave}
              >
                Retry Save
              </FluidButton>
            )}
          </div>
        )}

        {exportFeedback && (
          <div
            role={exportFeedback.type === 'error' ? 'alert' : 'status'}
            aria-live="polite"
            className={`mb-6 rounded-2xl px-4 py-2.5 text-xs sm:text-sm font-semibold ${
              highContrast
                ? 'bg-white border-2 border-black text-black'
                : exportFeedback.type === 'error'
                  ? 'bg-[#FEE2E2] border border-[#FCA5A5] text-[#991B1B]'
                  : 'bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E3A8A]'
            }`}
          >
            {exportFeedback.message}
          </div>
        )}

        <AnimatePresence mode="wait">
          {activeSubView === 'report' ? (
            <motion.div
              key="performance-report-view"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            >
              {!activeResult ? (
                <div
                  className={`rounded-2xl p-10 text-center ${
                    highContrast
                      ? 'bg-white border-2 border-black text-black'
                      : 'bg-[#F2F4F8] border border-black/10 text-[#1D1D1F]'
                  }`}
                >
                  <h2 className="text-lg font-bold tracking-tight mb-2">
                    No Performance Report Yet
                  </h2>
                  <p
                    className={`text-sm max-w-md mx-auto mb-6 ${
                      highContrast ? 'text-black' : 'text-[#48484A]'
                    }`}
                  >
                    Complete a past paper from Dashboard or Papers to generate your keyword rubric breakdown, topic weakness ranking, and downloadable PDF report.
                  </p>
                  {onNavigateToPapers && (
                    <FluidButton
                      variant="primary"
                      size="md"
                      highContrast={highContrast}
                      onClick={onNavigateToPapers}
                    >
                      Browse Past Papers
                    </FluidButton>
                  )}
                </div>
              ) : (
                <>
                  <p
                    className={`text-xs sm:text-sm font-medium mb-2 tabular-nums ${
                      highContrast ? 'text-black' : 'text-[#48484A]'
                    }`}
                  >
                    {activeResult.paperTitle} · {formatTimestamp(activeResult.completedAt)}
                  </p>

                  <p
                    className={`text-xl sm:text-2xl font-bold tracking-tight mb-8 tabular-nums ${
                      highContrast ? 'text-black' : 'text-[#1D1D1F]'
                    }`}
                  >
                    Overall score: {activeResult.scorePercent}% · Average time per Q:{' '}
                    {activeResult.avgTimeLabel}
                  </p>

                  {rankedTopics.length === 0 ? (
                    <div
                      className={`rounded-2xl p-6 mb-8 text-sm ${
                        highContrast
                          ? 'bg-white border-2 border-black text-black'
                          : 'bg-[#F2F4F8] border border-black/10 text-[#48484A]'
                      }`}
                    >
                      No topic-level breakdown was recorded for this completed session.
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center mb-10">
                        <div
                          className={`w-full rounded-2xl p-6 flex flex-col justify-center gap-4 min-h-[200px] ${
                            highContrast
                              ? 'bg-black border-2 border-black text-white'
                              : 'bg-[#1D1D1F] border border-black/15 text-white shadow-sm'
                          }`}
                          role="img"
                          aria-label="Topic score and pacing bar chart"
                        >
                          <div className="flex items-center justify-between text-[11px] font-medium text-white/90 pb-1 border-b border-white/20">
                            <span>Topic Breakdown</span>
                            <span className="font-mono tabular-nums">
                              Blue: Score % · Gray: Target Time %
                            </span>
                          </div>
                          {rankedTopics.map((topicSummary) => (
                            <div key={topicSummary.topic} className="space-y-1">
                              <div className="flex items-center justify-between text-xs font-medium text-white">
                                <span className="truncate pr-2">{topicSummary.topic}</span>
                                <span className="font-mono tabular-nums shrink-0">
                                  {topicSummary.scorePercent}% · {topicSummary.timeRatioPercent}% time
                                </span>
                              </div>
                              <div className="w-full h-2.5 bg-white/20 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#38BDF8] rounded-full transition-all duration-500"
                                  style={{
                                    width: `${Math.min(100, Math.max(4, topicSummary.scorePercent))}%`,
                                  }}
                                />
                              </div>
                              <div className="w-full h-2.5 bg-white/20 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#D1D5DB] rounded-full transition-all duration-500"
                                  style={{
                                    width: `${Math.min(100, Math.max(4, topicSummary.timeRatioPercent))}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex flex-col items-center justify-center py-2 gap-4">
                          <svg
                            viewBox="0 0 220 220"
                            className="w-44 h-44 sm:w-48 sm:h-48 overflow-visible"
                            role="img"
                            aria-label="Weakness priority share pie chart"
                          >
                            {pieSlices.map((slice) => (
                              <path
                                key={slice.topic}
                                d={slice.path}
                                fill={slice.color}
                                aria-label={`${slice.topic}: ${slice.sharePercent}% priority share`}
                              />
                            ))}
                          </svg>

                          <ul className="w-full max-w-xs space-y-1.5 text-xs">
                            {pieSlices.map((slice) => (
                              <li key={slice.topic} className="flex items-center justify-between gap-2">
                                <span
                                  className={`flex items-center gap-2 min-w-0 truncate font-medium ${
                                    highContrast ? 'text-black' : 'text-[#1D1D1F]'
                                  }`}
                                >
                                  <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: slice.color }}
                                    aria-hidden="true"
                                  />
                                  <span className="truncate">{slice.topic}</span>
                                </span>
                                <span
                                  className={`font-mono tabular-nums font-semibold shrink-0 ${
                                    highContrast ? 'text-black' : 'text-[#1D1D1F]'
                                  }`}
                                >
                                  {slice.sharePercent}%
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="space-y-3 mb-8">
                        <h2
                          className={`text-sm font-bold tracking-tight ${
                            highContrast ? 'text-black' : 'text-[#1D1D1F]'
                          }`}
                        >
                          Priority Weakness Ranking (Sorted Highest Priority First)
                        </h2>
                        <div className="space-y-2.5">
                          {rankedTopics.map((topicSummary) => {
                            const isPriority = topicSummary.status === 'Priority Revision';
                            const isPacing = topicSummary.status === 'Needs Pacing';
                            const badgeStyle = highContrast
                              ? 'bg-white border-2 border-black text-black'
                              : isPriority
                                ? 'bg-[#FEE2E2] text-[#991B1B]'
                                : isPacing
                                  ? 'bg-[#FEF3C7] text-[#92400E]'
                                  : 'bg-[#DCFCE7] text-[#166534]';

                            return (
                              <div
                                key={topicSummary.topic}
                                className={`rounded-2xl p-4 sm:p-5 transition-colors ${
                                  highContrast
                                    ? 'bg-white border-2 border-black text-black'
                                    : 'bg-[#F7F8FA] border border-black/[0.08] hover:bg-[#F2F4F8]'
                                }`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                                  <p
                                    className={`text-sm sm:text-[15px] font-bold tracking-tight ${
                                      highContrast ? 'text-black' : 'text-[#1D1D1F]'
                                    }`}
                                  >
                                    {topicSummary.topic}
                                  </p>
                                  <div className="flex items-center gap-3 text-xs font-semibold font-mono tabular-nums">
                                    <span
                                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${badgeStyle}`}
                                    >
                                      {isPriority ? (
                                        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                      ) : isPacing ? (
                                        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                      ) : (
                                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                      )}
                                      <span>{topicSummary.status}</span>
                                    </span>
                                    <span className={highContrast ? 'text-black' : 'text-[#48484A]'}>
                                      Weakness: {topicSummary.weaknessIndex}
                                    </span>
                                  </div>
                                </div>

                                <p
                                  className={`text-xs sm:text-sm leading-relaxed font-normal ${
                                    highContrast ? 'text-black' : 'text-[#3A3A3C]'
                                  }`}
                                >
                                  {topicSummary.action}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}

                  {activeResult.questionLogs && activeResult.questionLogs.length > 0 && (
                    <div className="mb-8">
                      <h2
                        className={`text-sm font-bold tracking-tight mb-3 ${
                          highContrast ? 'text-black' : 'text-[#1D1D1F]'
                        }`}
                      >
                        Per-Question Timing &amp; Confidence Breakdown
                      </h2>
                      <div
                        className={`overflow-x-auto rounded-2xl ${
                          highContrast
                            ? 'border-2 border-black bg-white'
                            : 'border border-black/10 bg-[#F7F8FA]'
                        }`}
                      >
                        <table className="w-full text-left border-collapse text-xs sm:text-sm">
                          <thead
                            className={`border-b text-xs font-semibold ${
                              highContrast
                                ? 'border-black text-black'
                                : 'border-black/10 text-[#48484A]'
                            }`}
                          >
                            <tr>
                              <th className="py-3 px-4">Question</th>
                              <th className="py-3 px-3">Topic</th>
                              <th className="py-3 px-3 text-right">Marks</th>
                              <th className="py-3 px-3 text-right">Time / Target</th>
                              <th className="py-3 pr-4 pl-3 text-right">Confidence</th>
                            </tr>
                          </thead>
                          <tbody
                            className={`divide-y ${
                              highContrast ? 'divide-black' : 'divide-black/[0.06]'
                            }`}
                          >
                            {activeResult.questionLogs.map((questionLog, logPosition) => {
                              const isOverTarget =
                                questionLog.timeSpentSeconds > questionLog.recommendedTimeSeconds;
                              return (
                                <tr
                                  key={`${questionLog.questionIndex ?? 'q'}-${logPosition}`}
                                  className={`h-10 transition-colors ${
                                    highContrast ? 'hover:bg-neutral-100' : 'hover:bg-black/[0.03]'
                                  }`}
                                >
                                  <td
                                    className={`py-2.5 px-4 font-semibold truncate max-w-[220px] ${
                                      highContrast ? 'text-black' : 'text-[#1D1D1F]'
                                    }`}
                                  >
                                    Q{questionLog.questionNumber || questionLog.questionIndex + 1}:{' '}
                                    {questionLog.prompt}
                                  </td>
                                  <td
                                    className={`py-2.5 px-3 whitespace-nowrap ${
                                      highContrast ? 'text-black' : 'text-[#48484A]'
                                    }`}
                                  >
                                    {questionLog.topicCategory}
                                  </td>
                                  <td
                                    className={`py-2.5 px-3 text-right font-mono tabular-nums font-semibold ${
                                      highContrast ? 'text-black' : 'text-[#1D1D1F]'
                                    }`}
                                  >
                                    {questionLog.marksAwarded}/{questionLog.totalMarks}
                                  </td>
                                  <td
                                    className={`py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap font-medium ${
                                      highContrast
                                        ? 'text-black font-bold'
                                        : isOverTarget
                                          ? 'text-[#B45309]'
                                          : 'text-[#1D1D1F]'
                                    }`}
                                  >
                                    {formatDurationCompact(questionLog.timeSpentSeconds)} /{' '}
                                    {formatDurationCompact(questionLog.recommendedTimeSeconds)}
                                  </td>
                                  <td
                                    className={`py-2.5 pr-4 pl-3 text-right font-mono tabular-nums ${
                                      highContrast ? 'text-black' : 'text-[#1D1D1F]'
                                    }`}
                                  >
                                    {questionLog.confidence ? `${questionLog.confidence}/5` : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <FluidButton
                      variant="secondary"
                      size="sm"
                      highContrast={highContrast}
                      disabled={isExportingPdf}
                      icon={<Download className="w-3.5 h-3.5" />}
                      onClick={handleExportPDF}
                    >
                      {isExportingPdf ? 'Generating PDF...' : 'Export Report to PDF'}
                    </FluidButton>

                    <FluidButton
                      variant="secondary"
                      size="sm"
                      highContrast={highContrast}
                      onClick={handleExportCSV}
                    >
                      Export CSV
                    </FluidButton>
                  </div>
                </>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="performance-history-view"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-6">
                <p
                  className={`text-sm font-medium tabular-nums ${
                    highContrast ? 'text-black font-semibold' : 'text-[#3A3A3C]'
                  }`}
                >
                  {username ? `${username} · ` : ''}
                  {history.length} completed {history.length === 1 ? 'exam' : 'exams'}
                </p>
                {history.length > 0 && (
                  <p
                    className={`text-xs font-medium tabular-nums ${
                      highContrast ? 'text-black font-semibold' : 'text-[#48484A]'
                    }`}
                  >
                    Latest score: {history[0].scorePercent}%
                  </p>
                )}
              </div>

              {history.length === 0 ? (
                <div
                  className={`rounded-2xl p-10 text-center ${
                    highContrast
                      ? 'bg-white border-2 border-black text-black'
                      : 'bg-[#F2F4F8] border border-black/10 text-[#1D1D1F]'
                  }`}
                >
                  <p className="text-base font-semibold mb-1">No completed exams yet</p>
                  <p className={`text-sm ${highContrast ? 'text-black' : 'text-[#48484A]'}`}>
                    Start and complete a paper from Dashboard or Papers to record your first result.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map((historyEntry) => {
                    const isSelected = activeResult?.id === historyEntry.id;
                    return (
                      <div
                        key={historyEntry.id}
                        className={`rounded-2xl p-5 sm:p-6 transition-colors ${
                          highContrast
                            ? isSelected
                              ? 'bg-neutral-100 border-2 border-black text-black'
                              : 'bg-white border-2 border-black text-black hover:bg-neutral-100'
                            : isSelected
                              ? 'bg-white border border-[#005BB5]/50 shadow-sm'
                              : 'bg-[#F7F8FA] border border-black/10 hover:bg-white'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                              <h2
                                className={`text-base sm:text-lg font-bold tracking-tight ${
                                  highContrast ? 'text-black' : 'text-[#1D1D1F]'
                                }`}
                              >
                                {historyEntry.paperTitle}
                              </h2>
                              <span
                                className={`text-base sm:text-lg font-extrabold tabular-nums ${
                                  highContrast ? 'text-black' : 'text-[#005BB5]'
                                }`}
                              >
                                {historyEntry.scorePercent}%
                              </span>
                            </div>

                            <p
                              className={`text-xs sm:text-sm font-medium tabular-nums ${
                                highContrast ? 'text-black' : 'text-[#48484A]'
                              }`}
                            >
                              {formatTimestamp(historyEntry.completedAt)} · Avg{' '}
                              {historyEntry.avgTimeLabel}/Q
                              {historyEntry.totalQuestions
                                ? ` · ${historyEntry.questionsAnswered ?? historyEntry.totalQuestions}/${historyEntry.totalQuestions} answered`
                                : ''}
                            </p>

                            {historyEntry.summary && (
                              <p
                                className={`text-sm leading-relaxed pt-1 ${
                                  highContrast ? 'text-black' : 'text-[#1D1D1F]'
                                }`}
                              >
                                {historyEntry.summary}
                              </p>
                            )}
                          </div>

                          <div className="shrink-0 pt-1">
                            <FluidButton
                              variant={isSelected ? 'primary' : 'secondary'}
                              size="sm"
                              highContrast={highContrast}
                              onClick={() => handleInspectHistoryEntry(historyEntry)}
                            >
                              View Report
                            </FluidButton>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </section>
  );
};
