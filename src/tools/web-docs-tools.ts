import { tool } from "@langchain/core/tools";
import { fetch } from "undici";
import { z } from "zod";
import { agentDebug } from "../lib/agent-debug";

const MAX_FETCH_CHARS = 80_000;
const FETCH_TIMEOUT_MS = 20_000;

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "0:0:0:0:0:0:0:1" || h === "[::1]") return true;
  if (h === "0.0.0.0") return true;
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false;
  const p = h.split(".").map((x) => Number(x));
  if (p[0] === 10) return true;
  if (p[0] === 127) return true;
  if (p[0] === 0) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  return false;
}

function isAllowedHttpsDocUrl(url: string): { ok: true; u: URL } | { ok: false; reason: string } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "Only https URLs are allowed" };
  if (isBlockedHost(u.hostname)) return { ok: false, reason: "Host not allowed (private/local)" };
  return { ok: true, u };
}

function stripHtmlToText(html: string): string {
  const noScripts = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
  const text = noScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

type DdgTopic =
  | string
  | { Text?: string; FirstURL?: string; Topics?: DdgTopic[] };

function flattenDdgTopics(topics: DdgTopic[] | undefined, out: { title: string; url?: string }[]) {
  if (!topics) return;
  for (const t of topics) {
    if (typeof t === "string") continue;
    if (t.Text && t.FirstURL) out.push({ title: t.Text, url: t.FirstURL });
    if (Array.isArray(t.Topics)) flattenDdgTopics(t.Topics, out);
  }
}

/**
 * Web discovery + fetch for the docs-research subagent (DuckDuckGo instant answer API + https GET).
 */
export const searchWebDocs = tool(
  async ({ query }: { query: string }) => {
    agentDebug("TOOL", "search_web_docs", { queryPreview: query.trim().slice(0, 120) });
    const q = query.trim().slice(0, 400);
    if (!q) return JSON.stringify({ error: "Empty query" });
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, { headers: { "User-Agent": "builder-qwik-docs-agent/1.0" } });
    if (!res.ok) return JSON.stringify({ error: `DDG HTTP ${res.status}` });
    const data = (await res.json()) as {
      Abstract?: string;
      AbstractURL?: string;
      AbstractSource?: string;
      RelatedTopics?: DdgTopic[];
      Answer?: string;
    };
    const related: { title: string; url?: string }[] = [];
    flattenDdgTopics(data.RelatedTopics, related);
    return JSON.stringify(
      {
        abstract: data.Abstract || "",
        abstractUrl: data.AbstractURL || "",
        abstractSource: data.AbstractSource || "",
        answer: data.Answer || "",
        related: related.slice(0, 12),
      },
      null,
      2,
    );
  },
  {
    name: "search_web_docs",
    description:
      "Search the public web for documentation hints (DuckDuckGo instant answer). Returns abstract, official URL when available, and related links. Use before fetch_doc_page to find URLs.",
    schema: z.object({
      query: z.string().describe("e.g. Qwik routeLoader$ SSR, Tailwind v4 @theme, Turso libSQL raw SQL"),
    }),
  },
);

export const fetchDocPage = tool(
  async ({ url }: { url: string }) => {
    agentDebug("TOOL", "fetch_doc_page", { url: url.slice(0, 160) });
    const allowed = isAllowedHttpsDocUrl(url);
    if (!allowed.ok) return JSON.stringify({ error: allowed.reason });

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(allowed.u.toString(), {
        signal: ac.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; builder-qwik-docs-agent/1.0)",
          Accept: "text/html,application/xhtml+xml,application/json;q=0.9,text/plain;q=0.8,*/*;q=0.7",
        },
      });
      if (!res.ok) return JSON.stringify({ error: `HTTP ${res.status}` });
      const ct = res.headers.get("content-type") || "";
      const raw = await res.text();
      let body: string;
      if (ct.includes("application/json")) {
        body = raw.slice(0, MAX_FETCH_CHARS);
      } else {
        body = stripHtmlToText(raw).slice(0, MAX_FETCH_CHARS);
      }
      return JSON.stringify(
        {
          url: allowed.u.toString(),
          contentType: ct,
          excerpt: body,
          truncated: raw.length > body.length,
        },
        null,
        2,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return JSON.stringify({ error: msg });
    } finally {
      clearTimeout(t);
    }
  },
  {
    name: "fetch_doc_page",
    description:
      "Fetch a public https documentation page and return plain-text excerpt (no auth). Prefer official docs URLs from search_web_docs.",
    schema: z.object({
      url: z.string().describe("https URL of a doc page"),
    }),
  },
);

export const webDocsTools = [searchWebDocs, fetchDocPage];
