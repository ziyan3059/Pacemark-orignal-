export interface QuestionResponseLog {
  questionIndex: number;
  questionNumber?: string;
  prompt: string;
  topicCategory: string;
  answerText: string;
  marksAwarded: number;
  totalMarks: number;
  timeSpentSeconds: number;
  recommendedTimeSeconds: number;
  confidence: number;
  matchedKeywords?: string[];
  missedKeywords?: string[];
}

export interface TopicWeaknessSummary {
  topic: string;
  weaknessIndex: number;
  scorePercent: number;
  timeRatioPercent: number;
  avgTimeSeconds: number;
  avgRecommendedSeconds: number;
  marksAwarded: number;
  totalMarks: number;
  questionCount: number;
  status: 'Priority Revision' | 'Needs Pacing' | 'Strong';
  action: string;
}

export interface PasswordValidationResult {
  valid: boolean;
  minLength: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
  message: string;
}

export function validateStudentPassword(password: string): PasswordValidationResult {
  const minLength = password.length >= 8;
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9\s]/.test(password);
  const valid = minLength && hasNumber && hasSpecial;

  const missing: string[] = [];
  if (!minLength) missing.push('at least 8 characters');
  if (!hasNumber) missing.push('1 number');
  if (!hasSpecial) missing.push('1 special character');

  return {
    valid,
    minLength,
    hasNumber,
    hasSpecial,
    message: valid ? 'Password meets complexity requirements.' : `Password needs ${missing.join(', ')}.`,
  };
}

export function sanitizeAnswerText(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/[<>]/g, '')
    .slice(0, 2500);
}

export function evaluateKeywordRubric(
  answerText: string,
  totalMarks: number,
  keywords: string[],
): {
  marksAwarded: number;
  matchedKeywords: string[];
  missedKeywords: string[];
} {
  const cleanAnswer = sanitizeAnswerText(answerText).trim().toLowerCase();
  const safeTotal = Math.max(1, totalMarks);

  if (!cleanAnswer) {
    return {
      marksAwarded: 0,
      matchedKeywords: [],
      missedKeywords: keywords,
    };
  }

  if (!keywords || keywords.length === 0) {
    // Length-based heuristic when an uploaded PDF has no extracted keyword list
    const wordCount = cleanAnswer.split(/\s+/).filter(Boolean).length;
    const ratio = Math.min(1, wordCount / Math.max(8, safeTotal * 7));
    return {
      marksAwarded: Math.min(safeTotal, Math.max(ratio > 0.25 ? 1 : 0, Math.round(ratio * safeTotal))),
      matchedKeywords: [],
      missedKeywords: [],
    };
  }

  const matched: string[] = [];
  const missed: string[] = [];

  for (const kw of keywords) {
    const normalizedKw = kw.trim().toLowerCase();
    if (!normalizedKw) continue;
    // Allow partial root match for multi-letter technical terms
    const root = normalizedKw.length >= 6 ? normalizedKw.slice(0, normalizedKw.length - 1) : normalizedKw;
    if (cleanAnswer.includes(normalizedKw) || (root.length >= 5 && cleanAnswer.includes(root))) {
      matched.push(kw);
    } else {
      missed.push(kw);
    }
  }

  const keywordRatio = matched.length / Math.max(1, Math.min(keywords.length, safeTotal + 1));
  const wordCount = cleanAnswer.split(/\s+/).filter(Boolean).length;
  const substanceBoost = wordCount >= safeTotal * 5 ? 0.15 : 0;
  const combinedRatio = Math.min(1, keywordRatio * 0.85 + substanceBoost);
  let marksAwarded = Math.round(combinedRatio * safeTotal);
  if (matched.length > 0 && marksAwarded === 0) {
    marksAwarded = 1;
  }
  marksAwarded = Math.max(0, Math.min(safeTotal, marksAwarded));

  return {
    marksAwarded,
    matchedKeywords: matched,
    missedKeywords: missed,
  };
}

/**
 * Criterion 3 Algorithm 2: Priority Weakness Ranking
 * weaknessIndex = (timeRatio * 0.6) + ((1.0 - scoreRatio) * 0.4)
 * Aggregates averages per topic and sorts descending via Insertion Sort.
 */
