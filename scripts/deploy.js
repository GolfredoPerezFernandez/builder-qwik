#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const messageParts = args.filter((arg) => arg !== "--dry-run");
const message = messageParts.join(" ").trim() || "chore: deploy";
const maxPushRetries = 3;
const retryDelayMs = 3000;

const sleep = (ms) => {
  if (dryRun) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

const run = (cmd, cmdArgs, options = {}) => {
  const { capture = false } = options;

  if (dryRun) {
    console.log(`[dry-run] ${cmd} ${cmdArgs.join(" ")}`);
    return "";
  }

  if (capture) {
    return execFileSync(cmd, cmdArgs, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  }

  execFileSync(cmd, cmdArgs, { stdio: "inherit" });
  return "";
};

const hasChanges = () => {
  const status = run("git", ["status", "--porcelain"], { capture: true });
  return status.trim().length > 0;
};

const pushWithRetry = () => {
  let lastError;

  for (let attempt = 1; attempt <= maxPushRetries; attempt++) {
    try {
      console.log(`Push attempt ${attempt}/${maxPushRetries}...`);
      run("git", ["push", "origin"]);
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= maxPushRetries) break;

      console.warn(`Push fall\u00f3. Reintentando en ${retryDelayMs / 1000}s...`);
      sleep(retryDelayMs);
    }
  }

  throw lastError;
};

try {
  run("git", ["add", "."]);

  if (hasChanges()) {
    run("git", ["commit", "-m", message]);
  } else {
    console.log("No hay cambios para commit. Continuando con push...");
  }

  pushWithRetry();
  console.log("Deploy git flow completado.");
} catch (error) {
  console.error("Fallo en deploy git flow:", error?.message || error);
  process.exit(1);
}
