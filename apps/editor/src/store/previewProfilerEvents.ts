export interface OrderedPreviewProfilerEvent {
  id: number;
  at: number;
}

const PREVIEW_PROFILER_HISTORY_LIMIT = 200;

export function newestProfilerEvents<T extends OrderedPreviewProfilerEvent>(events: T[]): T[] {
  return [...events]
    .sort((a, b) => b.at - a.at || b.id - a.id)
    .slice(0, PREVIEW_PROFILER_HISTORY_LIMIT);
}

export function afterProfilerClear<T extends OrderedPreviewProfilerEvent>(
  events: T[],
  profilerClearedAt: number,
): T[] {
  if (profilerClearedAt <= 0) return events;
  return events.filter((event) => event.at > profilerClearedAt);
}

export function profilerEventKey(event: OrderedPreviewProfilerEvent, occurrence: number): string {
  return `${event.at}:${event.id}:${occurrence}`;
}
