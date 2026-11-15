export function validateStudentPassword(password) {
  const minLength = password.length >= 8;
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9\s]/.test(password);
  const valid = minLength && hasNumber && hasSpecial;

  const missingRequirements = [];
  if (!minLength) missingRequirements.push('at least 8 characters');
  if (!hasNumber) missingRequirements.push('1 number');
  if (!hasSpecial) missingRequirements.push('1 special character');

  return {
    valid,
    minLength,
    hasNumber,
    hasSpecial,
    message: valid
      ? 'Password meets complexity requirements.'
      : `Password needs ${missingRequirements.join(', ')}.`,
  };
}

export function sanitizeAnswerText(inputText) {
  return String(inputText || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/[<>]/g, '')
    .slice(0, 2500);
}

export function evaluateKeywordRubric(answerText, totalMarks, rubricKeywords) {
  const cleanAnswer = sanitizeAnswerText(answerText).trim().toLowerCase();
  const safeTotalMarks = Math.max(1, totalMarks);

  if (!cleanAnswer) {
    return {
      marksAwarded: 0,
      matchedKeywords: [],
      missedKeywords: rubricKeywords,
    };
  }

  if (!rubricKeywords || rubricKeywords.length === 0) {
    // Estimate suggested marks from word substance when an uploaded PDF provides no rubric list
    const wordCount = cleanAnswer.split(/\s+/).filter(Boolean).length;
    const coverageRatio = Math.min(1, wordCount / Math.max(8, safeTotalMarks * 7));
    return {
      marksAwarded: Math.min(
        safeTotalMarks,
        Math.max(coverageRatio > 0.25 ? 1 : 0, Math.round(coverageRatio * safeTotalMarks)),
      ),
      matchedKeywords: [],
      missedKeywords: [],
    };
  }

  const matchedKeywords = [];
  const missedKeywords = [];

  for (const keyword of rubricKeywords) {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) continue;
    // Match singular/plural word stems so minor suffix differences still earn credit
    const stemRoot =
      normalizedKeyword.length >= 6
        ? normalizedKeyword.slice(0, normalizedKeyword.length - 1)
        : normalizedKeyword;
    if (
      cleanAnswer.includes(normalizedKeyword) ||
      (stemRoot.length >= 5 && cleanAnswer.includes(stemRoot))
    ) {
      matchedKeywords.push(keyword);
    } else {
      missedKeywords.push(keyword);
    }
  }

  const keywordRatio =
    matchedKeywords.length / Math.max(1, Math.min(rubricKeywords.length, safeTotalMarks + 1));
  const wordCount = cleanAnswer.split(/\s+/).filter(Boolean).length;
  const substanceBoost = wordCount >= safeTotalMarks * 5 ? 0.15 : 0;
  const combinedRatio = Math.min(1, keywordRatio * 0.85 + substanceBoost);
  let marksAwarded = Math.round(combinedRatio * safeTotalMarks);
  if (matchedKeywords.length > 0 && marksAwarded === 0) {
    marksAwarded = 1;
  }
  marksAwarded = Math.max(0, Math.min(safeTotalMarks, marksAwarded));

  return {
    marksAwarded,
    matchedKeywords,
    missedKeywords,
  };
}

/**
 * Ranks topics from weakest to strongest using 60% time spent vs target and 40% lost marks,
 * then sorts the list highest weakness first.
 */
export function calculateTopicWeakness(questionResponses) {
  const topicBuckets = new Map();

  for (const responseEntry of questionResponses) {
    const topic = responseEntry.topicCategory || 'General Specification';
    const recommendedSeconds = Math.max(
      15,
      responseEntry.recommendedTimeSeconds || responseEntry.totalMarks * 60 || 60,
    );
    const totalMarks = Math.max(1, responseEntry.totalMarks || 1);
    const timeRatio = Math.max(0, responseEntry.timeSpentSeconds) / recommendedSeconds;
    const scoreRatio = Math.max(0, Math.min(totalMarks, responseEntry.marksAwarded)) / totalMarks;

    const weaknessIndex = timeRatio * 0.6 + (1.0 - scoreRatio) * 0.4;

    let bucket = topicBuckets.get(topic);
    if (!bucket) {
      bucket = {
        weaknessValues: [],
        marksAwarded: 0,
        totalMarks: 0,
        timeSpentSeconds: 0,
        recommendedSeconds: 0,
        missedTerms: [],
      };
      topicBuckets.set(topic, bucket);
    }

    bucket.weaknessValues.push(weaknessIndex);
    bucket.marksAwarded += Math.max(0, Math.min(totalMarks, responseEntry.marksAwarded));
    bucket.totalMarks += totalMarks;
    bucket.timeSpentSeconds += Math.max(0, responseEntry.timeSpentSeconds);
    bucket.recommendedSeconds += recommendedSeconds;
    if (responseEntry.missedKeywords) {
      for (const missedTerm of responseEntry.missedKeywords) {
        if (!bucket.missedTerms.includes(missedTerm)) {
          bucket.missedTerms.push(missedTerm);
        }
      }
    }
  }

  const summaries = [];

  for (const [topic, bucket] of topicBuckets.entries()) {
    const questionCount = bucket.weaknessValues.length;
    const avgWeakness =
      bucket.weaknessValues.reduce((accumulator, value) => accumulator + value, 0) /
      Math.max(1, questionCount);
    const scorePercent = Math.round(
      (bucket.marksAwarded / Math.max(1, bucket.totalMarks)) * 100,
    );
    const timeRatioPercent = Math.round(
      (bucket.timeSpentSeconds / Math.max(1, bucket.recommendedSeconds)) * 100,
    );

    let status = 'Strong';
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
      avgTimeSeconds: Math.round(bucket.timeSpentSeconds / Math.max(1, questionCount)),
      avgRecommendedSeconds: Math.round(bucket.recommendedSeconds / Math.max(1, questionCount)),
      marksAwarded: bucket.marksAwarded,
      totalMarks: bucket.totalMarks,
      questionCount,
      status,
      action,
    });
  }

  for (let currentIndex = 1; currentIndex < summaries.length; currentIndex++) {
    const candidate = summaries[currentIndex];
    let scanIndex = currentIndex - 1;
    while (scanIndex >= 0 && summaries[scanIndex].weaknessIndex < candidate.weaknessIndex) {
      summaries[scanIndex + 1] = summaries[scanIndex];
      scanIndex--;
    }
    summaries[scanIndex + 1] = candidate;
  }

  return summaries;
}

export function formatDurationCompact(totalSeconds) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  if (minutes === 0) return `${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
}
