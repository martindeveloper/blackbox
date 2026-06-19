#!/usr/bin/env node
import { runMobileCommand } from "./lib/platformCommand.mjs";

runMobileCommand("android").catch((error) => {
  console.error(`[mobile] ${error.message}`);
  process.exit(1);
});
