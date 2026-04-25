# Deep Agents Harness Capabilities

An agent harness is a combination of several different capabilities that make building long-running agents easier:

- **Planning capabilities**
- **Virtual filesystem**
- **Task delegation (subagents)**
- **Context and token management**
- **Code execution**
- **Human-in-the-loop**

Alongside these capabilities, Deep Agents use **Skills** and **Memory** for additional context and instructions.

## Planning capabilities
The harness provides a `write_todos` tool that agents can use to maintain a structured task list.
Features:
- Track multiple tasks with statuses ('pending', 'in_progress', 'completed')
- Persisted in agent state
- Helps agent organize complex multi-step work

## Virtual filesystem access
The harness provides a configurable virtual filesystem which can be backed by different pluggable backends. The backends support the following file system operations:
- `ls`: List files in a directory with metadata
- `read_file`: Read file contents with line numbers
- `write_file`: Create new files
- `edit_file`: Perform exact string replacements in files
- `glob`: Find files matching patterns
- `grep`: Search file contents
- `execute`: Run shell commands (sandbox backends only)

## Task delegation (subagents)
The harness allows the main agent to create ephemeral “subagents” for isolated multi-step tasks.
Main agent has a `task` tool to spawn a specialized agent, which returns a final report to the main agent. This provides context isolation and token efficiency.

## Context management
- **Offloading large tool inputs and results**: File write/edit tools offload large content to disk instead of keeping it directly in the context window.
- **Summarization**: When context crosses max input tokens (e.g. 85%), older history is summarized to structurally retain intent and next steps.
- **Long-term memory**: With a LangGraph Store/CompositeBackend, specific paths (like `/memories/`) are persisted across different threads and conversations.

## Skills & Memory
- **Skills**: Specialized workflows using the Agent Skills standard (`SKILL.md`). Progressively disclosed based on current task needs.
- **Memory**: Uses `AGENTS.md` files to provide persistent, always-loaded context (e.g., project guidelines, code styling).
