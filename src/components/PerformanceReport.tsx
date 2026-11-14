"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Clock, Contrast, Download } from 'lucide-react';
import { FluidButton } from './ui/fluid-button';
import { ContinuousTabs, TabItem } from './watermelon/continuous-tabs';
import {
  formatDurationCompact,
  QuestionResponseLog,
  TopicWeaknessSummary,
} from '../lib/examEngine';
import { getAuthHeaders } from '../lib/api';

export interface TopicScoreBreakdown {
  computerSystems: number;
  dataStructures: number;
  softwareEngineering: number;
}

export interface CompletedPaperResult {
  id: string;
  paperTitle: string;
  scorePercent: number;
  avgTimeLabel: string;
  completedAt: string;
  questionsAnswered?: number;
  totalQuestions?: number;
  summary: string;
  topicScores?: TopicScoreBreakdown;
  topicBreakdown?: TopicWeaknessSummary[];
  questionLogs?: QuestionResponseLog[];
}

interface PerformanceReportProps {
  result?: CompletedPaperResult | null;
  history?: CompletedPaperResult[];
  username?: string;
  highContrast?: boolean;
  onToggleHighContrast?: () => void;
  onSelectResult?: (item: CompletedPaperResult) => void;
}

const PERFORMANCE_SUBTABS: TabItem[] = [
  { id: 'report', label: 'Report' },
  { id: 'history', label: 'History' },
];

const DEFAULT_TOPIC_SCORES: TopicScoreBreakdown = {
  computerSystems: 72,
  dataStructures: 58,
  softwareEngineering: 91,
};

const PIE_COLORS = ['#0071E3', '#30B0C7', '#FF9500', '#5856D6', '#34C759'];

function formatTimestamp(isoString: string): string {
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

function buildSvgArcPath(
  cx: number,
  cy: number,
  r: number,
  startAngleDeg: number,
  endAngleDeg: number,
): string {
  const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startAngleDeg));
  const y1 = cy + r * Math.sin(rad(startAngleDeg));
  const x2 = cx + r * Math.cos(rad(endAngleDeg));
  const y2 = cy + r * Math.sin(rad(endAngleDeg));
  const largeArc = endAngleDeg - startAngleDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

