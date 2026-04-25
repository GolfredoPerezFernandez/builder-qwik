import { END, START, StateGraph } from "@langchain/langgraph";
import { AppBuilderState } from "./state";
import {
  createArchitecture,
  finalize,
  implementApp,
  ingestRequest,
  planArchitecture,
  runQuality,
} from "./nodes";

/**
 * Conditional router after quality phase.
 */
function routeAfterQuality(state: typeof AppBuilderState.State) {
  if (state.qualityGatePassed) {
    return "finalize";
  }
  // If failed too many times, finalize anyway with errors
  if (state.repairIterations >= 3) {
    return "finalize";
  }
  return "implementApp";
}

/**
 * Creates the App Builder LangGraph.
 */
export function createAppBuilderGraph() {
  const workflow = new StateGraph(AppBuilderState)
    .addNode("ingestRequest", ingestRequest)
    .addNode("planArchitecture", planArchitecture)
    .addNode("createArchitecture", createArchitecture)
    .addNode("implementApp", implementApp)
    .addNode("runQuality", runQuality)
    .addNode("finalize", finalize)

    // Flow definition
    .addEdge(START, "ingestRequest")
    .addEdge("ingestRequest", "planArchitecture")
    .addEdge("planArchitecture", "createArchitecture")
    .addEdge("createArchitecture", "implementApp")
    .addEdge("implementApp", "runQuality")
    .addConditionalEdges("runQuality", routeAfterQuality)
    .addEdge("finalize", END);

  return workflow;
}
