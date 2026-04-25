import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type { RunnableConfig } from "@langchain/core/runnables";
import { z } from "zod";
import { agentDebug, agentDebugTimed } from "../lib/agent-debug";
import { ORCHESTRATOR_SYSTEM_PROMPT } from "../prompts/orchestrator";
import type { AppBuilderStateType } from "./state";
import { createBuilderSupervisor } from "../agents/builder-supervisor";

const plannerModel = new ChatOpenAI({ modelName: "gpt-4o", temperature: 0 });

const productSpecSchema = z.object({
  productSpec: z.string(),
});

const architectureSchema = z.object({
  architectureSpec: z.string(),
});

/**
 * Node: ingestRequest
 * Processes the initial user request.
 */
export async function ingestRequest(state: AppBuilderStateType) {
  agentDebug("GRAPH_ORCH", "ingestRequest → architecture", {
    requestPreview:
      state.userRequest.length > 160
        ? `${state.userRequest.slice(0, 160)}…`
        : state.userRequest,
  });
  return {
    currentPhase: "architecture" as const,
    messages: [new HumanMessage(state.userRequest)],
  };
}

/**
 * Node: planArchitecture
 * Creates a product specification from the user request.
 */
export async function planArchitecture(state: AppBuilderStateType) {
  return agentDebugTimed("GRAPH_ORCH", "planArchitecture (structured LLM)", async () => {
    const structured = plannerModel.withStructuredOutput(productSpecSchema);
    const result = await structured.invoke([
      {
        role: "system",
        content: `${ORCHESTRATOR_SYSTEM_PROMPT}\nCreate a concise product specification from the user request.`,
      },
      ...state.messages,
    ]);

    agentDebug("GRAPH_ORCH", "planArchitecture → productSpec", {
      chars: result.productSpec.length,
    });

    return {
      currentPhase: "planning" as const,
      productSpec: result.productSpec,
      reports: ["Product specification created."],
    };
  });
}

/**
 * Node: createArchitecture
 * Creates a technical architecture from the product spec.
 */
export async function createArchitecture(state: AppBuilderStateType) {
  return agentDebugTimed("GRAPH_ORCH", "createArchitecture (structured LLM)", async () => {
    const structured = plannerModel.withStructuredOutput(architectureSchema);
    const result = await structured.invoke([
      {
        role: "system",
        content: `${ORCHESTRATOR_SYSTEM_PROMPT}\nCreate a technical architecture from the product spec. Include frontend, backend, data, testing, and deploy concerns for a Qwik application.`,
      },
      {
        role: "user",
        content: state.productSpec,
      },
    ]);

    agentDebug("GRAPH_ORCH", "createArchitecture → architectureSpec", {
      chars: result.architectureSpec.length,
    });

    return {
      currentPhase: "implementation" as const,
      architectureSpec: result.architectureSpec,
      reports: ["Architecture specification created."],
    };
  });
}

/**
 * Node: implementApp
 * Invokes the Builder Supervisor to execute the plan.
 */
export async function implementApp(
  state: AppBuilderStateType,
  config?: RunnableConfig,
) {
  return agentDebugTimed("GRAPH_IMPL", "implementApp (deep agent invoke)", async () => {
    const rootDir = process.cwd();
    const apiKey = config?.configurable?.openai_api_key;
    const { agent } = await createBuilderSupervisor(rootDir, apiKey);

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
      "2. inspect existing blueprints if needed",
      "3. implement modules using specialists",
      "4. integrate and verify",
    ].join("\n");

    agentDebug("GRAPH_IMPL", "implementApp prompt", {
      chars: prompt.length,
      threadHint: state.userRequest.slice(0, 24),
    });

    const result = await (agent as any).invoke(
      {
        messages: [{ role: "user", content: prompt }],
      },
      {
        configurable: {
          thread_id: state.userRequest.slice(0, 10) + Date.now(),
        },
      },
    );

    const msgs = result.messages as unknown[] | undefined;
    agentDebug("GRAPH_IMPL", "implementApp invoke done", {
      messageCount: msgs?.length ?? 0,
    });

    const lastMessage = result.messages.at(-1);
    const summary = typeof lastMessage?.content === "string"
      ? lastMessage.content
      : JSON.stringify(lastMessage?.content ?? "", null, 2);

    return {
      currentPhase: "quality" as const,
      implementationBrief: summary,
      reports: ["Implementation phase completed."],
    };
  });
}

/**
 * Node: runQuality
 * Checks if the implementation passed all gates.
 */
export async function runQuality(state: AppBuilderStateType) {
  const text = state.implementationBrief.toLowerCase();
  const passed =
    text.includes("lint passed") &&
    text.includes("typecheck passed") &&
    text.includes("build passed");

  agentDebug("GRAPH_QA", "runQuality gates", {
    passed,
    repairIterations: state.repairIterations,
    briefChars: state.implementationBrief.length,
  });

  return {
    currentPhase: passed ? ("final" as const) : ("implementation" as const),
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

/**
 * Node: finalize
 * Prepares the final summary for the user.
 */
export async function finalize(state: AppBuilderStateType) {
  agentDebug("GRAPH_ORCH", "finalize", {
    phase: state.currentPhase,
    reportsCount: state.reports.length,
  });
  return {
    currentPhase: "final" as const,
    finalSummary: [
      "APP BUILD COMPLETE",
      "",
      "Implementation summary:",
      state.implementationBrief,
      "",
      "Reports:",
      ...state.reports,
    ].join("\n"),
  };
}
