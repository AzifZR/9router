#!/usr/bin/env node

// Postinstall: warm-up SQLite deps into ~/.9router/runtime so the first
// `9router` start doesn't need network. Failure here is non-fatal —
// cli.js will retry at runtime if anything is missing.
const { ensureSqliteRuntime } = require("./sqliteRuntime");
const { ensureTrayRuntime } = require("./trayRuntime");

try {
  ensureSqliteRuntime({ silent: false });
    console.log("[portway] runtime SQLite deps ready");
  } catch (e) {
    console.warn(`[portway] runtime warm-up skipped: ${e.message}`);
  }
  
  try {
    ensureTrayRuntime({ silent: false });
  } catch (e) {
    console.warn(`[portway] tray runtime skipped: ${e.message}`);
  }

process.exit(0);
