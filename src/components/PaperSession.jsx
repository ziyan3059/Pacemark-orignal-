import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Contrast, Minus, Pause, Play, Plus, Save } from 'lucide-react';
import { FluidButton } from './ui/fluid-button';
import {
  calculateTopicWeakness,
  evaluateKeywordRubric,
  formatDurationCompact,
  sanitizeAnswerText,
} from '../lib/examEngine';

const QUESTIONS_BY_PAPER = {
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

export const PaperSession = ({
  paper,
  username,
  highContrast = false,
  onToggleHighContrast,
  onCancelPaper,
  onEndPaper,
}) => {
  const questions = useMemo(() => {
    const rawQuestions =
      Array.isArray(paper?.questions) && paper.questions.length > 0
        ? paper.questions
        : QUESTIONS_BY_PAPER[paper?.id] || [];
    return rawQuestions.map((questionItem) => {
      const resolvedMarks = Math.max(1, Number(questionItem.marks) || 2);
      return {
        ...questionItem,
        marks: resolvedMarks,
        topicCategory: questionItem.topicCategory || 'General Specification',
        recommendedTimeSeconds: resolvedMarks * 60,
        rubricKeywords: questionItem.rubricKeywords || [],
      };
    });
  }, [paper]);

  const draftStorageKey = useMemo(
    () => `pacemark_exam_draft_${(username || 'guest').trim().toLowerCase()}_${paper.id}`,
    [username, paper.id],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [confidenceRatings, setConfidenceRatings] = useState({});
  const [displayActiveSeconds, setDisplayActiveSeconds] = useState(0);
  const [displayQuestionSeconds, setDisplayQuestionSeconds] = useState(0);
  const [isTypingFocused, setIsTypingFocused] = useState(false);
  const [confidenceNudgedIndex, setConfidenceNudgedIndex] = useState(null);

  const [showExtractedText, setShowExtractedText] = useState(false);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [draftStatus, setDraftStatus] = useState('');
  const [announcement, setAnnouncement] = useState('');

  const [stage, setStage] = useState('exam');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [reviewMarks, setReviewMarks] = useState({});
  const [rubricMatches, setRubricMatches] = useState({});

  const textareaRef = useRef(null);
  const currentIndexRef = useRef(0);
  const questionStartRef = useRef(null);
  const timeMapRef = useRef({});
  const isTypingFocusedRef = useRef(false);
  const isPausedRef = useRef(true);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const computeLiveTotals = useCallback(() => {
    const accumulatedTotal = Object.values(timeMapRef.current).reduce(
      (accumulator, seconds) => accumulator + seconds,
      0,
    );
    const activeIndex = currentIndexRef.current;
    const accumulatedQuestion = timeMapRef.current[activeIndex] ?? 0;
    const liveDelta =
      isPausedRef.current || questionStartRef.current === null
        ? 0
        : Math.max(0, (Date.now() - questionStartRef.current) / 1000);
    return {
      totalElapsed: accumulatedTotal + liveDelta,
      questionElapsed: accumulatedQuestion + liveDelta,
    };
  }, []);

  useEffect(() => {
    if (questions.length === 0) return;
    try {
      const savedRaw = window.localStorage.getItem(draftStorageKey);
      if (savedRaw) {
        const parsedDraft = JSON.parse(savedRaw);
        if (parsedDraft.answers && typeof parsedDraft.answers === 'object') {
          setAnswers(parsedDraft.answers);
        }
        if (parsedDraft.confidenceRatings && typeof parsedDraft.confidenceRatings === 'object') {
          setConfidenceRatings(parsedDraft.confidenceRatings);
        }
        if (parsedDraft.questionTimeMap && typeof parsedDraft.questionTimeMap === 'object') {
          timeMapRef.current = { ...parsedDraft.questionTimeMap };
        }
        if (
          typeof parsedDraft.currentIndex === 'number' &&
          parsedDraft.currentIndex >= 0 &&
          parsedDraft.currentIndex < questions.length
        ) {
          setCurrentIndex(parsedDraft.currentIndex);
          currentIndexRef.current = parsedDraft.currentIndex;
        }
        setDraftStatus('Restored saved draft');
      }
    } catch (draftError) {
      console.warn('Could not restore saved exam draft:', draftError);
      setDraftStatus('Saved draft unreadable');
    }
    const { totalElapsed, questionElapsed } = computeLiveTotals();
    setDisplayActiveSeconds(totalElapsed);
    setDisplayQuestionSeconds(questionElapsed);
  }, [draftStorageKey, questions.length, computeLiveTotals]);

  const flushActiveQuestionTime = useCallback(() => {
    if (isPausedRef.current || questionStartRef.current === null) return;
    const currentTimestamp = Date.now();
    const elapsedSeconds = Math.max(0, (currentTimestamp - questionStartRef.current) / 1000);
    const activeIndex = currentIndexRef.current;
    const updatedDuration = (timeMapRef.current[activeIndex] ?? 0) + elapsedSeconds;
    timeMapRef.current = { ...timeMapRef.current, [activeIndex]: updatedDuration };
    questionStartRef.current = currentTimestamp;
  }, []);

  const syncTimerState = useCallback(() => {
    const hasWindowFocus =
      typeof document === 'undefined' ||
      (!document.hidden && (typeof document.hasFocus !== 'function' || document.hasFocus()));
    const canRun =
      stage === 'exam' &&
      !showConfirmModal &&
      questions.length > 0 &&
      isTypingFocusedRef.current &&
      hasWindowFocus;

    if (canRun && isPausedRef.current) {
      questionStartRef.current = Date.now();
      isPausedRef.current = false;
    } else if (!canRun && !isPausedRef.current) {
      flushActiveQuestionTime();
      questionStartRef.current = null;
      isPausedRef.current = true;
    }

    const { totalElapsed, questionElapsed } = computeLiveTotals();
    setDisplayActiveSeconds(totalElapsed);
    setDisplayQuestionSeconds(questionElapsed);
  }, [stage, showConfirmModal, questions.length, flushActiveQuestionTime, computeLiveTotals]);

  useEffect(() => {
    const handleWindowFocus = () => {
      const stillInField =
        textareaRef.current !== null && document.activeElement === textareaRef.current;
      isTypingFocusedRef.current = stillInField;
      setIsTypingFocused(stillInField);
      syncTimerState();
    };

    const handleWindowBlurOrVisibility = () => {
      syncTimerState();
    };

    window.addEventListener('blur', handleWindowBlurOrVisibility);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleWindowBlurOrVisibility);

    return () => {
      window.removeEventListener('blur', handleWindowBlurOrVisibility);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleWindowBlurOrVisibility);
    };
  }, [syncTimerState]);

  useEffect(() => {
    syncTimerState();
  }, [syncTimerState]);

  useEffect(() => {
    const timerInterval = setInterval(() => {
      if (isPausedRef.current) return;
      const { totalElapsed, questionElapsed } = computeLiveTotals();
      setDisplayActiveSeconds(totalElapsed);
      setDisplayQuestionSeconds(questionElapsed);
    }, 250);
    return () => clearInterval(timerInterval);
  }, [computeLiveTotals]);

  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const latestDraftRef = useRef({ answers, confidenceRatings, currentIndex });
  useEffect(() => {
    latestDraftRef.current = { answers, confidenceRatings, currentIndex };
  }, [answers, confidenceRatings, currentIndex]);

  const persistDraftNow = useCallback(() => {
    if (stage !== 'exam' || questions.length === 0) return;
    try {
      const draftSnapshot = {
        answers: latestDraftRef.current.answers,
        confidenceRatings: latestDraftRef.current.confidenceRatings,
        questionTimeMap: timeMapRef.current,
        currentIndex: latestDraftRef.current.currentIndex,
        updatedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draftSnapshot));
      const timeLabel = new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setDraftStatus(`Auto-saved · ${timeLabel}`);
    } catch (storageError) {
      console.warn('Auto-save draft failed:', storageError);
      setDraftStatus('Auto-save unavailable (storage blocked or full)');
    }
  }, [draftStorageKey, stage, questions.length]);

  useEffect(() => {
    if (stage !== 'exam' || questions.length === 0) return;
    const autoSaveTimer = setInterval(persistDraftNow, 5000);
    return () => {
      clearInterval(autoSaveTimer);
    };
  }, [persistDraftNow, stage, questions.length]);

  const switchQuestion = useCallback(
    (nextIndex, options = {}) => {
      if (questions.length === 0) return;
      const clampedIndex = Math.max(0, Math.min(questions.length - 1, nextIndex));
      if (clampedIndex === currentIndexRef.current) return;

      const activeQuestionIndex = currentIndexRef.current;
      const hasTypedAnswer = (latestDraftRef.current.answers[activeQuestionIndex] ?? '').trim().length > 0;
      const hasConfidence = latestDraftRef.current.confidenceRatings[activeQuestionIndex] != null;
      if (!options.bypassNudge && hasTypedAnswer && !hasConfidence && confidenceNudgedIndex !== activeQuestionIndex) {
        setConfidenceNudgedIndex(activeQuestionIndex);
        setAnnouncement('Reminder: please select a confidence rating from 1 to 5 before moving on.');
        return;
      }

      setConfidenceNudgedIndex(null);
      flushActiveQuestionTime();
      currentIndexRef.current = clampedIndex;
      setCurrentIndex(clampedIndex);
      if (!isPausedRef.current) {
        questionStartRef.current = Date.now();
      }
      const { totalElapsed, questionElapsed } = computeLiveTotals();
      setDisplayActiveSeconds(totalElapsed);
      setDisplayQuestionSeconds(questionElapsed);
      setAnnouncement(
        `Moved to question ${clampedIndex + 1} of ${questions.length}`,
      );
      persistDraftNow();
    },
    [flushActiveQuestionTime, computeLiveTotals, persistDraftNow, questions.length, confidenceNudgedIndex],
  );

  // Keyboard shortcuts Alt+N (next) and Alt+P (previous) keep focus inside the answer box
  useEffect(() => {
    if (stage !== 'exam' || showConfirmModal || questions.length === 0) return;
    const handleKeyDown = (keyboardEvent) => {
      if (!keyboardEvent.altKey) return;
      const pressedKey = keyboardEvent.key.toLowerCase();
      if (pressedKey === 'n') {
        keyboardEvent.preventDefault();
        if (currentIndexRef.current < questions.length - 1) {
          switchQuestion(currentIndexRef.current + 1);
        }
      } else if (pressedKey === 'p') {
        keyboardEvent.preventDefault();
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
        (accumulator, question) =>
          accumulator + Math.max(1, question.marks || 2) * 60,
        0,
      ),
    [questions],
  );

  const answeredCount = Object.values(answers).filter((answerText) => answerText.trim().length > 0).length;
  const currentQuestion = questions[currentIndex];
  const currentAnswer = answers[currentIndex] ?? '';
  const currentConfidence = confidenceRatings[currentIndex] ?? null;

  const missingConfidenceIndices = useMemo(
    () =>
      questions
        .map((_, questionIndex) => questionIndex)
        .filter(
          (questionIndex) =>
            (answers[questionIndex] ?? '').trim().length > 0 &&
            confidenceRatings[questionIndex] == null,
        ),
    [questions, answers, confidenceRatings],
  );

  const currentQuestionMarks = Math.max(1, currentQuestion?.marks || 2);
  const currentQuestionTargetSeconds = currentQuestionMarks * 60;
  const currentRemainingSeconds = Math.max(
    0,
    currentQuestionTargetSeconds - displayQuestionSeconds,
  );
  const currentOvertimeSeconds = Math.max(
    0,
    displayQuestionSeconds - currentQuestionTargetSeconds,
  );
  const isCurrentQuestionOvertime = displayQuestionSeconds > currentQuestionTargetSeconds;

  const totalRemainingSeconds = Math.max(0, totalRecommendedSeconds - displayActiveSeconds);
  const paperOvertimeSeconds = Math.max(0, displayActiveSeconds - totalRecommendedSeconds);
  const isPaperOvertime = displayActiveSeconds > totalRecommendedSeconds;

  const remainingProgressPercent = Math.min(
    100,
    Math.max(0, (currentRemainingSeconds / Math.max(1, currentQuestionTargetSeconds)) * 100),
  );
  const isTimerRunning =
    stage === 'exam' && !showConfirmModal && questions.length > 0 && isTypingFocused;

  const handleOpenConfirmFinish = () => {
    flushActiveQuestionTime();
    persistDraftNow();
    setShowConfirmModal(true);
  };

  const handleConfirmFinishToReview = () => {
    setShowConfirmModal(false);
    const suggestedMarks = {};
    const matchedKeywordsMap = {};

    questions.forEach((question, questionIndex) => {
      const cleanAnswer = sanitizeAnswerText(answers[questionIndex] ?? '');
      const rubricEvaluation = evaluateKeywordRubric(
        cleanAnswer,
        question.marks || 2,
        question.rubricKeywords || [],
      );
      suggestedMarks[questionIndex] = rubricEvaluation.marksAwarded;
      matchedKeywordsMap[questionIndex] = {
        matched: rubricEvaluation.matchedKeywords,
        missed: rubricEvaluation.missedKeywords,
      };
    });

    setReviewMarks(suggestedMarks);
    setRubricMatches(matchedKeywordsMap);
    setStage('review');
    setAnnouncement('Paper paused for self-mark review.');
    window.scrollTo(0, 0);
  };

  const handleFinalizeReport = () => {
    const completedIso = new Date().toISOString();
    const resultId = `result-${Date.now()}`;

    const questionLogs = questions.map((question, questionIndex) => {
      const cleanAnswer = sanitizeAnswerText(answers[questionIndex] ?? '');
      const totalMarks = Math.max(1, question.marks || 2);
      const awardedMarks = Math.max(0, Math.min(totalMarks, reviewMarks[questionIndex] ?? 0));
      const timeSpentSeconds = Math.max(0, Math.round(timeMapRef.current[questionIndex] ?? 0));
      const recommendedSeconds = totalMarks * 60;
      const confidence = confidenceRatings[questionIndex] ?? null;

      return {
        questionIndex,
        questionNumber: question.questionNumber || String(questionIndex + 1),
        prompt: question.prompt,
        topicCategory: question.topicCategory || 'General Specification',
        answerText: cleanAnswer,
        marksAwarded: awardedMarks,
        totalMarks,
        timeSpentSeconds,
        recommendedTimeSeconds: recommendedSeconds,
        confidence,
        matchedKeywords: rubricMatches[questionIndex]?.matched || [],
        missedKeywords: rubricMatches[questionIndex]?.missed || [],
      };
    });

    const topicBreakdown = calculateTopicWeakness(questionLogs);

    const totalMarksAwarded = questionLogs.reduce(
      (accumulator, questionLog) => accumulator + questionLog.marksAwarded,
      0,
    );
    const totalMarksPossible = questionLogs.reduce(
      (accumulator, questionLog) => accumulator + questionLog.totalMarks,
      0,
    );
    const scorePercent = Math.round(
      (totalMarksAwarded / Math.max(1, totalMarksPossible)) * 100,
    );

    const totalTimeSpent = questionLogs.reduce(
      (accumulator, questionLog) => accumulator + questionLog.timeSpentSeconds,
      0,
    );
    const averageSeconds = Math.round(totalTimeSpent / Math.max(1, questionLogs.length));

    const weakestTopic = topicBreakdown[0];
    const summaryText = weakestTopic
      ? `Scored ${totalMarksAwarded}/${totalMarksPossible} marks (${scorePercent}%). Top revision priority: ${weakestTopic.topic} (${weakestTopic.status}, ${weakestTopic.scorePercent}% accuracy at ${weakestTopic.timeRatioPercent}% of target time).`
      : `Scored ${scorePercent}% across ${questions.length} questions.`;

    try {
      window.localStorage.removeItem(draftStorageKey);
    } catch (storageError) {
      console.warn('Unable to clear completed exam draft from localStorage:', storageError);
    }

    onEndPaper({
      id: resultId,
      paperId: paper.id || null,
      paperTitle: paper.title,
      scorePercent,
      avgTimeLabel: formatDurationCompact(averageSeconds),
      completedAt: completedIso,
      questionsAnswered: answeredCount,
      totalQuestions: questions.length,
      summary: summaryText,
      topicBreakdown,
      questionLogs,
    });
  };

  const containerSurfaceClass = highContrast
    ? 'bg-white border-2 border-black text-black shadow-none'
    : 'bg-white/90 backdrop-blur-2xl border border-black/10 text-[#1D1D1F] shadow-[0_20px_50px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.95)]';

  const headerSurfaceClass = highContrast
    ? 'bg-black border-2 border-black text-white'
    : 'bg-[#1D1D1F] border border-black/15 text-white shadow-sm';

  if (questions.length === 0) {
    return (
      <section className="relative pt-10 pb-20 px-6 w-full max-w-4xl mx-auto">
        <div className={`w-full rounded-[32px] p-8 sm:p-12 text-center ${containerSurfaceClass}`}>
          <h1 className="text-xl font-bold tracking-tight mb-2">
            No Selectable Questions Available
          </h1>
          <p className={`text-sm mb-6 ${highContrast ? 'text-black' : 'text-[#48484A]'}`}>
            This PDF could not be split into selectable questions because it contains scanned images rather than digital text.
          </p>
          <FluidButton
            variant="primary"
            size="md"
            highContrast={highContrast}
            onClick={() => onCancelPaper?.()}
          >
            Back to Papers
          </FluidButton>
        </div>
      </section>
    );
  }

  return (
    <section
      className="relative pt-10 pb-20 px-6 w-full max-w-4xl mx-auto"
      aria-label="Exam session workspace"
    >
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className={`w-full rounded-[32px] p-6 sm:p-10 transition-colors ${containerSurfaceClass}`}
      >
        <div className={`relative w-full rounded-2xl overflow-hidden mb-5 ${headerSurfaceClass}`}>
          <div className="px-5 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-3 min-w-0">
              <span className="text-sm sm:text-base font-bold font-mono tabular-nums whitespace-nowrap shrink-0 text-white">
                {stage === 'exam'
                  ? `Q ${currentIndex + 1}/${questions.length}`
                  : 'Self-Mark Review'}
              </span>
              <span className="text-xs sm:text-sm text-white/90 truncate">
                {paper.title}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm font-medium text-white font-mono tabular-nums shrink-0">
              {stage === 'exam' && (
                <span
                  aria-label={isTimerRunning ? 'Timer running' : 'Timer paused'}
                  title={isTimerRunning ? 'Timer running' : 'Timer paused'}
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${
                    isTimerRunning
                      ? 'bg-[#30D158]/20 text-[#6EE7B7] border border-[#30D158]/40'
                      : 'bg-white/15 text-white/90 border border-white/20'
                  }`}
                >
                  {isTimerRunning ? (
                    <Play className="w-3 h-3 fill-current" aria-hidden="true" />
                  ) : (
                    <Pause className="w-3 h-3 fill-current" aria-hidden="true" />
                  )}
                </span>
              )}
              <span>
                {answeredCount}/{questions.length}
              </span>
              <span className={isCurrentQuestionOvertime ? 'text-[#FCA5A5]' : ''}>
                Q:{' '}
                {isCurrentQuestionOvertime
                  ? `0s (+${formatDurationCompact(currentOvertimeSeconds)})`
                  : formatDurationCompact(currentRemainingSeconds)}
              </span>
              <span className={isPaperOvertime ? 'text-[#FCA5A5]' : 'text-white/85'}>
                Paper:{' '}
                {isPaperOvertime
                  ? `0s (+${formatDurationCompact(paperOvertimeSeconds)})`
                  : formatDurationCompact(totalRemainingSeconds)}
              </span>
            </div>
          </div>

          <div
            className="w-full h-[3px] bg-white/25 overflow-hidden"
            role="progressbar"
            aria-label="Current question countdown remaining"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(remainingProgressPercent)}
          >
            <div
              className={`h-full rounded-r-full transition-[width] duration-300 ease-linear ${
                isCurrentQuestionOvertime
                  ? 'bg-[#FF453A]'
                  : remainingProgressPercent <= 25
                    ? 'bg-[#FF9F0A]'
                    : 'bg-white'
              }`}
              style={{ width: `${remainingProgressPercent}%` }}
            />
          </div>
        </div>

        <div
          className={`flex flex-wrap items-center justify-between gap-3 pb-4 mb-6 border-b ${
            highContrast ? 'border-black' : 'border-black/10'
          }`}
        >
          <div className="flex items-center gap-3">
            {onToggleHighContrast && (
              <button
                type="button"
                aria-pressed={highContrast}
                onClick={onToggleHighContrast}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#005BB5] ${
                  highContrast
                    ? 'bg-black text-white border-2 border-black'
                    : 'bg-black/[0.05] border border-black/12 text-[#1D1D1F] hover:bg-black/[0.09]'
                }`}
              >
                <Contrast className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{highContrast ? 'High Contrast: On' : 'High Contrast'}</span>
              </button>
            )}
          </div>

          <div
            aria-live="polite"
            className={`flex items-center gap-2 text-xs font-mono tabular-nums ${
              highContrast ? 'text-black font-semibold' : 'text-[#48484A]'
            }`}
          >
            <Save className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{draftStatus || 'Auto-save ready'}</span>
          </div>
        </div>

        {isOffline && (
          <div
            role="alert"
            aria-live="assertive"
            className={`mb-6 flex items-start gap-2.5 rounded-2xl px-4 py-3 text-xs sm:text-sm font-semibold ${
              highContrast
                ? 'bg-white border-2 border-black text-black'
                : 'bg-[#FEF3C7] border border-[#F59E0B] text-[#92400E]'
            }`}
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Network connection lost. Your answers and per-question timing remain cached locally every 5 seconds until reconnected.
            </span>
          </div>
        )}

        {stage === 'exam' ? (
          <>
            <div className="mb-5">
              <p
                className={`text-sm font-semibold tracking-tight mb-2 ${
                  highContrast ? 'text-black' : 'text-[#48484A]'
                }`}
              >
                {currentQuestion.questionNumber
                  ? `Question ${currentQuestion.questionNumber}`
                  : `Question ${currentIndex + 1}`}{' '}
                <span aria-hidden="true">·</span>{' '}
                <span>{currentQuestion.topicCategory}</span>
              </p>

              {currentQuestion.stemContext && (
                <p
                  className={`text-sm sm:text-base leading-relaxed mb-3 rounded-2xl px-4 py-3 ${
                    highContrast
                      ? 'bg-white border-2 border-black text-black'
                      : 'bg-[#F2F4F8] border border-black/8 text-[#1D1D1F]'
                  }`}
                >
                  {currentQuestion.stemContext}
                </p>
              )}

              <p
                className={`text-base sm:text-lg font-bold tracking-tight leading-relaxed ${
                  highContrast ? 'text-black' : 'text-[#1D1D1F]'
                }`}
              >
                {currentQuestion.prompt}{' '}
                <span
                  className={`inline-block font-mono text-sm font-semibold whitespace-nowrap ${
                    highContrast ? 'text-black' : 'text-[#48484A]'
                  }`}
                >
                  [{currentQuestionMarks} {currentQuestionMarks === 1 ? 'Mark' : 'Marks'}]
                </span>
              </p>
            </div>

            {paper.extractedText && (
              <div className="mb-5">
                <button
                  type="button"
                  onClick={() => setShowExtractedText((prev) => !prev)}
                  className={`text-xs sm:text-sm font-semibold hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#005BB5] rounded-md px-1 ${
                    highContrast ? 'text-black underline' : 'text-[#005BB5]'
                  }`}
                >
                  {showExtractedText ? 'Hide extracted PDF text' : 'View extracted PDF text'}
                </button>

                {showExtractedText && (
                  <pre
                    className={`mt-2.5 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-2xl p-4 text-xs font-mono leading-relaxed ${
                      highContrast
                        ? 'bg-white border-2 border-black text-black'
                        : 'bg-[#F2F4F8] border border-black/10 text-[#1D1D1F]'
                    }`}
                  >
                    {paper.extractedText}
                  </pre>
                )}
              </div>
            )}

            <div className="mb-6">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span
                  aria-label={isTimerRunning ? 'Timer running' : 'Timer paused'}
                  title={isTimerRunning ? 'Timer running' : 'Timer paused'}
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full border ${
                    highContrast
                      ? 'border-black text-black bg-white'
                      : isTimerRunning
                        ? 'border-[#15803D]/30 bg-[#15803D]/10 text-[#15803D]'
                        : 'border-black/12 bg-black/[0.04] text-[#48484A]'
                  }`}
                >
                  {isTimerRunning ? (
                    <Play className="w-3 h-3 fill-current" aria-hidden="true" />
                  ) : (
                    <Pause className="w-3 h-3 fill-current" aria-hidden="true" />
                  )}
                </span>
                <span
                  className={`text-xs font-mono tabular-nums ${
                    isCurrentQuestionOvertime
                      ? highContrast
                        ? 'text-black font-bold underline'
                        : 'text-[#B91C1C] font-semibold'
                      : highContrast
                        ? 'text-black font-semibold'
                        : 'text-[#48484A]'
                  }`}
                >
                  {isCurrentQuestionOvertime
                    ? `0s (+${formatDurationCompact(currentOvertimeSeconds)} over)`
                    : formatDurationCompact(currentRemainingSeconds)}{' '}
                  / {formatDurationCompact(currentQuestionTargetSeconds)}
                </span>
              </div>

              <textarea
                ref={textareaRef}
                id={`answer-q-${currentIndex}`}
                value={currentAnswer}
                onFocus={() => {
                  isTypingFocusedRef.current = true;
                  setIsTypingFocused(true);
                  syncTimerState();
                }}
                onBlur={() => {
                  isTypingFocusedRef.current = false;
                  setIsTypingFocused(false);
                  syncTimerState();
                }}
                onChange={(event) => {
                  const answerValue = event.target.value;
                  setAnswers((prev) => ({
                    ...prev,
                    [currentIndex]: answerValue,
                  }));
                }}
                aria-label={`Answer for Question ${currentQuestion.questionNumber || currentIndex + 1}`}
                placeholder="Type your answer..."
                rows={7}
                className={`w-full rounded-2xl p-5 text-base leading-relaxed outline-none resize-y transition-all ${
                  highContrast
                    ? 'bg-white border-2 border-black text-black placeholder:text-neutral-700 focus:ring-2 focus:ring-[#005BB5]'
                    : 'bg-[#F2F4F8] border border-black/12 text-[#1D1D1F] placeholder:text-[#636366] focus:border-[#005BB5] focus:ring-2 focus:ring-[#005BB5]/20 focus:bg-white'
                }`}
              />
            </div>

            <div
              className={`flex flex-wrap items-center justify-between gap-4 pb-6 mb-6 border-b rounded-2xl transition-all ${
                confidenceNudgedIndex === currentIndex
                  ? highContrast
                    ? 'border-2 border-black p-3 bg-neutral-100'
                    : 'border border-[#F59E0B]/60 bg-[#FEF3C7]/50 p-3'
                  : highContrast
                    ? 'border-black'
                    : 'border-black/10'
              }`}
            >
              <div>
                <span
                  className={`text-xs sm:text-sm font-semibold tracking-tight block ${
                    highContrast ? 'text-black' : 'text-[#1D1D1F]'
                  }`}
                >
                  Confidence Rating
                </span>
                {confidenceNudgedIndex === currentIndex ? (
                  <span
                    role="status"
                    className={`text-xs font-semibold ${
                      highContrast ? 'text-black underline' : 'text-[#92400E]'
                    }`}
                  >
                    Quick reminder: pick 1–5 to log your confidence (or press Next again to skip)
                  </span>
                ) : currentAnswer.trim().length > 0 && currentConfidence === null ? (
                  <span
                    className={`text-xs font-medium ${
                      highContrast ? 'text-black' : 'text-[#B45309]'
                    }`}
                  >
                    Remember to rate your confidence (1–5)
                  </span>
                ) : (
                  <span className={`text-xs ${highContrast ? 'text-black' : 'text-[#48484A]'}`}>
                    1 (Unsure) to 5 (Confident)
                  </span>
                )}
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
                      onClick={() => {
                        setConfidenceNudgedIndex(null);
                        setConfidenceRatings((prev) => ({
                          ...prev,
                          [currentIndex]: rating,
                        }));
                      }}
                      className={`w-9 h-9 rounded-xl text-xs font-bold font-mono tabular-nums border transition-all cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#005BB5] ${
                        selected
                          ? highContrast
                            ? 'bg-black text-white border-2 border-black'
                            : 'bg-[#005BB5] text-white border-[#005BB5] shadow-xs'
                          : highContrast
                            ? 'bg-white text-black border-2 border-black hover:bg-neutral-200'
                            : 'bg-[#F2F4F8] text-[#1D1D1F] border-black/12 hover:bg-black/[0.08]'
                      }`}
                    >
                      {rating}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <FluidButton
                  variant="secondary"
                  size="md"
                  highContrast={highContrast}
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
                  highContrast={highContrast}
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
                highContrast={highContrast}
                aria-label="End paper and review marks"
                onClick={handleOpenConfirmFinish}
              >
                End paper
              </FluidButton>
            </div>
          </>
        ) : (
          <div className="space-y-6">
            <div>
              <h2
                className={`text-xl font-bold tracking-tight ${
                  highContrast ? 'text-black' : 'text-[#1D1D1F]'
                }`}
              >
                Keyword Rubric &amp; Self-Mark Review
              </h2>
              <p
                className={`text-xs sm:text-sm mt-1 ${
                  highContrast ? 'text-black font-medium' : 'text-[#48484A]'
                }`}
              >
                Review auto-suggested marks against rubric keywords and adjust before generating your Weakness Ranking report.
              </p>
            </div>

            <div
              className={`divide-y border-t border-b ${
                highContrast
                  ? 'divide-black border-black'
                  : 'divide-black/10 border-black/10'
              }`}
            >
              {questions.map((question, questionIndex) => {
                const maxMarks = Math.max(1, question.marks || 2);
                const currentAwarded = reviewMarks[questionIndex] ?? 0;
                const timeSpentSeconds = Math.max(0, Math.round(timeMapRef.current[questionIndex] ?? 0));
                const recommendedSeconds = maxMarks * 60;
                const cleanAnswer = sanitizeAnswerText(answers[questionIndex] ?? '').trim();
                const matchedKeywords = rubricMatches[questionIndex]?.matched || [];
                const missedKeywords = rubricMatches[questionIndex]?.missed || [];

                return (
                  <div key={questionIndex} className="py-5 space-y-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p
                        className={`text-sm sm:text-base font-bold ${
                          highContrast ? 'text-black' : 'text-[#1D1D1F]'
                        }`}
                      >
                        {question.questionNumber ? `Q${question.questionNumber}` : `Q${questionIndex + 1}`}:{' '}
                        {question.prompt}
                      </p>
                      <span
                        className={`text-xs font-mono tabular-nums font-semibold shrink-0 ${
                          highContrast ? 'text-black' : 'text-[#48484A]'
                        }`}
                      >
                        {question.topicCategory} · Time: {formatDurationCompact(timeSpentSeconds)} / Target{' '}
                        {formatDurationCompact(recommendedSeconds)}
                      </span>
                    </div>

                    <p
                      className={`text-xs sm:text-sm rounded-xl px-4 py-2.5 whitespace-pre-wrap ${
                        highContrast
                          ? 'bg-white border-2 border-black text-black'
                          : 'bg-[#F2F4F8] border border-black/10 text-[#1D1D1F]'
                      }`}
                    >
                      {cleanAnswer || 'No response entered.'}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                      <div className="text-xs space-y-0.5">
                        {matchedKeywords.length > 0 && (
                          <p
                            className={`font-semibold ${
                              highContrast ? 'text-black' : 'text-[#15803D]'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" aria-hidden="true" />
                            Matched concepts: {matchedKeywords.join(', ')}
                          </p>
                        )}
                        {missedKeywords.length > 0 && (
                          <p className={highContrast ? 'text-black' : 'text-[#48484A]'}>
                            Suggested rubric terms not detected: {missedKeywords.slice(0, 4).join(', ')}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-xs font-semibold ${
                            highContrast ? 'text-black' : 'text-[#1D1D1F]'
                          }`}
                        >
                          Marks Awarded:
                        </span>
                        <button
                          type="button"
                          aria-label={`Decrease marks for question ${questionIndex + 1}`}
                          disabled={currentAwarded <= 0}
                          onClick={() =>
                            setReviewMarks((prev) => ({
                              ...prev,
                              [questionIndex]: Math.max(0, (prev[questionIndex] ?? 0) - 1),
                            }))
                          }
                          className={`p-1.5 rounded-lg disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#005BB5] ${
                            highContrast
                              ? 'bg-white border-2 border-black text-black hover:bg-neutral-200'
                              : 'bg-white border border-black/20 text-[#1D1D1F] hover:bg-neutral-100'
                          }`}
                        >
                          <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <span
                          className={`text-sm font-bold font-mono tabular-nums min-w-[44px] text-center ${
                            highContrast ? 'text-black' : 'text-[#1D1D1F]'
                          }`}
                        >
                          {currentAwarded}/{maxMarks}
                        </span>
                        <button
                          type="button"
                          aria-label={`Increase marks for question ${questionIndex + 1}`}
                          disabled={currentAwarded >= maxMarks}
                          onClick={() =>
                            setReviewMarks((prev) => ({
                              ...prev,
                              [questionIndex]: Math.min(maxMarks, (prev[questionIndex] ?? 0) + 1),
                            }))
                          }
                          className={`p-1.5 rounded-lg disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#005BB5] ${
                            highContrast
                              ? 'bg-white border-2 border-black text-black hover:bg-neutral-200'
                              : 'bg-white border border-black/20 text-[#1D1D1F] hover:bg-neutral-100'
                          }`}
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
                highContrast={highContrast}
                onClick={() => setStage('exam')}
              >
                Back to Paper
              </FluidButton>
              <FluidButton
                variant="primary"
                size="md"
                highContrast={highContrast}
                onClick={handleFinalizeReport}
              >
                Generate Performance Report
              </FluidButton>
            </div>
          </div>
        )}
      </motion.div>

      {showConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs px-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-finish-title"
        >
          <div
            className={`w-full max-w-md rounded-2xl p-6 sm:p-8 ${
              highContrast
                ? 'bg-white border-2 border-black text-black shadow-none'
                : 'bg-white border border-black/15 shadow-xl text-[#1D1D1F]'
            }`}
          >
            <h2 id="confirm-finish-title" className="text-lg font-bold tracking-tight mb-2">
              Confirm Finish Paper?
            </h2>
            <p
              className={`text-sm leading-relaxed mb-4 tabular-nums ${
                highContrast ? 'text-black' : 'text-[#48484A]'
              }`}
            >
              You have answered <strong>{answeredCount}</strong> of{' '}
              <strong>{questions.length}</strong> questions using{' '}
              <strong>{formatDurationCompact(displayActiveSeconds)}</strong> of typing time
              {!isPaperOvertime && (
                <> ({formatDurationCompact(totalRemainingSeconds)} remaining)</>
              )}
              .
              {answeredCount < questions.length && (
                <> ({questions.length - answeredCount} unanswered)</>
              )}
            </p>
            {missingConfidenceIndices.length > 0 && (
              <div
                className={`mb-5 rounded-xl px-3.5 py-2.5 text-xs font-medium ${
                  highContrast
                    ? 'bg-white border-2 border-black text-black'
                    : 'bg-[#FEF3C7] border border-[#F59E0B]/40 text-[#92400E]'
                }`}
              >
                Reminder: Confidence rating not set for{' '}
                <strong>
                  {missingConfidenceIndices
                    .map((questionIndex) => `Q${questions[questionIndex]?.questionNumber || questionIndex + 1}`)
                    .join(', ')}
                </strong>
                .
              </div>
            )}
            <div className="flex flex-wrap items-center justify-end gap-3">
              {missingConfidenceIndices.length > 0 && (
                <FluidButton
                  variant="ghost"
                  size="sm"
                  highContrast={highContrast}
                  onClick={() => {
                    const targetQuestionIndex = missingConfidenceIndices[0];
                    setShowConfirmModal(false);
                    setConfidenceNudgedIndex(targetQuestionIndex);
                    switchQuestion(targetQuestionIndex, { bypassNudge: true });
                  }}
                >
                  Rate Missing
                </FluidButton>
              )}
              <FluidButton
                variant="secondary"
                size="sm"
                highContrast={highContrast}
                onClick={() => setShowConfirmModal(false)}
              >
                Continue Paper
              </FluidButton>
              <FluidButton
                variant="primary"
                size="sm"
                highContrast={highContrast}
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
