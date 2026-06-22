---
title: MCP server
description: Let AI agents read, patch, validate, and simulate projects through a local Model Context Protocol bridge.
order: 2
---

Blackbox Editor exposes a **Model Context Protocol** server so compatible agents (Cursor, Codex, Claude Desktop, and other MCP clients) can work on narrative projects with structured tools instead of raw filesystem access.

The server is **disabled by default**, binds only to `127.0.0.1`, and authenticates every request with a persistent bearer token stored through the operating system's secure credential protection.

## Enable the server

1. Open **Settings → Agents** in the editor.
2. Turn on **Enable MCP server**.
3. Copy the generated client configuration (endpoint URL + bearer token).
4. Paste it into your MCP client settings and reconnect.

The editor uses a stable, configurable localhost port so an agent configuration continues to work after restarting the editor. Regenerating the token immediately invalidates the previous credential and records the action in the MCP audit log.

## Connection

Transport: **streamable HTTP** at `http://127.0.0.1:<port>/mcp`. The default port is `47831` and can be changed in **Settings → Agents**.

Example client configuration:

```json
{
  "mcpServers": {
    "blackbox-editor": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:PORT/mcp",
      "headers": { "Authorization": "Bearer TOKEN" }
    }
  }
}
```

The settings panel shows the live URL and token and can copy the full JSON block.

## Design principles

Agents share the editor's **project service** — the same code paths that power saving, linting, bundling, and simulation in the UI.

- **Revision safety** — every mutation requires `expectedRevision` matching the project on disk. Conflicts return an error; agents should `read_project` again and reconcile.
- **Editor dirty guard** — if the user has unsaved changes in the renderer, mutations are rejected with `editor_dirty` until they save or discard.
- **Prefer patches** — `patch_documents` applies targeted ops (one node, choice, or catalog record). Reserve `save_documents` for whole-document rewrites.
- **Audit trail** — every tool call is logged with metadata (tool name, arguments summary, duration, outcome). Open **Audit log** in settings to review recent operations.

## Resources

| URI                   | Content                          |
| --------------------- | -------------------------------- |
| `blackbox://projects` | JSON list of registered projects |

## Tools

### Read-only

| Tool               | Description                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `list_projects`    | List projects registered in the running editor                                                 |
| `read_project`     | Read scenario, chapters, and catalogs. Optional `includeLayout` and `includeMedia`             |
| `get_node`         | Read one node by `chapterId` and `nodeId`. Use `chapterId: "scenario"` for legacy inline nodes |
| `search_project`   | Search string values across the project (max 100 matches)                                      |
| `bundle_project`   | Run the bundler at a revision to surface build errors. Output is discarded                     |
| `lint_project`     | Run Blackbox validation. Supports `ignore` and `only` rule filters                             |
| `simulate_project` | Explore reachability and endings. Modes: `goals` or `explore`; tunable budgets and analytics   |

### Mutations

| Tool              | Description                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `save_documents`  | Atomically save one or more authored JSON documents at `expectedRevision`                                                 |
| `patch_documents` | Apply targeted ops: `set_node`, `remove_node`, `set_choice`, `remove_choice`, `set_record`, `remove_record` (max 500 ops) |
| `upload_media`    | Write a base64-encoded asset into `textures`, `music`, or `sfx` at `expectedRevision`                                     |

`upload_media` accepts a larger request body than other tools (up to 24 MB decoded per asset).

### Patch example

```json
{
  "projectId": "silent_archive",
  "expectedRevision": 42,
  "ops": [
    {
      "op": "set_node",
      "chapterId": "chapter_01",
      "node": { "id": "intro", "type": "scene", "text": "..." }
    },
    {
      "op": "set_record",
      "collection": "flags",
      "id": "met_archivist",
      "value": { "id": "met_archivist", "label": "Met the archivist" }
    }
  ]
}
```

## Simulation options

`simulate_project` accepts:

| Parameter    | Default    | Notes                                                          |
| ------------ | ---------- | -------------------------------------------------------------- |
| `mode`       | `goals`    | `goals` searches for endings; `explore` sweeps reachable state |
| `goals`      | `"ending"` | Goal expression for goals mode                                 |
| `goalBudget` | `50000`    | Search budget                                                  |
| `maxStates`  | `500000`   | State cap                                                      |
| `threads`    | `0`        | Parallelism (`0` = auto)                                       |
| `heuristic`  | `graph`    | `graph` or `none`                                              |
| `check`      | `true`     | Strict exit checking                                           |
| `analytics`  | `false`    | Include analytics payload                                      |

## Security model

- **Localhost only** — the HTTP server listens on `127.0.0.1`, not the LAN.
- **Bearer token** — SHA-256 compared with timing-safe equality; securely persisted and only rotated on explicit user request.
- **No broad filesystem access** — tools operate on registered projects through the editor service.
- **Body limits** — authored JSON requests capped at 2 MB; uploads use a separate 32 MB envelope with a 24 MB per-file cap.
- **Metadata audit** — the audit log records tool names, argument summaries, and timing — not full document bodies.

## Agent workflow

A reliable mutation loop:

1. `list_projects` or `read_project` to get the current `revision`.
2. `patch_documents` or `save_documents` with that `expectedRevision`.
3. On conflict, `read_project` again and merge changes — never force-overwrite.
4. `lint_project` and optionally `simulate_project` to validate the result.

Built-in server instructions echo this: _"Read a project immediately before saving. If a revision conflict occurs, read again and reconcile instead of forcing an overwrite."_

## Requirements

- Blackbox Editor must be **running** with MCP enabled.
- The target project must be **opened or registered** in the editor session.
- For mutations, the user must have **no unsaved editor changes** in the active view.
