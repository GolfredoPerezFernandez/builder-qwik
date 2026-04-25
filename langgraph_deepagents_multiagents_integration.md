# LangGraph + Deep Agents + Multi-Agents (TypeScript)

Copia estos archivos tal cual y ajusta solo tus prompts, tools y comandos reales.

## package.json

```json
{
  "name": "app-builder-orchestrator",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "ts([docs.langchain.com](https://docs.langchain.com/oss/javascript/deepagents/customization))e --import tsx src/index.ts",
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@langchain/core": "latest",
    "@langchain/langgraph": "latest",
    "@langchain/openai": "latest",
    "deepagents": "latest",
    "langchain": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "tsx": "latest",
    "typescript": "latest",
    "@types/node": "latest"
  }
}
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

## .env.example

```bash
OPENAI_API_KEY=your_key
LANGSMITH_API_KEY=
LANGSMITH_TRACING=false
```

## src/types.ts

```ts
export type BuildPhase =
  | "intake"
  | "architecture"
  | "planning"
  | "implementation"
  | "integration"
  | "quality"
  | "review"
  | "deploy"
  | "final";

export type WorkerStatus = "idle" | "running" | "done" | "failed";

export interface BuildTodo {
  id: string;
  content: string;
  owner: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  files?: string[];
  notes?: string[];
}

export interface QualityGateResult {
  gate: string;
  passed: boolean;
  summary: string;
  details?: string[];
}
```

## src/prompts/orchestrator.ts

```ts
export const ORCHESTRATOR_SYSTEM_PROMPT = `
You are the orchestration brain for an autonomous app builder.

Responsibilities:
- Choose the right phase.
- Route work to the right specialist.
- Keep state small and structured.
- Never write full app code yourself unless explicitly asked by the graph node.
- Use specialists for implementation work.
- Enforce quality gates before deploy.
- If a gate fails, produce a concise repair brief.

Rules:
- Prefer deterministic workflow decisions over free-form reasoning.
- Keep outputs concise and machine-friendly.
- Never claim success unless a gate result says it passed.
`;
```

## src/prompts/builder.ts

```ts
export const BUILDER_SUPERVISOR_PROMPT = `
You are the Builder Supervisor.

You coordinate complex software delivery using subagents.
For complex tasks, delegate using subagents to keep your context clean.

Your job:
- turn product goals into implementation tasks
- coordinate frontend, backend, data, QA, and devops specialists
- integrate their outputs
- produce concise status summaries

Rules:
- Prefer editing existing files over rewriting everything.
- Keep outputs grounded in the current repository state.
- Return concise summaries to the supervisor.
- Do not expose secrets.
- Do not mark work complete if tests or gates still fail.
`;

export const FRONTEND_PROMPT = `
You are a frontend specialist.
Focus only on routes, components, UX states, styling, loading states, and client-side wiring.
Do not redesign backend or database contracts unless asked.
Return a concise implementation summary.
`;

export const BACKEND_PROMPT = `
You are a backend specialist.
Focus only on APIs, server actions, auth/session logic, background jobs, and secure server code.
Return a concise implementation summary.
`;

export const DATA_PROMPT = `
You are a data specialist.
Focus only on schema design, migrations, data access layers, seeding, and persistence correctness.
Return a concise implementation summary.
`;

export const QA_PROMPT = `
You are a QA specialist.
Focus on test plans, smoke tests, regression detection, and actionable bug reports.
Return concise findings and reproduction steps.
`;

export const DEVOPS_PROMPT = `
You are a devops specialist.
Focus on build, environment variables, preview deploys, health checks, and runtime readiness.
Return a concise deployment summary.
`;
```

## src/tools/fs-tools.ts

```ts
import { tool } from "@langchain/core/tools";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

function resolveSafe(rootDir: string, inputPath: string) {
  const resolved = path.resolve(rootDir, inputPath);
  const normalizedRoot = path.resolve(rootDir);
  if (!resolved.startsWith(normalizedRoot)) {
    throw new Error(`Path escapes rootDir: ${inputPath}`);
  }
  return resolved;
}

