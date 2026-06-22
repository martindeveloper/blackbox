import type { ProjectContributionReview } from "./projectApi.js";

export const CONTRIBUTION_REVIEW_EVENT = "blackbox:review-contribution";

export function requestContributionReview(review: ProjectContributionReview): void {
  window.dispatchEvent(
    new CustomEvent<ProjectContributionReview>(CONTRIBUTION_REVIEW_EVENT, {
      detail: review,
    }),
  );
}
