"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Contrast, Minus, Plus, Save } from 'lucide-react';
import { FluidButton } from './ui/fluid-button';
import { CompletedPaperResult } from './PerformanceReport';
import {
  calculateTopicWeakness,
  evaluateKeywordRubric,
  formatDurationCompact,
  QuestionResponseLog,
  sanitizeAnswerText,
} from '../lib/examEngine';

export interface QuestionItem {
  questionNumber?: string;
  stemContext?: string;
  prompt: string;
  marks: number;
  recommendedTimeSeconds?: number;
  topicCategory?: string;
  rubricKeywords?: string[];
  page?: number;
}

export interface ActivePaper {
  id: string;
  title: string;
  pageCount?: number;
  extractedText?: string;
  needsOcr?: boolean;
  questions?: QuestionItem[];
}

const QUESTIONS_BY_PAPER: Record<string, QuestionItem[]> = {
  'paper-1': [
    {
      questionNumber: '1',
      prompt: 'Describe the role of the Arithmetic Logic Unit (ALU) during the fetch-execute cycle',
      marks: 2,
      recommendedTimeSeconds: 120,
      topicCategory: 'Computer Systems',
      rubricKeywords: ['arithmetic', 'logic', 'calculations', 'comparisons', 'accumulator', 'execute'],
    },
    {
      questionNumber: '2',
      prompt: 'State two factors that affect the performance of a CPU and explain how each impacts speed',
      marks: 4,
      recommendedTimeSeconds: 240,
      topicCategory: 'Computer Systems',
      rubricKeywords: ['clock speed', 'cores', 'cache', 'cycles', 'parallel', 'instructions'],
    },
    {
      questionNumber: '3',
      prompt: 'Explain the purpose of the Program Counter in Von Neumann architecture',
      marks: 2,
      recommendedTimeSeconds: 120,
      topicCategory: 'Computer Systems',
      rubricKeywords: ['memory address', 'next instruction', 'fetched', 'increment', 'mar'],
    },
    {
      questionNumber: '4',
      prompt: 'Compare RAM and ROM in terms of volatility and typical use within a computer system',
      marks: 4,
      recommendedTimeSeconds: 240,
      topicCategory: 'Computer Systems',
      rubricKeywords: ['volatile', 'non-volatile', 'bios', 'boot', 'operating system', 'power'],
    },
    {
      questionNumber: '5',
      prompt: 'Explain why virtual memory may be needed when running multiple applications',
      marks: 3,
      recommendedTimeSeconds: 180,
      topicCategory: 'Data Structures & Algorithms',
      rubricKeywords: ['ram full', 'secondary storage', 'pages', 'swap', 'hard drive', 'memory'],
    },
  ],
  'paper-2': [
    {
      questionNumber: '1',
      prompt: 'Define abstraction and give one example of how it is used when designing software',
      marks: 2,
      recommendedTimeSeconds: 120,
      topicCategory: 'Data Structures & Algorithms',
      rubricKeywords: ['unnecessary detail', 'focus', 'essential', 'model', 'simplify', 'interface'],
    },
    {
      questionNumber: '2',
      prompt: 'Explain how a binary search algorithm locates a target item in a sorted list',
      marks: 3,
      recommendedTimeSeconds: 180,
      topicCategory: 'Data Structures & Algorithms',
      rubricKeywords: ['middle', 'midpoint', 'compare', 'half', 'discard', 'sorted'],
    },
    {
      questionNumber: '3',
      prompt: 'State one advantage and one disadvantage of using a merge sort compared to a bubble sort',
      marks: 2,
      recommendedTimeSeconds: 120,
      topicCategory: 'Data Structures & Algorithms',
      rubricKeywords: ['faster', 'large', 'memory', 'recursive', 'divide', 'consistent'],
    },
    {
      questionNumber: '4',
      prompt: 'Describe the difference between a function and a procedure in structured programming',
      marks: 2,
      recommendedTimeSeconds: 120,
      topicCategory: 'Software & Programming',
      rubricKeywords: ['return', 'value', 'subroutine', 'procedure', 'function'],
    },
    {
      questionNumber: '5',
      prompt: 'Explain how validation differs from verification when accepting user input',
      marks: 3,
      recommendedTimeSeconds: 180,
      topicCategory: 'Software & Programming',
      rubricKeywords: ['sensible', 'rules', 'accurate', 'double entry', 'format', 'match'],
    },
  ],
};

