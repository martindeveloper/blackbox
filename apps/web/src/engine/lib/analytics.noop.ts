import { Analytics, type AnalyticsProperties } from "./analytics.js";

/**
 * No-op analytics for builds that must not load a telemetry vendor — notably the
 * editor's local preview. Aliased in as `@analytics` so the Vercel package never
 * enters the bundle. The deployed web player aliases `@analytics` to the real
 * VercelAnalytics instead.
 */
class NoopAnalytics extends Analytics {
  protected initialize(): void {}
  protected send(_event: string, _properties?: AnalyticsProperties): void {}
}

export const analytics = new NoopAnalytics();
