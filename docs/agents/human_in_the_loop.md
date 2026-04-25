# Human-in-the-loop

Deep Agents support human-in-the-loop workflows through LangGraph's interrupt capabilities. You can configure which tools require approval using the `interrupt_on` parameter.

## Basic configuration
```python
agent = create_deep_agent(
    model="claude-sonnet-4-6",
    tools=[delete_file, read_file, send_email],
    interrupt_on={
        "delete_file": True,  # Default: approve, edit, reject
        "read_file": False,   # No interrupts needed
        "send_email": {"allowed_decisions": ["approve", "reject"]},  # No editing
    },
    checkpointer=checkpointer  # Required!
)
```

## Handle interrupts
When an interrupt is triggered, the agent pauses execution. Check for interrupts in the result and handle them accordingly:
```typescript
if (result.__interrupt__) {
  const interrupts = result.__interrupt__[0].value;
  const actionRequests = interrupts.actionRequests;

  // Decide
  const decisions = [{ type: "approve" }];

  // Resume execution
  result = await agent.invoke(
    new Command({ resume: { decisions } }),
    config
  );
}
```

## Subagent interrupts
Each subagent can have its own `interrupt_on` configuration that overrides the main agent's settings. Subagent tools can also call `interrupt()` directly to pause execution and await approval.
