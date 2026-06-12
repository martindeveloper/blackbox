import { inject, track } from "@vercel/analytics";
import { Analytics, type AnalyticsProperties } from "./analytics.js";
import { logger } from "./logger.js";

export class VercelAnalytics extends Analytics {
  protected initialize(): void {
    try {
      inject({
        framework: "react",
        beforeSend: (event) => (this.canSend() ? event : null),
      });
    } catch (error) {
      logger.warn("analytics", "Failed to initialize Vercel Analytics", error);
    }
  }

  protected send(event: string, properties?: AnalyticsProperties): void {
    try {
      track(event, properties);
    } catch (error) {
      logger.warn("analytics", `Failed to track '${event}'`, error);
    }
  }
}

export const analytics = new VercelAnalytics();
