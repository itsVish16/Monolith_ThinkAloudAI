/**
 * Universal Interview Score Calculator for ThinkAloudAI
 * Ensures 100% score consistency across:
 * - Interview Analysis Page
 * - Candidate Profile Page (Mock Interview History)
 * - Dashboard Overview (Recent Scores & Category Averages)
 * - Admin Panel (Session Audit & Overview)
 */

export interface FeedbackLike {
  technical_score?: number | null;
  communication_score?: number | null;
  english_score?: number | null;
  overall_score?: number | null;
  score?: number | null;
  detailed_metrics?: {
    overall_score?: number | null;
    [key: string]: any;
  } | null;
}

export interface InterviewLike {
  interview_type?: string | null;
  type?: string | null;
  feedback?: FeedbackLike | null;
  evaluation?: FeedbackLike | null;
  score?: number | null;
  overall_score?: number | null;
  detailed_metrics?: any;
}

export function computeUnifiedInterviewScore(
  interviewOrFeedback: InterviewLike | FeedbackLike | null | undefined, 
  explicitType?: string | null
): number | null {
  if (!interviewOrFeedback) return null;

  // 1. Direct explicit overall score check
  const directScore = 
    (interviewOrFeedback as any).overall_score ??
    (interviewOrFeedback as any).score ??
    (interviewOrFeedback as any).feedback?.overall_score ??
    (interviewOrFeedback as any).feedback?.score ??
    (interviewOrFeedback as any).evaluation?.overall_score ??
    (interviewOrFeedback as any).evaluation?.score ??
    (interviewOrFeedback as any).feedback?.detailed_metrics?.overall_score ??
    (interviewOrFeedback as any).evaluation?.detailed_metrics?.overall_score ??
    (interviewOrFeedback as any).detailed_metrics?.overall_score;

  if (typeof directScore === 'number' && !isNaN(directScore) && directScore > 0) {
    const scaled = directScore <= 10 ? directScore * 10 : directScore;
    return Math.min(100, Math.max(0, Math.round(scaled)));
  }

  // 2. Extract constituent component scores
  const fb: FeedbackLike = (interviewOrFeedback as any).feedback || (interviewOrFeedback as any).evaluation || interviewOrFeedback;
  const tech = typeof fb.technical_score === 'number' && !isNaN(fb.technical_score) ? fb.technical_score : null;
  const comm = typeof fb.communication_score === 'number' && !isNaN(fb.communication_score) ? fb.communication_score : null;
  const eng = typeof fb.english_score === 'number' && !isNaN(fb.english_score) ? fb.english_score : null;

  if (tech === null && comm === null && eng === null) {
    if (typeof directScore === 'number' && !isNaN(directScore)) {
      const scaled = directScore <= 10 && directScore > 0 ? directScore * 10 : directScore;
      return Math.min(100, Math.max(0, Math.round(scaled)));
    }
    return null;
  }

  let t = tech ?? 0;
  let c = comm ?? 0;
  let e = eng ?? 0;

  if (t > 0 && t <= 10) t *= 10;
  if (c > 0 && c <= 10) c *= 10;
  if (e > 0 && e <= 10) e *= 10;

  t = Math.min(100, Math.max(0, t));
  c = Math.min(100, Math.max(0, c));
  e = Math.min(100, Math.max(0, e));

  // 3. Domain-weighted score matching Backend/AI_Interviewer exactly
  const trackType = (explicitType || (interviewOrFeedback as any).interview_type || (interviewOrFeedback as any).type || '').toLowerCase();

  let result: number;
  if (trackType.includes('dsa') || trackType.includes('swe') || trackType.includes('coding')) {
    result = 0.60 * t + 0.25 * c + 0.15 * e;
  } else if (trackType.includes('system') || trackType.includes('sd')) {
    result = 0.55 * t + 0.30 * c + 0.15 * e;
  } else if (trackType.includes('behavioral') || trackType.includes('hr')) {
    result = 0.20 * t + 0.70 * c + 0.10 * e;
  } else if (trackType.includes('pm') || trackType.includes('product')) {
    result = 0.55 * t + 0.35 * c + 0.10 * e;
  } else if (trackType.includes('ai') || trackType.includes('ml')) {
    result = 0.60 * t + 0.25 * c + 0.15 * e;
  } else {
    // General fallback weighting
    result = 0.40 * t + 0.40 * c + 0.20 * e;
  }

  return Math.min(100, Math.max(0, Math.round(result)));
}
