import { translate } from "./i18n.js";
import { notify } from "./notifyApi.js";
import type { ProjectEvent } from "./projectApi.js";
import { requestContributionReview } from "./contributionReview.js";

let lastBlockedAt = 0;

function contributorName(event: ProjectEvent): string {
  return event.contribution?.contributor.name || translate("notifications.contributorFallback");
}

export function notifyContributionApplied(event: ProjectEvent): void {
  const contribution = event.contribution;
  if (!contribution) return;
  const count = contribution.changeCount ?? contribution.changes?.length ?? 0;
  notify({
    message:
      count > 0
        ? translate("notifications.contributorUpdated", {
            contributor: contributorName(event),
            count,
          })
        : translate("notifications.contributorUpdatedProject", {
            contributor: contributorName(event),
          }),
    type: "info",
    duration: 7200,
    action: contribution.review
      ? {
          label: translate("notifications.viewContributorChanges"),
          onClick: () => requestContributionReview(contribution.review),
        }
      : undefined,
  });
}

export function notifyContributionBlocked(event: ProjectEvent): void {
  const now = Date.now();
  if (now - lastBlockedAt < 3000) return;
  lastBlockedAt = now;
  notify({
    message: translate("notifications.contributorWaiting", {
      contributor: contributorName(event),
    }),
    type: "warning",
    duration: 7200,
  });
}
