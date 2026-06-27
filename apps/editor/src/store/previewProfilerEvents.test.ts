import assert from "node:assert/strict";
import { test } from "node:test";

import {
  afterProfilerClear,
  newestProfilerEvents,
  profilerEventKey,
  type OrderedPreviewProfilerEvent,
} from "./previewProfilerEvents.ts";

function event(id: number, at: number): OrderedPreviewProfilerEvent & { name: string } {
  return { id, at, name: `event.${id}` };
}

test("profiler events are sorted newest first", () => {
  assert.deepEqual(
    newestProfilerEvents([event(1, 100), event(2, 300), event(3, 200)]).map((item) => item.id),
    [2, 3, 1],
  );
});

test("profiler events with matching timestamps are sorted by newest id first", () => {
  assert.deepEqual(
    newestProfilerEvents([event(1, 100), event(3, 100), event(2, 100)]).map((item) => item.id),
    [3, 2, 1],
  );
});

test("profiler history older than the last clear is discarded", () => {
  assert.deepEqual(
    afterProfilerClear([event(1, 100), event(2, 200), event(3, 300)], 200).map((item) => item.id),
    [3],
  );
});

test("profiler event keys survive iframe profiler id resets", () => {
  assert.notEqual(profilerEventKey(event(1, 100), 0), profilerEventKey(event(1, 200), 0));
});

test("profiler event keys are unique even when events share timestamp and id", () => {
  assert.notEqual(profilerEventKey(event(1, 100), 0), profilerEventKey(event(1, 100), 1));
});
