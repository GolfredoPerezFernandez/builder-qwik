# Long-term memory

Deep Agents come with a local transient filesystem. You can extend this with **long-term memory** by using a `CompositeBackend` that routes specific paths to persistent storage.

## Setup
```typescript
import { createDeepAgent, CompositeBackend, StateBackend, StoreBackend } from "deepagents";
import { InMemoryStore } from "@langchain/langgraph-checkpoint";

const agent = createDeepAgent({
  store: new InMemoryStore(),
  backend: (config) => new CompositeBackend(
    new StateBackend(config),  // Ephemeral storage
    { "/memories/": new StoreBackend(config) }  // Persistent storage
  ),
});
```

## How it works
1. **Short-term**: `StateBackend` keeps files temporarily in thread state.
2. **Long-term**: `StoreBackend` persists files across all threads (e.g. at `/memories/`).

## Accessing memories
Files in `/memories/` can be accessed from any thread.
```typescript
// Thread 1
await agent.invoke({
  messages: [{ role: "user", content: "Save my preferences to /memories/preferences.txt" }],
}, config1);

// Thread 2 (cross-thread persistence)
await agent.invoke({
  messages: [{ role: "user", content: "What are my preferences?" }],
}, config2);
```

## Use Cases
- User Preferences (`/memories/preferences.txt`)
- Self-improving instructions (`/memories/instructions.txt`)
- Knowledge base and Research topics.
