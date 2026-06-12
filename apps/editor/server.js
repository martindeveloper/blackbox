#!/usr/bin/env node

import { startEditorServer } from "./server/app.js";

const server = await startEditorServer();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
