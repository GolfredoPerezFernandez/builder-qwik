import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { agentDebug } from "../lib/agent-debug";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const execAsync = promisify(exec);

export const runLint = tool(
  async () => {
    agentDebug("TOOL", "run_lint start");
    try {
      await execAsync("yarn lint:manual");
      agentDebug("TOOL", "run_lint ok");
      return "lint passed";
    } catch (e: any) {
      agentDebug("TOOL", "run_lint failed", { err: String(e.stdout || e.message).slice(0, 300) });
      return `lint failed: ${e.stdout || e.message}`;
    }
  },
  { name: "run_lint", description: "Run lint checks.", schema: z.object({}) }
);

export const runTypecheck = tool(
  async () => {
    agentDebug("TOOL", "run_typecheck start");
    try {
      await execAsync("npx tsc --noEmit");
      agentDebug("TOOL", "run_typecheck ok");
      return "typecheck passed";
    } catch (e: any) {
      agentDebug("TOOL", "run_typecheck failed", {
        err: String(e.stdout || e.message).slice(0, 300),
      });
      return `typecheck failed: ${e.stdout || e.message}`;
    }
  },
  { name: "run_typecheck", description: "Run TypeScript checker.", schema: z.object({}) }
);

export const runBuild = tool(
  async () => {
    agentDebug("TOOL", "run_build start");
    try {
      await execAsync("yarn build");
      agentDebug("TOOL", "run_build ok");
      return "build passed";
    } catch (e: any) {
      agentDebug("TOOL", "run_build failed", { err: String(e.stdout || e.message).slice(0, 300) });
      return `build failed: ${e.stdout || e.message}`;
    }
  },
  { name: "run_build", description: "Run production build.", schema: z.object({}) }
);

export const takeScreenshot = tool(
  async ({ url, filename }: { url: string; filename: string }) => {
    agentDebug("TOOL", "take_screenshot", { url: url.slice(0, 120), filename });
    const puppeteer = await import("puppeteer");
    const screenshotDir = path.join(process.cwd(), "public", "screenshots");
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
    const outPath = path.join(screenshotDir, filename) as `${string}.png`;
    const browser = await puppeteer.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.screenshot({ path: outPath, type: "png" });
    } finally {
      await browser.close();
    }
    return `Screenshot saved: /screenshots/${filename}`;
  },
  {
    name: "take_screenshot",
    description:
      "Capture a PNG screenshot of a URL (e.g. local dev preview). Saves under public/screenshots/.",
    schema: z.object({
      url: z.string().describe("Full URL including protocol, e.g. http://localhost:5173/"),
      filename: z
        .string()
        .regex(/\.png$/i)
        .describe("PNG filename only, must end with .png (e.g. home.png)"),
    }),
  },
);
