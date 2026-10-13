import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

const runId = process.env.FISHMARK_E2E_RUN_ID ?? `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
if (!/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error("FISHMARK_E2E_RUN_ID must be a single safe path component.");
process.env.FISHMARK_E2E_RUN_ID = runId;
const evidenceRoot = resolve(".artifacts/e2e", runId);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.mjs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: resolve(evidenceRoot, "tests"),
  preserveOutput: "always",
  reporter: [
    ["list"],
    ["json", { outputFile: resolve(evidenceRoot, "playwright-report.json") }],
    ["html", { outputFolder: resolve(evidenceRoot, "html"), open: "never" }]
  ]
});
