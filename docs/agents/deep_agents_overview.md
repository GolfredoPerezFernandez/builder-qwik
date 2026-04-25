# Deep Agents Documentation

## Overview

LangChain is the easy way to start building completely custom agents and applications powered by LLMs. With under 10 lines of code, you can connect to OpenAI, Anthropic, Google, and more. 

If you are looking to build an agent, we recommend you start with **Deep Agents** which comes “batteries-included”, with modern features like automatic compression of long conversations, a virtual filesystem, and subagent-spawning for managing and isolating context.

Deep Agents are implementations of LangChain agents. If you don’t need these capabilities or would like to customize your own for your agents and autonomous applications, start with LangChain.

Use LangGraph, our low-level agent orchestration framework and runtime, when you have more advanced needs that require a combination of deterministic and agentic workflows and heavy customization.

## Create a deep agent

```ts
import * as z from "zod";
// npm install deepagents langchain @langchain/core
import { createDeepAgent } from "deepagents";
import { tool } from "langchain";

const getWeather = tool(
  ({ city }) => `It's always sunny in ${city}!`,
  {
    name: "get_weather",
    description: "Get the weather for a given city",
    schema: z.object({
      city: z.string(),
    }),
  },
);

const agent = createDeepAgent({
  tools: [getWeather],
  system: "You are a helpful assistant",
});

console.log(
  await agent.invoke({
    messages: [{ role: "user", content: "What's the weather in Tokyo?" }],
  })
);
```

## When to use Deep Agents
Use the Deep Agents SDK when you want to build agents that can:
- **Handle complex, multi-step tasks** that require planning and decomposition
- **Manage large amounts of context** through file system tools
- **Swap filesystem backends** to use in-memory state, local disk, durable stores, sandboxes, or your own custom backend
- **Delegate work** to specialized subagents for context isolation
- **Persist memory** across conversations and threads

## Core capabilities

- **Planning and task decomposition**: Deep Agents include a built-in `write_todos` tool that enables agents to break down complex tasks into discrete steps.
- **Context management**: File system tools (`ls`, `read_file`, `write_file`, `edit_file`) allow agents to offload large context to in-memory or filesystem storage, preventing context window overflow.
- **Pluggable filesystem backends**: The virtual filesystem is powered by pluggable backends. Choose from in-memory state, local disk, LangGraph store for cross-thread persistence.
- **Subagent spawning**: A built-in `task` tool enables agents to spawn specialized subagents for context isolation.
- **Long-term memory**: Extend agents with persistent memory across threads using LangGraph's Memory Store.