export function makeFsTools(rootDir: string) {
  const listFiles = tool(
    async ({ targetPath }: { targetPath: string }) => {
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
```

## src/tools/project-tools.ts

```ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";

function makeTodoId(index: number) {
  return `todo-${index + 1}`;
}

export const writeTodos = tool(
  async ({ todos }: { todos: Array<{ content: string; owner: string }> }) => {
    return JSON.stringify(
      todos.map((todo, index) => ({
        id: makeTodoId(index),
        content: todo.content,
        owner: todo.owner,
        status: "pending",
      })),
      null,
      2,
    );
  },
  {
    name: "write_todos",
    description: "Convert a rough plan into normalized todo items.",
    schema: z.object({
      todos: z.array(
        z.object({
          content: z.string(),
          owner: z.string(),
        }),
      ),
    }),
  },
);

export const runLint = tool(
  async () => "lint passed (stub)",
  {
    name: "run_lint",
    description: "Run lint checks for the repository.",
    schema: z.object({}),
  },
);

export const runTypecheck = tool(
  async () => "typecheck passed (stub)",
  {
    name: "run_typecheck",
    description: "Run the TypeScript checker.",
    schema: z.object({}),
  },
);

export const runBuild = tool(
  async () => "build passed (stub)",
  {
    name: "run_build",
    description: "Run the production build.",
    schema: z.object({}),
  },
);

export const runTests = tool(
  async () => "tests passed (stub)",
  {
    name: "run_tests",
    description: "Run the test suite.",
    schema: z.object({}),
  },
);

export const deployPreview = tool(
  async () => JSON.stringify({ previewUrl: "https://preview.example.com" }),
  {
    name: "deploy_preview",
    description: "Deploy a preview build and return its URL.",
    schema: z.object({}),
  },
);
```

## src/agents/specialist-runnables.ts

```ts
import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import {
  FRONTEND_PROMPT,
  BACKEND_PROMPT,
  DATA_PROMPT,
  QA_PROMPT,
  DEVOPS_PROMPT,
} from "../prompts/builder.js";
import { makeFsTools } from "../tools/fs-tools.js";
import { runBuild, runLint, runTests, runTypecheck } from "../tools/project-tools.js";

export function makeSpecialistRunnables(rootDir: string) {
  const model = new ChatOpenAI({ model: "gpt-4.1" });
  const fsTools = makeFsTools(rootDir);

  const frontendRunnable = createAgent({
    model,
    tools: [...fsTools],
    prompt: FRONTEND_PROMPT,
  });

  const backendRunnable = createAgent({
    model,
    tools: [...fsTools],
    prompt: BACKEND_PROMPT,
  });

  const dataRunnable = createAgent({
    model,
    tools: [...fsTools],
    prompt: DATA_PROMPT,
  });

  const qaRunnable = createAgent({
    model,
    tools: [...fsTools, runLint, runTypecheck, runBuild, runTests],
    prompt: QA_PROMPT,
  });

  const devopsRunnable = createAgent({
    model,
    tools: [...fsTools],
    prompt: DEVOPS_PROMPT,
  });

  return {
    frontendRunnable,
    backendRunnable,
    dataRunnable,
    qaRunnable,
    devopsRunnable,
  };
}
```

## src/agents/builder-supervisor.ts

```ts
import path from "node:path";
import {
  createDeepAgent,
  FilesystemBackend,
  type CompiledSubAgent,
} from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver } from "@langchain/langgraph";
import { BUILDER_SUPERVISOR_PROMPT } from "../prompts/builder.js";
import { makeFsTools } from "../tools/fs-tools.js";
import {
  deployPreview,
  runBuild,
  runLint,
  runTests,
  runTypecheck,
  writeTodos,
} from "../tools/project-tools.js";
import { makeSpecialistRunnables } from "./specialist-runnables.js";

export async function createBuilderSupervisor(rootDir: string) {
  const model = new ChatOpenAI({ model: "gpt-4.1", temperature: 0 });
  const checkpointer = new MemorySaver();
  const fsTools = makeFsTools(rootDir);

  const {
    frontendRunnable,
    backendRunnable,
    dataRunnable,
    qaRunnable,
    devopsRunnable,
  } = makeSpecialistRunnables(rootDir);

  const subagents: CompiledSubAgent[] = [
    {
      name: "frontend-specialist",
      description: "Builds UI, routes, components, and loading/error UX.",
      runnable: frontendRunnable,
    },
    {
      name: "backend-specialist",
      description: "Builds APIs, auth, server actions, and secure server code.",
      runnable: backendRunnable,
    },
    {
      name: "data-specialist",
      description: "Builds schema, migrations, and data-access code.",
      runnable: dataRunnable,
    },
    {
      name: "qa-specialist",
      description: "Runs validation logic and reports actionable failures.",
      runnable: qaRunnable,
    },
    {
      name: "devops-specialist",
      description: "Handles preview deployment and environment readiness.",
      runnable: devopsRunnable,
    },
  ];

  const agent = await createDeepAgent({
    model,
    checkpointer,
    backend: () => new FilesystemBackend({ rootDir }),
    memory: [path.join(rootDir, "AGENTS.md")],
    systemPrompt: BUILDER_SUPERVISOR_PROMPT,
    tools: [
      ...fsTools,
      writeTodos,
      runLint,
      runTypecheck,
      runBuild,
      runTests,
      deployPreview,
    ],
    subagents,
  });

  return { agent, checkpointer };
}
```

## src/graph/state.ts

```ts
import {
  MessagesValue,
  ReducedValue,
  StateSchema,
} from "@langchain/langgraph";
import { z } from "zod";

export const AppBuilderState = new StateSchema({
  messages: MessagesValue,
  userRequest: z.string().default(""),
  productSpec: z.string().default(""),
  architectureSpec: z.string().default(""),
  implementationBrief: z.string().default(""),
  integrationSummary: z.string().default(""),
  previewUrl: z.string().default(""),
  finalSummary: z.string().default(""),
  repairIterations: z.number().default(0),
  currentPhase: z
    .enum([
      "intake",
      "architecture",
      "planning",
      "implementation",
      "integration",
      "quality",
      "review",
      "deploy",
      "final",
    ])
    .default("intake"),
  qualityGatePassed: z.boolean().default(false),
  needsRepair: z.boolean().default(false),
  changedFiles: new ReducedValue(z.array(z.string()).default(() => []), {
    reducer: (left, right) => left.concat(right),
    inputSchema: z.array(z.string()),
  }),
  reports: new ReducedValue(z.array(z.string()).default(() => []), {
    reducer: (left, right) => left.concat(right),
    inputSchema: z.array(z.string()),
  }),
});

export type AppBuilderStateType = typeof AppBuilderState.State;
```

## src/graph/nodes.ts

```ts
import type { BaseMessageLike } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type { RunnableConfig } from "@langchain/core/runnables";
import { z } from "zod";
import { ORCHESTRATOR_SYSTEM_PROMPT } from "../prompts/orchestrator.js";
import type { AppBuilderStateType } from "./state.js";
import { createBuilderSupervisor } from "../agents/builder-supervisor.js";

const plannerModel = new ChatOpenAI({ model: "gpt-4.1", temperature: 0 });

const productSpecSchema = z.object({
  productSpec: z.string(),
});

const architectureSchema = z.object({
  architectureSpec: z.string(),
});

export async function ingestRequest(state: AppBuilderStateType) {
  return {
    currentPhase: "architecture" as const,
    messages: [new HumanMessage(state.userRequest)],
  };
}

export async function planArchitecture(state: AppBuilderStateType) {
  const structured = plannerModel.withStructuredOutput(productSpecSchema);
  const result = await structured.invoke([
    {
      role: "system",
      content: `${ORCHESTRATOR_SYSTEM_PROMPT}\nCreate a concise product specification from the user request.`,
    },
    {
      role: "user",
      content: state.userRequest,
    },
  ]);

  return {
    currentPhase: "planning" as const,
    productSpec: result.productSpec,
    reports: ["Product specification created."],
  };
}

export async function createArchitecture(state: AppBuilderStateType) {
  const structured = plannerModel.withStructuredOutput(architectureSchema);
  const result = await structured.invoke([
    {
      role: "system",
      content:
        `${ORCHESTRATOR_SYSTEM_PROMPT}\nCreate a technical architecture from the product spec. Include frontend, backend, data, testing, and deploy concerns.`,
    },
    {
      role: "user",
      content: state.productSpec,
    },
  ]);

  return {
    currentPhase: "implementation" as const,
    architectureSpec: result.architectureSpec,
    reports: ["Architecture specification created."],
  };
}

export async function implementApp(
  state: AppBuilderStateType,
  config?: RunnableConfig,
) {
  const rootDir = process.cwd();
  const { agent } = await createBuilderSupervisor(rootDir);

  const prompt = [
    "Build the application using the following inputs.",
    "",
    "PRODUCT SPEC:",
    state.productSpec,
    "",
    "ARCHITECTURE SPEC:",
    state.architectureSpec,
    "",
    "Required execution order:",
    "1. write_todos",
    "2. inspect files",
    "3. delegate to specialists when useful",
    "4. integrate outputs",
    "5. run lint, typecheck, build, tests",
    "6. summarize changes and failures clearly",
  ].join("\n");

  const result = await agent.invoke(
    {
      messages: [{ role: "user", content: prompt }],
    },
    {
      configurable: {
        thread_id:
          String(config?.configurable?.["thread_id"] ?? `thread-${Date.now()}`),
      },
    },
  );

  const lastMessage = result.messages.at(-1);
  const summary = typeof lastMessage?.content === "string"
    ? lastMessage.content
    : JSON.stringify(lastMessage?.content ?? "", null, 2);

  return {
    currentPhase: "integration" as const,
    implementationBrief: summary,
    reports: ["Implementation phase completed."],
  };
}

export async function integrateResults(state: AppBuilderStateType) {
  const response = await plannerModel.invoke([
    {
      role: "system",
      content:
        `${ORCHESTRATOR_SYSTEM_PROMPT}\nSummarize the implementation and highlight integration concerns, if any.`,
    },
    {
      role: "user",
      content: state.implementationBrief,
    },
  ]);

  const content = typeof response.content === "string"
    ? response.content
    : JSON.stringify(response.content, null, 2);

  return {
    currentPhase: "quality" as const,
    integrationSummary: content,
    reports: ["Integration summary created."],
  };
}

export async function runQuality(state: AppBuilderStateType) {
  const text = state.implementationBrief.toLowerCase();
  const passed =
    text.includes("lint passed") &&
    text.includes("typecheck passed") &&
    text.includes("build passed") &&
    text.includes("tests passed");

  return {
    currentPhase: passed ? ("deploy" as const) : ("implementation" as const),
    qualityGatePassed: passed,
    needsRepair: !passed,
    repairIterations: passed ? state.repairIterations : state.repairIterations + 1,
    reports: [
      passed
        ? "Quality gates passed."
        : "Quality gates failed. Returning to implementation.",
    ],
  };
}

export async function deployPreviewNode(state: AppBuilderStateType, config?: RunnableConfig) {
  const rootDir = process.cwd();
  const { agent } = await createBuilderSupervisor(rootDir);

  const result = await agent.invoke(
    {
      messages: [
        {
          role: "user",
          content:
            "Deploy a preview for the current app, then return only a concise summary and the preview URL if available.",
        },
      ],
    },
    {
      configurable: {
        thread_id: String(config?.configurable?.["thread_id"] ?? `deploy-${Date.now()}`),
      },
    },
  );

  const lastMessage = result.messages.at(-1);
  const text = typeof lastMessage?.content === "string"
    ? lastMessage.content
    : JSON.stringify(lastMessage?.content ?? "", null, 2);

  const previewUrlMatch = text.match(/https?:\/\/\S+/);

  return {
    currentPhase: "final" as const,
    previewUrl: previewUrlMatch?.[0] ?? "",
    finalSummary: text,
    reports: ["Preview deployment attempted."],
  };
}

export async function finalize(state: AppBuilderStateType) {
  return {
    finalSummary: [
      "APP BUILD COMPLETE",
      "",
      `Preview URL: ${state.previewUrl || "not available"}`,
      "",
      "Implementation summary:",
      state.implementationBrief,
      "",
      "Integration summary:",
      state.integrationSummary,
      "",
      "Reports:",
      ...state.reports,
    ].join("\n"),
  };
}
```

## src/graph/graph.ts

```ts
import {
  ConditionalEdgeRouter,
  END,
  MemorySaver,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { AppBuilderState } from "./state.js";
import {
  createArchitecture,
  deployPreviewNode,
  finalize,
  implementApp,
  ingestRequest,
  integrateResults,
  planArchitecture,
  runQuality,
} from "./nodes.js";

const routeAfterQuality: ConditionalEdgeRouter<
  typeof AppBuilderState,
  "implementApp" | "deployPreview"
> = (state) => {
  return state.qualityGatePassed ? "deployPreview" : "implementApp";
};

export function createAppBuilderGraph() {
  const workflow = new StateGraph(AppBuilderState)
    .addNode("ingestRequest", ingestRequest)
    .addNode("planArchitecture", planArchitecture)
    .addNode("createArchitecture", createArchitecture)
    .addNode("implementApp", implementApp)
    .addNode("integrateResults", integrateResults)
    .addNode("runQuality", runQuality)
    .addNode("deployPreview", deployPreviewNode)
    .addNode("finalize", finalize)
    .addEdge(START, "ingestRequest")
    .addEdge("ingestRequest", "planArchitecture")
    .addEdge("planArchitecture", "createArchitecture")
    .addEdge("createArchitecture", "implementApp")
    .addEdge("implementApp", "integrateResults")
    .addEdge("integrateResults", "runQuality")
    .addConditionalEdges("runQuality", routeAfterQuality)
    .addEdge("deployPreview", "finalize")
    .addEdge("finalize", END);

  const checkpointer = new MemorySaver();
  return workflow.compile({ checkpointer });
}
```

## src/index.ts

```ts
import "dotenv/config";
import { createAppBuilderGraph } from "./graph/graph.js";

async function main() {
  const request = process.argv.slice(2).join(" ") ||
    "Build a SaaS app with auth, dashboard, billing placeholder, admin area, and preview deployment.";

  const graph = createAppBuilderGraph();

  const result = await graph.invoke(
    {
      userRequest: request,
      messages: [],
      productSpec: "",
      architectureSpec: "",
      implementationBrief: "",
      integrationSummary: "",
      previewUrl: "",
      finalSummary: "",
      repairIterations: 0,
      currentPhase: "intake",
      qualityGatePassed: false,
      needsRepair: false,
      changedFiles: [],
      reports: [],
    },
    {
      configurable: {
        thread_id: `app-builder-${Date.now()}`,
      },
      recursionLimit: 50,
    },
  );

  console.log("\n===== FINAL SUMMARY =====\n");
  console.log(result.finalSummary);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

## src/server-integration-example.ts

```ts
import "dotenv/config";
import { createAppBuilderGraph } from "./graph/graph.js";

const graph = createAppBuilderGraph();

export async function runAppBuilder(request: string, threadId: string) {
  const result = await graph.invoke(
    {
      userRequest: request,
      messages: [],
      productSpec: "",
      architectureSpec: "",
      implementationBrief: "",
      integrationSummary: "",
      previewUrl: "",
      finalSummary: "",
      repairIterations: 0,
      currentPhase: "intake",
      qualityGatePassed: false,
      needsRepair: false,
      changedFiles: [],
      reports: [],
    },
    {
      configurable: { thread_id: threadId },
      recursionLimit: 50,
    },
  );

  return result;
}
```

## AGENTS.md

```md
# Builder operating memory

- Always start by converting goals into atomic todos.
- Inspect the repository before making changes.
- Prefer specialists for focused work.
- Run quality checks before calling work complete.
- Never expose secrets.
- Return concise summaries.
```

## Cómo adaptarlo a tu proyecto actual

1. Reemplaza los tools stub de lint/build/test/deploy por tus comandos reales.
2. Si quieres usar tu backend Qwik actual, mueve `runAppBuilder()` a tu `server$` o a tu capa Express.
3. Si quieres mantener tu prompt gigante de Qwik, úsalo como base del `BUILDER_SUPERVISOR_PROMPT` o del subagente frontend.
4. Si quieres más control, mete tus validadores reales como nodos deterministas adicionales en LangGraph.

## Qué corrige respecto a tu código pegado

- Ya no depende de un único Deep Agent monolítico.
- Usa LangGraph como orquestador real.
- Usa subagentes especializados.
- Usa `MemorySaver` y checkpointer en el patrón actual.
- Te deja enchufar tus tools y deploy real sin rehacer la arquitectura.
```

