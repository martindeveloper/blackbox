---
title: Overview
description: A short guide to BlackboxEditor documentation — CLI builds and the local MCP server.
order: 0
---

This is the reference for working with Blackbox outside the editor window: scripted builds in CI and structured agent access while the editor is running.

## Guides

| Topic                          | Summary                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| [CLI](/docs/cli)               | `prepare`, `lint`, `build`, `bundle`, and `package` from the terminal                             |
| [MCP](/docs/mcp)               | Schema reference, read/patch/chapter tools, lint, simulate, and bundle through a local MCP server |
| [Grammar](/docs/grammar)       | JSON document layout, nodes, choices, gates, and effects                                          |
| [Engine API](/docs/engine-api) | The stable `@engine/sdk/v1` surface for game UI: component slots, hooks, save state, and types    |

Both interfaces use the same project files and toolchain as the desktop app — no shadow copies or separate APIs.

## Elsewhere

- [Editor overview](/editor) — authoring workspace, preview, and validation
- [Download](/download) — packaged desktop builds with `--cli` support
