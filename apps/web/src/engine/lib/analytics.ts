export type AnalyticsProperty = string | number | boolean | null | undefined;
export type AnalyticsProperties = Record<string, AnalyticsProperty>;

export abstract class Analytics {
  private enabled = false;
  private initialized = false;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled && !this.initialized) {
      this.initialized = true;
      this.initialize();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  track(event: string, properties?: AnalyticsProperties): void {
    if (!this.enabled) return;
    this.send(event, properties);
  }

  protected canSend = (): boolean => this.enabled;

  protected abstract initialize(): void;
  protected abstract send(event: string, properties?: AnalyticsProperties): void;
}
