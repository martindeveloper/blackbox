import { Analytics, type AnalyticsProperties } from "./analytics.js";

class NoopAnalytics extends Analytics {
  protected initialize(): void {}
  protected send(_event: string, _properties?: AnalyticsProperties): void {}
}

export const analytics = new NoopAnalytics();
