# Blackbox — agent guide

## Project

Blackbox is an open-source engine and desktop editor for branching narrative games (RPGs, choice-driven stories). Authors build chapters as node graphs with choices, characters, inventory, stats, skill checks, and media. Content lives in portable JSON; the Rust engine runs pure game logic and returns read-only views; hosts (web, CLI, iOS, Android, Electron editor) handle rendering, audio, and saves.

Key areas:

| Path | Role |
|------|------|
| `engine/` | Rust core — state, effects, validation, lint, bundler, WASM |
| `apps/editor/` | Electron + React authoring UI |
| `apps/web/` | Browser player |
| `data/` | Sample scenarios and fixtures |
| `FEATURES.md` | Authoring and engine behavior reference |

## Code requirements

1. **Clean and simple.** Prefer the obvious solution. If you cannot explain it in one sentence, simplify it.

2. **Less code is better.** Do not add layers, helpers, or abstractions unless they remove real duplication or clarify a non-obvious boundary. A small, focused diff beats a general framework.

3. **Performance is critical.** Think like John Carmack: hot paths (engine tick, graph traversal, text resolution, serialization) must not waste allocations or CPU cycles. Measure before optimizing, but default to cheap choices — borrow instead of clone, avoid redundant work, keep allocations out of inner loops, prefer stack and views over heap churn.

4. **Minimal scope.** Change only what the task needs. Do not refactor, rename, or “clean up” unrelated code in the same change.

5. **Follow existing conventions.** Read surrounding code first. Match naming, types, error handling, and file layout already in the repo.

6. **Comments sparingly.** Code should mostly speak for itself. Comment only non-obvious business rules or subtle invariants.

7. **Tests when they matter.** Add or update tests for behavior that can regress. Skip tests that only restate the implementation.

8. **Engine vs host.** Keep logic in `engine/`; keep presentation in apps. Do not push rendering or platform concerns into the core.

9. **Content is data.** Scenario JSON and wire types are contracts — change them deliberately, keep docs (`FEATURES.md`, `GRAMMAR.md`) and fixtures in sync.

10. **Verify before finishing.** Run the smallest relevant check: `cargo test` / `cargo clippy` for Rust, project scripts or app tests for TS changes.
