export interface ProfilerEvent {
  id: number;
  at: number;
  name: string;
  detail?: string;
  data?: Record<string, unknown>;
}

type ProfilerSink = (event: ProfilerEvent) => void;

let sink: ProfilerSink | null = null;
let nextId = 0;

export const Profiler = {
  event(name: string, detail?: string, data?: Record<string, unknown>): void {
    sink?.({
      id: ++nextId,
      at: Date.now(),
      name,
      detail,
      data,
    });
  },
};

export function setProfilerSink(next: ProfilerSink | null): void {
  sink = next;
}
