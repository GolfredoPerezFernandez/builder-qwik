import { tool } from "@langchain/core/tools";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { agentDebug } from "../lib/agent-debug";

function resolveSafe(rootDir: string, inputPath: string) {
  const resolved = path.resolve(rootDir, inputPath);
  const normalizedRoot = path.resolve(rootDir);
  if (!resolved.startsWith(normalizedRoot)) {
    throw new Error(`Path escapes rootDir: ${inputPath}`);
  }
  return resolved;
}

const PROTECTED_PATHS = ['agent-chat', 'AGENTS.md', 'src/graph', 'src/prompts', 'src/agents'];

function isProtected(filePath: string) {
  return PROTECTED_PATHS.some(p => filePath.includes(p));
}

export function makeFsTools(rootDir: string) {
  const listFiles = tool(
    async ({ targetPath }: { targetPath: string }) => {
      agentDebug("TOOL", "list_files", { targetPath });
      const absolute = resolveSafe(rootDir, targetPath);
      const entries = await fs.readdir(absolute, { withFileTypes: true });
      return JSON.stringify(
        entries.map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? "dir" : "file",
        })),
        null,
        2,
      );
    },
    {
      name: "list_files",
      description: "List files and directories under a relative path.",
      schema: z.object({
        targetPath: z.string().describe("Relative path from the project root."),
      }),
    },
  );

  const readFile = tool(
    async ({ filePath }: { filePath: string }) => {
      agentDebug("TOOL", "read_file (fs-tools)", { filePath });
      const absolute = resolveSafe(rootDir, filePath);
      return await fs.readFile(absolute, "utf8");
    },
    {
      name: "read_file",
      description: "Read a UTF-8 text file from the repository.",
      schema: z.object({
        filePath: z.string().describe("Relative file path from the project root."),
      }),
    },
  );

  const writeFile = tool(
    async ({ filePath, content }: { filePath: string; content: string }) => {
      agentDebug("TOOL", "write_file (fs-tools)", { filePath, contentLen: content.length });
      if (isProtected(filePath)) {
        return { error: "Permission Denied: Cannot modify agent-related files." };
      }
      const absolute = resolveSafe(rootDir, filePath);
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.writeFile(absolute, content, "utf8");
      return `Wrote ${filePath}`;
    },
    {
      name: "write_file",
      description: "Write a UTF-8 text file in the repository.",
      schema: z.object({
        filePath: z.string(),
        content: z.string(),
      }),
    },
  );

  const editFile = tool(
    async ({ filePath, oldString, newString, replaceAll }: { filePath: string; oldString: string; newString: string; replaceAll?: boolean }) => {
      agentDebug("TOOL", "edit_file (fs-tools)", {
        filePath,
        oldLen: oldString.length,
        newLen: newString.length,
        replaceAll: Boolean(replaceAll),
      });
      if (isProtected(filePath)) {
        return { error: "Permission Denied: Cannot modify agent-related files." };
      }
      const absolute = resolveSafe(rootDir, filePath);
      const current = await fs.readFile(absolute, "utf8");
      if (!current.includes(oldString)) {
        throw new Error(`Old string not found in ${filePath}`);
      }
      const updated = replaceAll
        ? current.split(oldString).join(newString)
        : current.replace(oldString, newString);
      await fs.writeFile(absolute, updated, "utf8");
      return `Edited ${filePath}`;
    },
    {
      name: "edit_file",
      description: "Edit a UTF-8 text file by replacing an exact string.",
      schema: z.object({
        filePath: z.string(),
        oldString: z.string(),
        newString: z.string(),
        replaceAll: z.boolean().optional(),
      }),
    },
  );

  return [listFiles, readFile, writeFile, editFile];
}
