import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { agentDebug } from "../lib/agent-debug";

export type BrowserLogEntry = { type: string; message: string; timestamp: number };

const browserLogs: BrowserLogEntry[] = [];

export function recordBrowserLog(type: string, message: string) {
  browserLogs.push({ type, message, timestamp: Date.now() });
  if (browserLogs.length > 50) browserLogs.shift();
}

export const getBrowserLogsTool = tool(
  async ({ limit }: { limit?: number }) => {
    const n = limit ?? 10;
    agentDebug("TOOL", "get_browser_logs", { limit: n, buffered: browserLogs.length });
    return (
      browserLogs
        .slice(-n)
        .map((l) => `[${l.type}] ${l.message}`)
        .join("\n") || "No logs."
    );
  },
  {
    name: "get_browser_logs",
    description: "Retrieve recent console/runtime logs reported from the browser preview.",
    schema: z.object({
      limit: z.number().optional().describe("Max number of recent log lines to return."),
    }),
  },
);
