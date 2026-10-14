// Estimated ready time (an estimate, never a guaranteed deadline). Pure; tested in eta.test.ts.
export type EtaInputs = {
  status: string;
  jobs_ahead: number;
  stage_started_at: string;
  queue_minutes: number;
  review_minutes: number;
  generating_minutes: number;
  qa_minutes: number;
  ready_at_override: string | null;
};

export const MIN_REMAINING_MINUTES = 5;
const QUEUED = new Set(["submitted", "revision"]);

/**
 * Queued:     jobsAhead*queue + review + generating + qa
 * In review:  remaining(review) + generating + qa
 * Generating: remaining(generating) + qa
 * QA:         remaining(qa)
 * remaining(x) = max(5, x − minutes since that stage started). Delivered/cancelled → null.
 * An admin whole-job override (ready_at) wins outright.
 */
export function computeEta(i: EtaInputs, now: Date): Date | null {
  if (i.status === "delivered" || i.status === "cancelled") return null;
  if (i.ready_at_override) return new Date(i.ready_at_override);
  const elapsed = Math.max(0, (now.getTime() - new Date(i.stage_started_at).getTime()) / 60000);
  const rem = (m: number) => Math.max(MIN_REMAINING_MINUTES, m - elapsed);
  let minutes: number;
  if (QUEUED.has(i.status)) minutes = Math.max(0, i.jobs_ahead) * i.queue_minutes + i.review_minutes + i.generating_minutes + i.qa_minutes;
  else if (i.status === "in_review" || i.status === "prompt_ready") minutes = rem(i.review_minutes) + i.generating_minutes + i.qa_minutes;
  else if (i.status === "generating") minutes = rem(i.generating_minutes) + i.qa_minutes;
  else if (i.status === "qa") minutes = rem(i.qa_minutes);
  else return null;
  return new Date(now.getTime() + minutes * 60000);
}
