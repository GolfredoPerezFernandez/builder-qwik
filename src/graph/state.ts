import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";

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

/**
 * AppBuilderState using LangGraph Annotation.
 */
export const AppBuilderState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  userRequest: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  productSpec: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  architectureSpec: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  implementationBrief: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  integrationSummary: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  previewUrl: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  finalSummary: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  repairIterations: Annotation<number>({
    reducer: (left, right) => left + right,
    default: () => 0,
  }),
  currentPhase: Annotation<BuildPhase>({
    reducer: (_, right) => right,
    default: () => "intake",
  }),
  qualityGatePassed: Annotation<boolean>({
    reducer: (_, right) => right,
    default: () => false,
  }),
  needsRepair: Annotation<boolean>({
    reducer: (_, right) => right,
    default: () => false,
  }),
  changedFiles: Annotation<string[]>({
    reducer: (left, right) => [...new Set([...left, ...right])],
    default: () => [],
  }),
  reports: Annotation<string[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  backlog: Annotation<BuildTodo[]>({
    reducer: (_, right) => right,
    default: () => [],
  }),
});

export type AppBuilderStateType = typeof AppBuilderState.State;