const DEFAULT_QUESTIONS: QuestionItem[] = [
  {
    questionNumber: '1',
    prompt: 'Summarise the primary concept covered in the first section of this paper',
    marks: 2,
    recommendedTimeSeconds: 120,
    topicCategory: 'Computer Systems',
    rubricKeywords: ['concept', 'system', 'process', 'purpose'],
  },
  {
    questionNumber: '2',
    prompt: 'Identify two key trade-offs discussed in the material and justify each',
    marks: 4,
    recommendedTimeSeconds: 240,
    topicCategory: 'Data Structures & Algorithms',
    rubricKeywords: ['advantage', 'disadvantage', 'efficiency', 'memory', 'speed'],
  },
  {
    questionNumber: '3',
    prompt: 'Explain the purpose of the Program Counter in Von Neumann architecture',
    marks: 2,
    recommendedTimeSeconds: 120,
    topicCategory: 'Computer Systems',
    rubricKeywords: ['address', 'next', 'instruction', 'increment'],
  },
  {
    questionNumber: '4',
    prompt: 'Outline a step-by-step approach to solving the core problem presented',
    marks: 4,
    recommendedTimeSeconds: 240,
    topicCategory: 'Software & Programming',
    rubricKeywords: ['input', 'process', 'validation', 'output', 'loop'],
  },
  {
    questionNumber: '5',
    prompt: 'Evaluate the final conclusion using evidence from the text',
    marks: 3,
    recommendedTimeSeconds: 180,
    topicCategory: 'Software & Programming',
    rubricKeywords: ['evidence', 'conclusion', 'impact', 'effective'],
  },
];

interface PaperSessionProps {
  paper: ActivePaper;
  username?: string;
  highContrast?: boolean;
  onToggleHighContrast?: () => void;
  onEndPaper: (result: CompletedPaperResult) => void;
}

interface DraftSnapshot {
  answers: Record<number, string>;
  confidenceRatings: Record<number, number>;
  questionTimeMap: Record<number, number>;
  currentIndex: number;
  updatedAt: string;
}

