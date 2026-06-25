import type { AuthorDiff } from "./authorDiff.js";

export const AUTHOR_CHANGE_REVIEW_EVENT = "blackbox:review-author-changes";

export interface AuthorChangeReviewPayload {
  diff: AuthorDiff;
  projectId?: string;
}

export function requestAuthorChangeReview(payload: AuthorChangeReviewPayload): void {
  window.dispatchEvent(
    new CustomEvent<AuthorChangeReviewPayload>(AUTHOR_CHANGE_REVIEW_EVENT, {
      detail: payload,
    }),
  );
}