export const PerformanceReport: React.FC<PerformanceReportProps> = ({
  result,
  history = [],
  username,
  highContrast = false,
  onToggleHighContrast,
  onSelectResult,
}) => {
  const [activeSubView, setActiveSubView] = useState<'report' | 'history'>('report');
  const [exportStatus, setExportStatus] = useState<string>('');
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  const activeResult = result ?? history[0] ?? null;

  useEffect(() => {
    if (result?.id) {
      setActiveSubView('report');
    }
  }, [result?.id]);

  const score = activeResult?.scorePercent ?? 78;
  const avgTime = activeResult?.avgTimeLabel ?? '1m 20s';
  const topicScores = activeResult?.topicScores ?? DEFAULT_TOPIC_SCORES;

  // Use Algorithm 2 topicBreakdown when present, else derive ranked summaries from legacy topicScores
  const rankedTopics = useMemo<TopicWeaknessSummary[]>(() => {
    if (activeResult?.topicBreakdown && activeResult.topicBreakdown.length > 0) {
      return activeResult.topicBreakdown;
    }

    const legacy: TopicWeaknessSummary[] = [
      {
        topic: 'Data Structures & Algorithms',
        weaknessIndex: Number((1 - topicScores.dataStructures / 100 + 0.35).toFixed(2)),
        scorePercent: topicScores.dataStructures,
        timeRatioPercent: 118,
        avgTimeSeconds: 95,
        avgRecommendedSeconds: 80,
        marksAwarded: Math.round((topicScores.dataStructures / 100) * 5),
        totalMarks: 5,
        questionCount: 2,
        status: topicScores.dataStructures < 65 ? 'Priority Revision' : 'Needs Pacing',
        action: 'Revise binary trees, sorting trade-offs, and trace tables under timed conditions.',
      },
      {
        topic: 'Computer Systems',
        weaknessIndex: Number((1 - topicScores.computerSystems / 100 + 0.25).toFixed(2)),
        scorePercent: topicScores.computerSystems,
        timeRatioPercent: 102,
        avgTimeSeconds: 78,
        avgRecommendedSeconds: 75,
        marksAwarded: Math.round((topicScores.computerSystems / 100) * 5),
        totalMarks: 5,
        questionCount: 2,
        status: topicScores.computerSystems >= 80 ? 'Strong' : 'Needs Pacing',
        action: 'Review fetch-execute architecture and memory trade-offs.',
      },
      {
        topic: 'Software & Programming',
        weaknessIndex: Number((1 - topicScores.softwareEngineering / 100 + 0.15).toFixed(2)),
        scorePercent: topicScores.softwareEngineering,
        timeRatioPercent: 88,
        avgTimeSeconds: 62,
        avgRecommendedSeconds: 70,
        marksAwarded: Math.round((topicScores.softwareEngineering / 100) * 5),
        totalMarks: 5,
        questionCount: 1,
        status: topicScores.softwareEngineering >= 75 ? 'Strong' : 'Needs Pacing',
        action: 'Maintain current pace across structured programming questions.',
      },
    ];

    return legacy.sort((a, b) => b.weaknessIndex - a.weaknessIndex);
  }, [activeResult, topicScores]);

  const pieSlices = useMemo(() => {
    const weights = rankedTopics.map((t) => Math.max(0.25, t.weaknessIndex));
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    let currentAngle = 0;

    return rankedTopics.map((t, idx) => {
      const sweep = (weights[idx] / totalWeight) * 360;
      const startAngle = currentAngle;
      const endAngle = idx === rankedTopics.length - 1 ? 360 : currentAngle + sweep;
      currentAngle = endAngle;
      const midAngleRad = (((startAngle + endAngle) / 2 - 90) * Math.PI) / 180;
      // Subtle 4px radial offset for exploded look
      const dx = Math.cos(midAngleRad) * 4;
      const dy = Math.sin(midAngleRad) * 4;

      return {
        topic: t.topic,
        sharePercent: Math.round((weights[idx] / totalWeight) * 100),
        color: PIE_COLORS[idx % PIE_COLORS.length],
        path: buildSvgArcPath(110 + dx, 110 + dy, 82, startAngle, endAngle - 0.8),
      };
    });
  }, [rankedTopics]);

  const handleExportPDF = async () => {
    if (!activeResult) return;
    setIsExportingPdf(true);
    setExportStatus('Generating downloadable PDF report...');

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
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error || 'PDF generation failed.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const slug = (activeResult.paperTitle || 'performance-report')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48);
      link.href = url;
      link.download = `${slug || 'performance-report'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportStatus('Downloaded PDF report.');
    } catch (err) {
      setExportStatus(err instanceof Error ? err.message : 'PDF export failed.');
    } finally {
      setIsExportingPdf(false);
      setTimeout(() => setExportStatus(''), 3500);
    }
  };

  const handleExportCSV = () => {
    const csvLines = [
      'Metric,Value',
      `Paper,"${(activeResult?.paperTitle ?? 'OCR Computer Science').replace(/"/g, '""')}"`,
      `Candidate,"${(username || 'Student').replace(/"/g, '""')}"`,
      `Overall Score,${score}%`,
      `Average Time Per Question,${avgTime}`,
      `Completed At,"${activeResult?.completedAt ? formatTimestamp(activeResult.completedAt) : 'N/A'}"`,
      '',
      'Topic,Score (%),Time vs Target (%),Weakness Index,Priority Tier,Recommended Action',
      ...rankedTopics.map(
        (t) =>
          `"${t.topic}",${t.scorePercent}%,${t.timeRatioPercent}%,${t.weaknessIndex},"${t.status}","${t.action.replace(/"/g, '""')}"`,
      ),
    ];

    if (activeResult?.questionLogs && activeResult.questionLogs.length > 0) {
      csvLines.push('');
      csvLines.push('Question,Topic,Marks Awarded,Total Marks,Time Spent (s),Recommended (s),Confidence (1-5)');
      for (const q of activeResult.questionLogs) {
        csvLines.push(
          `"Q${q.questionNumber || q.questionIndex + 1}","${q.topicCategory}",${q.marksAwarded},${q.totalMarks},${q.timeSpentSeconds},${q.recommendedTimeSeconds},${q.confidence}`,
        );
      }
    }

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'performance-analysis-report.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportStatus('Downloaded performance-analysis-report.csv');
    setTimeout(() => setExportStatus(''), 2500);
  };

  const handleInspectHistoryItem = (item: CompletedPaperResult) => {
    onSelectResult?.(item);
    setActiveSubView('report');
  };

  const cardSurface = highContrast
    ? 'bg-white border-2 border-neutral-950 text-black shadow-none'
    : 'bg-white/75 dark:bg-[#1C1C1E]/75 backdrop-blur-2xl border border-white/80 dark:border-white/10 text-neutral-950 dark:text-neutral-50 shadow-[0_20px_50px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.85)]';

  const headerBarSurface = highContrast
    ? 'bg-black border border-black text-white'
    : 'bg-[#1D1D1F]/90 dark:bg-white/15 backdrop-blur-xl border border-white/20 text-white shadow-sm';

  return (
    <section className="relative pt-12 pb-20 px-6 w-full max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className={`w-full rounded-[32px] p-6 sm:p-10 ${cardSurface}`}
      >
        {/* Top Header Bar with Report / History Sub-view Switcher */}
        <div className={`w-full rounded-2xl px-5 sm:px-6 py-3 mb-7 flex flex-wrap items-center justify-between gap-3 ${headerBarSurface}`}>
          <h1 className="text-base sm:text-lg font-semibold tracking-tight">
            {activeSubView === 'report' ? 'Performance Analysis Report' : 'Completed Exam History'}
          </h1>

          <div className="flex items-center gap-3">
            {onToggleHighContrast && (
              <button
                type="button"
                aria-pressed={highContrast}
                onClick={onToggleHighContrast}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/15 hover:bg-white/25 text-white cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white transition-colors"
              >
                <Contrast className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{highContrast ? 'Standard' : 'High Contrast'}</span>
              </button>
            )}

            <ContinuousTabs
              tabs={PERFORMANCE_SUBTABS}
              activeId={activeSubView}
              onChange={(id) => setActiveSubView(id === 'history' ? 'history' : 'report')}
              groupId="performance-subtabs"
              className="scale-90 origin-right"
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeSubView === 'report' ? (
            <motion.div
              key="performance-report-view"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            >
              {activeResult && (
                <p className="text-xs sm:text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2 tabular-nums">
                  {activeResult.paperTitle} · {formatTimestamp(activeResult.completedAt)}
                </p>
              )}

              {/* Summary Score Line */}
              <p className="text-xl sm:text-2xl font-bold tracking-tight text-[#1D1D1F] dark:text-[#F5F5F7] mb-8 tabular-nums">
                Overall score: {score}% · Average time per Q: {avgTime}
              </p>

              {/* Dynamic Two Side-by-Side Graphs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center mb-10">
                {/* Left: Dynamic Horizontal Paired Bar Chart (Score % vs Target Pace %) */}
                <div
                  className={`w-full rounded-2xl p-6 flex flex-col justify-center gap-4 min-h-[200px] ${
                    highContrast
                      ? 'bg-neutral-950 border-2 border-black text-white'
                      : 'bg-[#1D1D1F]/90 dark:bg-black/40 backdrop-blur-xl border border-white/20 text-white shadow-sm'
                  }`}
                  role="img"
                  aria-label="Topic score and pacing bar chart"
                >
                  <div className="flex items-center justify-between text-[11px] font-medium text-white/80 pb-1 border-b border-white/15">
                    <span>Topic Breakdown</span>
                    <span className="font-mono tabular-nums">Blue: Score % · Slate: Target Time %</span>
                  </div>
                  {rankedTopics.map((row) => (
                    <div key={row.topic} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-medium text-white/95">
                        <span className="truncate pr-2">{row.topic}</span>
                        <span className="font-mono tabular-nums shrink-0">
                          {row.scorePercent}% · {row.timeRatioPercent}% time
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-white/15 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#0071E3] rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(4, row.scorePercent))}%` }}
                        />
                      </div>
                      <div className="w-full h-2.5 bg-white/15 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#8E8E93] rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(4, Math.min(100, row.timeRatioPercent)))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right: Dynamic Exploded SVG Pie Chart + Labeled Legend */}
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
                        <span className="flex items-center gap-2 min-w-0 truncate font-medium text-neutral-800 dark:text-neutral-200">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: slice.color }}
                            aria-hidden="true"
                          />
                          <span className="truncate">{slice.topic}</span>
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-neutral-900 dark:text-neutral-100 shrink-0">
                          {slice.sharePercent}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Ranked Constructive Feedback Cards (Criterion 4 #2 & Algorithm 2) */}
              <div className="space-y-3 mb-8">
                <h2 className="text-sm font-bold tracking-tight text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Priority Weakness Ranking (Sorted Highest Priority First)
                </h2>
                <div className="space-y-2.5">
                  {rankedTopics.map((item) => {
                    const isPriority = item.status === 'Priority Revision';
                    const isPacing = item.status === 'Needs Pacing';

                    return (
                      <div
                        key={item.topic}
                        className="rounded-2xl bg-black/[0.025] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] p-4 sm:p-5 transition-colors hover:bg-black/[0.035] dark:hover:bg-white/[0.06]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                          <p className="text-sm sm:text-[15px] font-bold tracking-tight text-[#1D1D1F] dark:text-[#F5F5F7]">
                            {item.topic}
                          </p>
                          <div className="flex items-center gap-3 text-xs font-semibold font-mono tabular-nums">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                isPriority
                                  ? 'bg-[#FF3B30]/10 text-[#FF3B30]'
                                  : isPacing
                                    ? 'bg-[#FF9500]/10 text-[#FF9500]'
                                    : 'bg-[#34C759]/10 text-[#34C759]'
                              }`}
                            >
                              {isPriority ? (
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              ) : isPacing ? (
                                <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              )}
                              <span>{item.status}</span>
                            </span>
                            <span className="text-neutral-500 dark:text-neutral-400">
                              Weakness: {item.weaknessIndex}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed font-normal">
                          {item.action}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Per-Question Timing, Marks & Confidence Log */}
              {activeResult?.questionLogs && activeResult.questionLogs.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-sm font-bold tracking-tight text-[#1D1D1F] dark:text-[#F5F5F7] mb-3">
                    Per-Question Timing &amp; Confidence Breakdown
                  </h2>
                  <div className="overflow-x-auto rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.02]">
                    <table className="w-full text-left border-collapse text-xs sm:text-sm">
                      <thead className="border-b border-black/[0.06] dark:border-white/[0.08] text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                        <tr>
                          <th className="py-3 px-4">Question</th>
                          <th className="py-3 px-3">Topic</th>
                          <th className="py-3 px-3 text-right">Marks</th>
                          <th className="py-3 px-3 text-right">Time / Target</th>
                          <th className="py-3 pr-4 pl-3 text-right">Confidence</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
                        {activeResult.questionLogs.map((q) => {
                          const overTarget = q.timeSpentSeconds > q.recommendedTimeSeconds;
                          return (
                            <tr key={q.questionIndex} className="h-10 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors">
                              <td className="py-2.5 px-4 font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] truncate max-w-[220px]">
                                Q{q.questionNumber || q.questionIndex + 1}: {q.prompt}
                              </td>
                              <td className="py-2.5 px-3 text-neutral-600 dark:text-neutral-300 whitespace-nowrap">
                                {q.topicCategory}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-neutral-900 dark:text-neutral-100">
                                {q.marksAwarded}/{q.totalMarks}
                              </td>
                              <td
                                className={`py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap font-medium ${
                                  overTarget ? 'text-[#FF9500]' : 'text-neutral-700 dark:text-neutral-300'
                                }`}
                              >
                                {formatDurationCompact(q.timeSpentSeconds)} /{' '}
                                {formatDurationCompact(q.recommendedTimeSeconds)}
                              </td>
                              <td className="py-2.5 pr-4 pl-3 text-right font-mono tabular-nums text-neutral-800 dark:text-neutral-200">
                                {q.confidence}/5
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Export Actions */}
              <div className="flex flex-wrap items-center gap-3">
                <FluidButton
                  variant="secondary"
                  size="sm"
                  disabled={isExportingPdf || !activeResult}
                  icon={<Download className="w-3.5 h-3.5" />}
                  onClick={handleExportPDF}
                >
                  {isExportingPdf ? 'Generating PDF...' : 'Export Report to PDF'}
                </FluidButton>

                <FluidButton
                  variant="secondary"
                  size="sm"
                  onClick={handleExportCSV}
                >
                  Export CSV
                </FluidButton>

                {exportStatus && (
                  <span
                    role="status"
                    aria-live="polite"
                    className="text-xs font-medium text-[#0055FF] ml-2"
                  >
                    {exportStatus}
                  </span>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="performance-history-view"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              {/* Subheader metadata */}
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-6">
                <p className="text-sm font-medium text-neutral-700 tabular-nums">
                  {username ? `${username} · ` : ''}
                  {history.length} completed {history.length === 1 ? 'exam' : 'exams'}
                </p>
                {history.length > 0 && (
                  <p className="text-xs font-medium text-neutral-600 tabular-nums">
                    Latest score: {history[0].scorePercent}%
                  </p>
                )}
              </div>

              {history.length === 0 ? (
                <div className="rounded-2xl bg-white/60 border border-black/10 p-10 text-center">
                  <p className="text-base font-semibold text-neutral-900 mb-1">
                    No completed exams yet
                  </p>
                  <p className="text-sm text-neutral-600">
                    Start and complete a paper from Dashboard or Papers to record your first result.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map((item) => {
                    const isSelected = activeResult?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl border p-5 sm:p-6 transition-colors ${
                          isSelected
                            ? 'bg-white/95 border-[#0055FF]/40 shadow-sm'
                            : 'bg-white/70 border-black/10 hover:bg-white/90'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                              <h2 className="text-base sm:text-lg font-bold text-neutral-950 tracking-tight">
                                {item.paperTitle}
                              </h2>
                              <span className="text-base sm:text-lg font-extrabold text-[#0055FF] tabular-nums">
                                {item.scorePercent}%
                              </span>
                            </div>

                            <p className="text-xs sm:text-sm font-medium text-neutral-600 tabular-nums">
                              {formatTimestamp(item.completedAt)} · Avg {item.avgTimeLabel}/Q
                              {item.totalQuestions
                                ? ` · ${item.questionsAnswered ?? item.totalQuestions}/${item.totalQuestions} answered`
                                : ''}
                            </p>

                            <p className="text-sm text-neutral-800 leading-relaxed pt-1">
                              {item.summary}
                            </p>
                          </div>

                          <div className="shrink-0 pt-1">
                            <FluidButton
                              variant={isSelected ? 'primary' : 'secondary'}
                              size="sm"
                              onClick={() => handleInspectHistoryItem(item)}
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