export const PaperSession: React.FC<PaperSessionProps> = ({
  paper,
  username,
  highContrast = false,
  onToggleHighContrast,
  onEndPaper,
}) => {
  const questions = useMemo<QuestionItem[]>(() => {
    const raw =
      paper.questions && paper.questions.length > 0
        ? paper.questions
        : QUESTIONS_BY_PAPER[paper.id] || DEFAULT_QUESTIONS;
    return raw.map((q) => ({
      ...q,
      topicCategory: q.topicCategory || 'General Specification',
      recommendedTimeSeconds: q.recommendedTimeSeconds || Math.max(45, (q.marks || 2) * 60),
      rubricKeywords: q.rubricKeywords || [],
    }));
  }, [paper]);

  const draftKey = useMemo(
    () => `pacemark_exam_draft_${(username || 'guest').trim().toLowerCase()}_${paper.id}`,
    [username, paper.id],
  );

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [confidenceRatings, setConfidenceRatings] = useState<Record<number, number>>({});
  const [questionTimeMap, setQuestionTimeMap] = useState<Record<number, number>>({});
  const [displayActiveSeconds, setDisplayActiveSeconds] = useState<number>(0);

  const [fontSizePx, setFontSizePx] = useState<number>(16);
  const [showExtractedText, setShowExtractedText] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [draftStatus, setDraftStatus] = useState<string>('');
  const [announcement, setAnnouncement] = useState<string>('');

  const [stage, setStage] = useState<'exam' | 'review'>('exam');
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [reviewMarks, setReviewMarks] = useState<Record<number, number>>({});
  const [rubricMatches, setRubricMatches] = useState<
    Record<number, { matched: string[]; missed: string[] }>
  >({});

  // Algorithm 1 Refs: accurate focus-anchored timestamp delta tracking
  const currentIndexRef = useRef<number>(0);
  const questionStartRef = useRef<number>(Date.now());
  const timeMapRef = useRef<Record<number, number>>({});
  const isPausedRef = useRef<boolean>(false);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Restore saved local draft if present
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<DraftSnapshot>;
        if (parsed.answers && typeof parsed.answers === 'object') {
          setAnswers(parsed.answers);
        }
        if (parsed.confidenceRatings && typeof parsed.confidenceRatings === 'object') {
          setConfidenceRatings(parsed.confidenceRatings);
        }
        if (parsed.questionTimeMap && typeof parsed.questionTimeMap === 'object') {
          timeMapRef.current = { ...parsed.questionTimeMap };
          setQuestionTimeMap(parsed.questionTimeMap);
        }
        if (
          typeof parsed.currentIndex === 'number' &&
          parsed.currentIndex >= 0 &&
          parsed.currentIndex < questions.length
        ) {
          setCurrentIndex(parsed.currentIndex);
          currentIndexRef.current = parsed.currentIndex;
        }
        setDraftStatus('Restored saved draft');
      }
    } catch {
      // Ignore corrupt draft storage
    }
    questionStartRef.current = Date.now();
  }, [draftKey, questions.length]);

  const flushActiveQuestionTime = useCallback(() => {
    if (isPausedRef.current) return;
    const now = Date.now();
    const elapsedSec = Math.max(0, (now - questionStartRef.current) / 1000);
    const qIdx = currentIndexRef.current;
    const updated = (timeMapRef.current[qIdx] ?? 0) + elapsedSec;
    timeMapRef.current = { ...timeMapRef.current, [qIdx]: updated };
    questionStartRef.current = now;
    setQuestionTimeMap({ ...timeMapRef.current });
  }, []);

  // Pause timing on tab/window blur or modal open; resume cleanly on focus
  useEffect(() => {
    const pauseTiming = () => {
      if (!isPausedRef.current) {
        flushActiveQuestionTime();
        isPausedRef.current = true;
      }
    };

    const resumeTiming = () => {
      if (stage !== 'exam' || showConfirmModal) return;
      if (document.hidden) return;
      questionStartRef.current = Date.now();
      isPausedRef.current = false;
    };

    const onVisibility = () => {
      if (document.hidden) pauseTiming();
      else resumeTiming();
    };

    window.addEventListener('blur', pauseTiming);
    window.addEventListener('focus', resumeTiming);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('blur', pauseTiming);
      window.removeEventListener('focus', resumeTiming);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flushActiveQuestionTime, stage, showConfirmModal]);

  // Pause timing whenever confirmation modal or self-mark review is active
  useEffect(() => {
    if (stage !== 'exam' || showConfirmModal) {
      if (!isPausedRef.current) {
        flushActiveQuestionTime();
        isPausedRef.current = true;
      }
    } else if (!document.hidden) {
      questionStartRef.current = Date.now();
      isPausedRef.current = false;
    }
  }, [stage, showConfirmModal, flushActiveQuestionTime]);

  // Lightweight UI tick to update total active elapsed time for the 4px subtle progress bar
  useEffect(() => {
    const interval = setInterval(() => {
      const accumulated = Object.values(timeMapRef.current).reduce((a, b) => a + b, 0);
      const liveDelta = isPausedRef.current
        ? 0
        : Math.max(0, (Date.now() - questionStartRef.current) / 1000);
      setDisplayActiveSeconds(accumulated + liveDelta);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Network online/offline listener (Test T05)
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // Latest state ref for 5-second Auto-Save Draft Engine
  const latestDraftRef = useRef({ answers, confidenceRatings, currentIndex });
  useEffect(() => {
    latestDraftRef.current = { answers, confidenceRatings, currentIndex };
  }, [answers, confidenceRatings, currentIndex]);

  const persistDraftNow = useCallback(() => {
    if (stage !== 'exam') return;
    try {
      const snapshot: DraftSnapshot = {
        answers: latestDraftRef.current.answers,
        confidenceRatings: latestDraftRef.current.confidenceRatings,
        questionTimeMap: timeMapRef.current,
        currentIndex: latestDraftRef.current.currentIndex,
        updatedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(draftKey, JSON.stringify(snapshot));
      const hhmm = new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setDraftStatus(`Auto-saved · ${hhmm}`);
    } catch {
      // Ignore storage quota errors
    }
  }, [draftKey, stage]);

  useEffect(() => {
    if (stage !== 'exam') return;
    const autoTimer = setInterval(persistDraftNow, 5000);
    return () => {
      clearInterval(autoTimer);
    };
  }, [persistDraftNow, stage]);

  // Algorithm 1 switchQuestion: flush delta on current question, switch pointer, reset anchor
  const switchQuestion = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(questions.length - 1, nextIndex));
      if (clamped === currentIndexRef.current) return;
      flushActiveQuestionTime();
      currentIndexRef.current = clamped;
      setCurrentIndex(clamped);
      questionStartRef.current = Date.now();
      setAnnouncement(
        `Moved to question ${clamped + 1} of ${questions.length}`,
      );
      persistDraftNow();
    },
    [flushActiveQuestionTime, persistDraftNow, questions.length],
  );

  // Keyboard-First Navigation: Alt+N (Next), Alt+P (Previous)
  useEffect(() => {
    if (stage !== 'exam' || showConfirmModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'n') {
        e.preventDefault();
        if (currentIndexRef.current < questions.length - 1) {
          switchQuestion(currentIndexRef.current + 1);
        }
      } else if (key === 'p') {
        e.preventDefault();
        if (currentIndexRef.current > 0) {
          switchQuestion(currentIndexRef.current - 1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stage, showConfirmModal, questions.length, switchQuestion]);

  const totalRecommendedSeconds = useMemo(
    () =>
      questions.reduce(
        (sum, q) => sum + (q.recommendedTimeSeconds || Math.max(45, (q.marks || 2) * 60)),
        0,
      ),
    [questions],
  );

  const timeProgressPercent = Math.min(
    100,
    Math.max(0, (displayActiveSeconds / Math.max(60, totalRecommendedSeconds)) * 100),
  );
  const answeredCount = Object.values(answers).filter((a) => a.trim().length > 0).length;
  const currentQuestion = questions[currentIndex];
  const currentAnswer = answers[currentIndex] ?? '';
  const currentConfidence = confidenceRatings[currentIndex] ?? 3;

  const handleOpenConfirmFinish = () => {
    flushActiveQuestionTime();
    persistDraftNow();
    setShowConfirmModal(true);
  };

  const handleConfirmFinishToReview = () => {
    setShowConfirmModal(false);
    // Pre-populate keyword rubric auto-marks for every question
    const initialMarks: Record<number, number> = {};
    const matchesMap: Record<number, { matched: string[]; missed: string[] }> = {};

    questions.forEach((q, idx) => {
      const clean = sanitizeAnswerText(answers[idx] ?? '');
      const evalRes = evaluateKeywordRubric(clean, q.marks || 2, q.rubricKeywords || []);
      initialMarks[idx] = evalRes.marksAwarded;
      matchesMap[idx] = {
        matched: evalRes.matchedKeywords,
        missed: evalRes.missedKeywords,
      };
    });

    setReviewMarks(initialMarks);
    setRubricMatches(matchesMap);
    setStage('review');
    setAnnouncement('Paper paused for self-mark review.');
    window.scrollTo(0, 0);
  };

  const handleFinalizeReport = () => {
    const nowIso = new Date().toISOString();
    const id = `result-${Date.now()}`;

    const questionLogs: QuestionResponseLog[] = questions.map((q, idx) => {
      const cleanAnswer = sanitizeAnswerText(answers[idx] ?? '');
      const totalMarks = Math.max(1, q.marks || 2);
      const awarded = Math.max(0, Math.min(totalMarks, reviewMarks[idx] ?? 0));
      const timeSpentSeconds = Math.max(1, Math.round(timeMapRef.current[idx] ?? 0));
      const recSeconds = q.recommendedTimeSeconds || totalMarks * 60;
      const conf = confidenceRatings[idx] ?? 3;

      return {
        questionIndex: idx,
        questionNumber: q.questionNumber || String(idx + 1),
        prompt: q.prompt,
        topicCategory: q.topicCategory || 'General Specification',
        answerText: cleanAnswer,
        marksAwarded: awarded,
        totalMarks,
        timeSpentSeconds,
        recommendedTimeSeconds: recSeconds,
        confidence: conf,
        matchedKeywords: rubricMatches[idx]?.matched || [],
        missedKeywords: rubricMatches[idx]?.missed || [],
      };
    });

    const topicBreakdown = calculateTopicWeakness(questionLogs);

    const totalMarksAwarded = questionLogs.reduce((s, q) => s + q.marksAwarded, 0);
    const totalMarksPossible = questionLogs.reduce((s, q) => s + q.totalMarks, 0);
    const scorePercent = Math.round(
      (totalMarksAwarded / Math.max(1, totalMarksPossible)) * 100,
    );

    const totalTimeSpent = questionLogs.reduce((s, q) => s + q.timeSpentSeconds, 0);
    const avgSec = Math.round(totalTimeSpent / Math.max(1, questionLogs.length));

    // Populate legacy topicScores object alongside full topicBreakdown for compatibility
    const findTopicScore = (keyword: string, fallback: number) => {
      const match = topicBreakdown.find((t) =>
        t.topic.toLowerCase().includes(keyword.toLowerCase()),
      );
      return match ? match.scorePercent : fallback;
    };

    const weakest = topicBreakdown[0];
    const summary = weakest
      ? `Scored ${totalMarksAwarded}/${totalMarksPossible} marks (${scorePercent}%). Top revision priority: ${weakest.topic} (${weakest.status}, ${weakest.scorePercent}% accuracy at ${weakest.timeRatioPercent}% of target time).`
      : `Scored ${scorePercent}% across ${questions.length} questions.`;

    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      // Ignore cleanup error
    }

    onEndPaper({
      id,
      paperTitle: paper.title,
      scorePercent,
      avgTimeLabel: formatDurationCompact(avgSec),
      completedAt: nowIso,
      questionsAnswered: answeredCount,
      totalQuestions: questions.length,
      summary,
      topicScores: {
        computerSystems: findTopicScore('Computer Systems', scorePercent),
        dataStructures: findTopicScore('Data Structures', scorePercent),
        softwareEngineering: findTopicScore('Software', scorePercent),
      },
      topicBreakdown,
      questionLogs,
    });
  };

  const containerSurface = highContrast
    ? 'bg-white border-2 border-neutral-950 text-black shadow-none'
    : 'bg-white/75 dark:bg-[#1C1C1E]/75 backdrop-blur-2xl border border-white/80 dark:border-white/10 text-neutral-950 dark:text-neutral-50 shadow-[0_20px_50px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.85)]';

  const headerSurface = highContrast
    ? 'bg-black border border-black text-white'
    : 'bg-[#1D1D1F]/90 dark:bg-white/15 backdrop-blur-xl border border-white/20 text-white shadow-sm';

  return (
    <section
      className="relative pt-10 pb-20 px-6 w-full max-w-4xl mx-auto"
      aria-label="Exam session workspace"
    >
      {/* Screen-reader polite status announcements */}
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className={`w-full rounded-[32px] p-6 sm:p-10 transition-colors ${containerSurface}`}
      >
        {/* Top Apple Translucent Header Bar + Subtle Progress Bar */}
        <div className={`relative w-full rounded-2xl overflow-hidden mb-5 ${headerSurface}`}>
          <div className="px-5 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-3 min-w-0">
              <span className="text-sm sm:text-base font-bold font-mono tabular-nums whitespace-nowrap shrink-0">
                {stage === 'exam'
                  ? `Q ${currentIndex + 1}/${questions.length}`
                  : 'Self-Mark Review'}
              </span>
              <span className="text-xs sm:text-sm text-white/85 truncate">
                {paper.title}
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs sm:text-sm font-medium text-white/90 font-mono tabular-nums shrink-0">
              <span>
                {answeredCount}/{questions.length} answered
              </span>
              <span>Active: {formatDurationCompact(displayActiveSeconds)}</span>
            </div>
          </div>

          {/* Horizontal 3px Subtle Progress Bar */}
          <div
            className="w-full h-[3px] bg-white/20 overflow-hidden"
            role="progressbar"
            aria-label="Exam pacing progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(timeProgressPercent)}
          >
            <div
              className="h-full bg-white rounded-r-full transition-[width] duration-700 ease-linear"
              style={{ width: `${timeProgressPercent}%` }}
            />
          </div>
        </div>

        {/* Accessibility & Draft Status Control Strip */}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 pb-5 mb-6 border-b ${
            highContrast ? 'border-neutral-900' : 'border-black/10'
          }`}
        >
          <div className="flex flex-wrap items-center gap-4">
            {/* Scalable Text Control (14px-24px) */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                Text Size
              </span>
              <button
                type="button"
                aria-label="Decrease text size"
                onClick={() => setFontSizePx((s) => Math.max(14, s - 2))}
                className="p-1.5 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] active:scale-95 transition-all cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <input
                type="range"
                min={14}
                max={24}
                step={1}
                value={fontSizePx}
                onChange={(e) => setFontSizePx(Number(e.target.value))}
                aria-label="Adjust exam text size from 14px to 24px"
                className="w-20 accent-[#0071E3] cursor-pointer"
              />
              <button
                type="button"
                aria-label="Increase text size"
                onClick={() => setFontSizePx((s) => Math.min(24, s + 2))}
                className="p-1.5 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] active:scale-95 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <span className="text-xs font-mono tabular-nums font-semibold w-9 text-neutral-700 dark:text-neutral-300">
                {fontSizePx}px
              </span>
            </div>

            {/* High-Contrast Toggle (T06) */}
            {onToggleHighContrast && (
              <button
                type="button"
                aria-pressed={highContrast}
                onClick={onToggleHighContrast}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] ${
                  highContrast
                    ? 'bg-black text-white border-black'
                    : 'bg-black/[0.04] dark:bg-white/[0.08] border-black/10 dark:border-white/10 text-neutral-800 dark:text-neutral-200 hover:bg-black/[0.08] dark:hover:bg-white/[0.12]'
                }`}
              >
                <Contrast className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{highContrast ? 'High Contrast: On' : 'High Contrast'}</span>
              </button>
            )}
          </div>

          <div
            aria-live="polite"
            className="flex items-center gap-2 text-xs font-mono tabular-nums text-neutral-500 dark:text-neutral-400"
          >
            <Save className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden="true" />
            <span>{draftStatus || 'Auto-save ready (5s)'}</span>
          </div>
        </div>

        {/* Network Offline Warning Banner (Test T05) */}
        {isOffline && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-6 flex items-start gap-2.5 rounded-2xl bg-[#FF9500]/10 border border-[#FF9500]/30 px-4 py-3 text-xs sm:text-sm font-semibold text-[#FF9500]"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Network connection lost. Your answers and per-question timing remain cached locally every 5 seconds until reconnected.
            </span>
          </div>
        )}

        {stage === 'exam' ? (
          <>
            {/* Question Header & High-Contrast Mark Badge */}
            <div className="mb-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                <p className="text-sm font-semibold tracking-tight text-neutral-500 dark:text-neutral-400">
                  {currentQuestion.questionNumber
                    ? `Question ${currentQuestion.questionNumber}`
                    : `Question ${currentIndex + 1}`}{' '}
                  <span aria-hidden="true">·</span>{' '}
                  <span>{currentQuestion.topicCategory}</span>
                </p>

                {/* High-Contrast Mark & Target Time Badge (Criterion 4 #8) */}
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold font-mono tabular-nums whitespace-nowrap shrink-0 ${
                    highContrast
                      ? 'bg-black text-white'
                      : 'bg-[#1D1D1F] dark:bg-white/15 text-white shadow-xs'
                  }`}
                >
                  {currentQuestion.marks} {currentQuestion.marks === 1 ? 'Mark' : 'Marks'} · Target{' '}
                  {formatDurationCompact(
                    currentQuestion.recommendedTimeSeconds || currentQuestion.marks * 60,
                  )}
                </span>
              </div>

              {currentQuestion.stemContext && (
                <p
                  style={{ fontSize: `${Math.max(14, fontSizePx - 1)}px` }}
                  className={`leading-relaxed mb-3 rounded-2xl px-4 py-3 ${
                    highContrast
                      ? 'bg-neutral-100 border border-neutral-900 text-black'
                      : 'bg-black/[0.03] dark:bg-white/[0.04] text-neutral-800 dark:text-neutral-200'
                  }`}
                >
                  {currentQuestion.stemContext}
                </p>
              )}

              <p
                style={{ fontSize: `${fontSizePx + 1}px` }}
                className="font-bold tracking-tight text-[#1D1D1F] dark:text-[#F5F5F7] leading-relaxed"
              >
                {currentQuestion.prompt}
              </p>
            </div>

            {/* Optional Extracted PDF Text Drawer */}
            {paper.extractedText && (
              <div className="mb-5">
                <button
                  type="button"
                  onClick={() => setShowExtractedText((prev) => !prev)}
                  className="text-xs sm:text-sm font-semibold text-[#0071E3] hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] rounded-md px-1"
                >
                  {showExtractedText ? 'Hide extracted PDF text' : 'View extracted PDF text'}
                </button>

                {showExtractedText && (
                  <pre className="mt-2.5 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/8 dark:border-white/10 p-4 text-xs text-neutral-800 dark:text-neutral-200 font-mono leading-relaxed">
                    {paper.extractedText}
                  </pre>
                )}
              </div>
            )}

            {/* Answer Textarea (Scaled fontSizePx, sanitized, accepts 500+ chars cleanly) */}
            <div className="mb-6">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor={`answer-q-${currentIndex}`}
                  className="text-xs font-semibold text-neutral-700"
                >
                  Your Response
                </label>
                <span className="text-xs font-mono tabular-nums text-neutral-600">
                  {currentAnswer.length} chars · Q time:{' '}
                  {formatDurationCompact(questionTimeMap[currentIndex] ?? 0)}
                </span>
              </div>

              <textarea
                id={`answer-q-${currentIndex}`}
                value={currentAnswer}
                onChange={(e) => {
                  const val = e.target.value;
                  setAnswers((prev) => ({
                    ...prev,
                    [currentIndex]: val,
                  }));
                }}
                aria-label={`Answer for Question ${currentQuestion.questionNumber || currentIndex + 1}`}
                placeholder="Type your exam answer here..."
                rows={7}
                style={{ fontSize: `${fontSizePx}px` }}
                className={`w-full rounded-2xl p-5 leading-relaxed outline-none resize-y transition-all ${
                  highContrast
                    ? 'bg-white border-2 border-neutral-950 text-black placeholder:text-neutral-600 focus:ring-2 focus:ring-[#0071E3]'
                    : 'bg-black/[0.03] dark:bg-white/[0.05] border border-black/8 dark:border-white/10 text-neutral-950 dark:text-neutral-50 placeholder:text-neutral-400 focus:border-[#0071E3] focus:ring-2 focus:ring-[#0071E3]/20 focus:bg-white dark:focus:bg-[#1C1C1E]'
                }`}
              />
            </div>

            {/* Confidence Rating Selector (1 to 5, Criterion 5) */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-6 mb-6 border-b border-black/[0.06] dark:border-white/[0.08]">
              <div>
                <span className="text-xs sm:text-sm font-semibold tracking-tight text-[#1D1D1F] dark:text-[#F5F5F7] block">
                  Confidence Rating
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  1 (Unsure) to 5 (Confident)
                </span>
              </div>

              <div
                role="radiogroup"
                aria-label="Confidence rating 1 to 5"
                className="flex items-center gap-1.5"
              >
                {[1, 2, 3, 4, 5].map((rating) => {
                  const selected = currentConfidence === rating;
                  return (
                    <button
                      key={rating}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`Confidence ${rating} out of 5`}
                      onClick={() =>
                        setConfidenceRatings((prev) => ({
                          ...prev,
                          [currentIndex]: rating,
                        }))
                      }
                      className={`w-9 h-9 rounded-xl text-xs font-bold font-mono tabular-nums border transition-all cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] ${
                        selected
                          ? highContrast
                            ? 'bg-black text-white border-black'
                            : 'bg-[#0071E3] text-white border-[#0071E3] shadow-xs'
                          : 'bg-black/[0.03] dark:bg-white/[0.06] text-neutral-800 dark:text-neutral-200 border-black/5 dark:border-white/10 hover:bg-black/[0.07] dark:hover:bg-white/[0.12]'
                      }`}
                    >
                      {rating}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Navigation Row with Keyboard Shortcut Hints */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <FluidButton
                  variant="secondary"
                  size="md"
                  disabled={currentIndex === 0}
                  aria-label="Previous question (Alt+P)"
                  aria-keyshortcuts="Alt+P"
                  onClick={() => switchQuestion(currentIndex - 1)}
                  className={currentIndex === 0 ? 'opacity-45 pointer-events-none' : ''}
                >
                  Previous (Alt+P)
                </FluidButton>

                <FluidButton
                  variant="secondary"
                  size="md"
                  disabled={currentIndex === questions.length - 1}
                  aria-label="Next question (Alt+N)"
                  aria-keyshortcuts="Alt+N"
                  onClick={() => switchQuestion(currentIndex + 1)}
                  className={
                    currentIndex === questions.length - 1
                      ? 'opacity-45 pointer-events-none'
                      : ''
                  }
                >
                  Next (Alt+N)
                </FluidButton>
              </div>

              <FluidButton
                variant="primary"
                size="md"
                aria-label="End paper and review marks"
                onClick={handleOpenConfirmFinish}
              >
                End paper
              </FluidButton>
            </div>
          </>
        ) : (
          /* Self-Mark Review Step */
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight">
                Keyword Rubric &amp; Self-Mark Review
              </h2>
              <p className="text-xs sm:text-sm text-neutral-700 mt-1">
                Review auto-suggested marks against rubric keywords and adjust before generating your Weakness Ranking report.
              </p>
            </div>

            <div className="divide-y divide-black/10 border-t border-b border-black/10">
              {questions.map((q, idx) => {
                const maxMarks = Math.max(1, q.marks || 2);
                const currentAwarded = reviewMarks[idx] ?? 0;
                const timeSec = Math.max(1, Math.round(timeMapRef.current[idx] ?? 0));
                const recSec = q.recommendedTimeSeconds || maxMarks * 60;
                const cleanAnswer = sanitizeAnswerText(answers[idx] ?? '').trim();
                const matched = rubricMatches[idx]?.matched || [];
                const missed = rubricMatches[idx]?.missed || [];

                return (
                  <div key={idx} className="py-5 space-y-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm sm:text-base font-bold">
                        {q.questionNumber ? `Q${q.questionNumber}` : `Q${idx + 1}`}: {q.prompt}
                      </p>
                      <span className="text-xs font-mono tabular-nums font-semibold text-neutral-700 shrink-0">
                        {q.topicCategory} · Time: {formatDurationCompact(timeSec)} / Target{' '}
                        {formatDurationCompact(recSec)}
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm rounded-xl bg-black/[0.04] px-4 py-2.5 text-neutral-800 whitespace-pre-wrap">
                      {cleanAnswer || 'No response entered.'}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                      <div className="text-xs text-neutral-700 space-y-0.5">
                        {matched.length > 0 && (
                          <p className="text-emerald-800 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" aria-hidden="true" />
                            Matched concepts: {matched.join(', ')}
                          </p>
                        )}
                        {missed.length > 0 && (
                          <p className="text-neutral-600">
                            Suggested rubric terms not detected: {missed.slice(0, 4).join(', ')}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-semibold">Marks Awarded:</span>
                        <button
                          type="button"
                          aria-label={`Decrease marks for question ${idx + 1}`}
                          disabled={currentAwarded <= 0}
                          onClick={() =>
                            setReviewMarks((prev) => ({
                              ...prev,
                              [idx]: Math.max(0, (prev[idx] ?? 0) - 1),
                            }))
                          }
                          className="p-1.5 rounded-lg border border-black/15 hover:bg-black/5 disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]"
                        >
                          <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <span className="text-sm font-bold font-mono tabular-nums min-w-[44px] text-center">
                          {currentAwarded}/{maxMarks}
                        </span>
                        <button
                          type="button"
                          aria-label={`Increase marks for question ${idx + 1}`}
                          disabled={currentAwarded >= maxMarks}
                          onClick={() =>
                            setReviewMarks((prev) => ({
                              ...prev,
                              [idx]: Math.min(maxMarks, (prev[idx] ?? 0) + 1),
                            }))
                          }
                          className="p-1.5 rounded-lg border border-black/15 hover:bg-black/5 disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]"
                        >
                          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <FluidButton
                variant="secondary"
                size="md"
                onClick={() => setStage('exam')}
              >
                Back to Paper
              </FluidButton>
              <FluidButton
                variant="primary"
                size="md"
                onClick={handleFinalizeReport}
              >
                Generate Performance Report
              </FluidButton>
            </div>
          </div>
        )}
      </motion.div>

      {/* Explicit Confirmation Modal (Criterion 4 #10) */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs px-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-finish-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white border border-black/15 shadow-xl p-6 sm:p-8 text-neutral-950">
            <h2 id="confirm-finish-title" className="text-lg font-bold tracking-tight mb-2">
              Confirm Finish Paper?
            </h2>
            <p className="text-sm text-neutral-700 leading-relaxed mb-5 tabular-nums">
              You have answered <strong>{answeredCount}</strong> of{' '}
              <strong>{questions.length}</strong> questions in{' '}
              <strong>{formatDurationCompact(displayActiveSeconds)}</strong> active time.
              {answeredCount < questions.length && (
                <> ({questions.length - answeredCount} unanswered)</>
              )}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <FluidButton
                variant="secondary"
                size="sm"
                onClick={() => setShowConfirmModal(false)}
              >
                Continue Paper
              </FluidButton>
              <FluidButton
                variant="primary"
                size="sm"
                onClick={handleConfirmFinishToReview}
              >
                Confirm Finish
              </FluidButton>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