export function calculateTopicWeakness(
  responses: QuestionResponseLog[],
): TopicWeaknessSummary[] {
  const groups = new Map<
    string,
    {
      weaknessValues: number[];
      marksAwarded: number;
      totalMarks: number;
      timeSpentSeconds: number;
      recommendedSeconds: number;
      missedTerms: string[];
    }
  >();

  for (const r of responses) {
    const topic = r.topicCategory || 'General Specification';
    const recSec = Math.max(15, r.recommendedTimeSeconds || r.totalMarks * 60 || 60);
    const totalM = Math.max(1, r.totalMarks || 1);
    const timeRatio = Math.max(0, r.timeSpentSeconds) / recSec;
    const scoreRatio = Math.max(0, Math.min(totalM, r.marksAwarded)) / totalM;

    const weaknessIndex = timeRatio * 0.6 + (1.0 - scoreRatio) * 0.4;

    let bucket = groups.get(topic);
    if (!bucket) {
      bucket = {
        weaknessValues: [],
        marksAwarded: 0,
        totalMarks: 0,
        timeSpentSeconds: 0,
        recommendedSeconds: 0,
        missedTerms: [],
      };
      groups.set(topic, bucket);
    }

    bucket.weaknessValues.push(weaknessIndex);
    bucket.marksAwarded += Math.max(0, Math.min(totalM, r.marksAwarded));
    bucket.totalMarks += totalM;
    bucket.timeSpentSeconds += Math.max(0, r.timeSpentSeconds);
    bucket.recommendedSeconds += recSec;
    if (r.missedKeywords) {
      for (const term of r.missedKeywords) {
        if (!bucket.missedTerms.includes(term)) {
          bucket.missedTerms.push(term);
        }
      }
    }
  }

  const summaries: TopicWeaknessSummary[] = [];

  for (const [topic, bucket] of groups.entries()) {
    const count = bucket.weaknessValues.length;
    const avgWeakness =
      bucket.weaknessValues.reduce((acc, v) => acc + v, 0) / Math.max(1, count);
    const scorePercent = Math.round(
      (bucket.marksAwarded / Math.max(1, bucket.totalMarks)) * 100,
    );
    const timeRatioPercent = Math.round(
      (bucket.timeSpentSeconds / Math.max(1, bucket.recommendedSeconds)) * 100,
    );

    let status: TopicWeaknessSummary['status'] = 'Strong';
    if (avgWeakness >= 0.78 || scorePercent < 55 || timeRatioPercent > 135) {
      status = 'Priority Revision';
    } else if (avgWeakness >= 0.48 || scorePercent < 78 || timeRatioPercent > 105) {
      status = 'Needs Pacing';
    }

    const focusHint =
      bucket.missedTerms.length > 0
        ? `Key terms to review: ${bucket.missedTerms.slice(0, 3).join(', ')}.`
        : '';

    const action =
      status === 'Priority Revision'
        ? `High time/mark loss (${scorePercent}% marks, ${timeRatioPercent}% target time). Revisit core ${topic} concepts and drill timed short answers. ${focusHint}`.trim()
        : status === 'Needs Pacing'
          ? `Moderate pacing gap (${timeRatioPercent}% of target time). Practice structuring bullet points faster for ${topic}. ${focusHint}`.trim()
          : `Strong accuracy (${scorePercent}%) within target pacing (${timeRatioPercent}% time). Keep testing mixed exam questions.`;

    summaries.push({
      topic,
      weaknessIndex: Number(avgWeakness.toFixed(2)),
      scorePercent,
      timeRatioPercent,
      avgTimeSeconds: Math.round(bucket.timeSpentSeconds / Math.max(1, count)),
      avgRecommendedSeconds: Math.round(bucket.recommendedSeconds / Math.max(1, count)),
      marksAwarded: bucket.marksAwarded,
      totalMarks: bucket.totalMarks,
      questionCount: count,
      status,
      action,
    });
  }

  // Insertion Sort descending by weaknessIndex (per Criterion 3 Algorithm 2)
  for (let i = 1; i < summaries.length; i++) {
    const key = summaries[i];
    let j = i - 1;
    while (j >= 0 && summaries[j].weaknessIndex < key.weaknessIndex) {
      summaries[j + 1] = summaries[j];
      j--;
    }
    summaries[j + 1] = key;
  }

  return summaries;
}

export function formatDurationCompact(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${rem}s`;
  return `${m}m ${rem}s`;
}
