# Checks

| Rule | Severity | Scans for |
| --- | --- | --- |
| `elasticclaw.agent.overlap` | Low | Is agent ownership distinct enough to avoid competing work? |
| `elasticclaw.config.invalid` | Medium | Recognized document fails to parse or violates its schema |
| `elasticclaw.dependencies.explicit` | Info | Fully declared producer/consumer edges |
| `elasticclaw.goal.ambiguous` | Low | Does the goal describe an observable outcome and useful boundaries? |
| `elasticclaw.goal.no-completion` | Medium | Is there explicit evidence that defines done? |
| `elasticclaw.goals.explicit-completion` | Info | Goals with checkable completion evidence |
| `elasticclaw.model.overkill` | Info | Is a reasoning model doing deterministic tool work? |
| `elasticclaw.permissions.scoped` | Info | Capability grants matching responsibilities |
| `elasticclaw.permissions.too-broad` | Medium | Are agent and task capabilities justified by their responsibility? |
| `elasticclaw.pr-policy.cross-issue` | Medium | Do one-PR or duplicate-PR rules scope to the current issue instead of the whole repository? |
| `elasticclaw.retries.bounded` | Info | Bounded retry with backoff and failure routing |
| `elasticclaw.retry.unbounded` | Medium | Do retries and recursive behavior terminate predictably? |
| `elasticclaw.timeout.missing` | Low | Can long-running agent or external operations stall indefinitely? |
| `elasticclaw.validation.after-mutation` | Info | Validation boundaries after state changes |
| `elasticclaw.validation.missing` | High | Is every state-changing path followed by an explicit validation boundary? |
| `elasticclaw.workflow.dependencies` | Medium | Do artifact producers and consumers have a valid execution order? |
| `elasticclaw.workspace.bloat` | Low | Is generated or transient content expanding factory context? |
