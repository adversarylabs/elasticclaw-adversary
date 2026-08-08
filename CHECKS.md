# Checks — what elasticclaw detects

This file is the **public audit list** of detectors for the **factory/elasticclaw** adversary. It reviews an ElasticClaw software factory *as an automation platform* — workspaces, goals, workflows, agents, and execution policy — and answers one question: does this configuration provide enough correctness, permission, validation, and failure boundaries to support autonomous execution? It does not review application source code.

Runtime source of truth: [`src/spec.ts`](src/spec.ts) / [`src/rules.ts`](src/rules.ts).

**Scope:** `.elasticclaw/**` (workspace configs, AGENTS.md, TOOLS.md) and typed root documents (`elasticclaw.yaml`, `workspace.yaml`, `workflow.yaml`, `goal.yaml`, `agent.yaml`, `.yml` and suffixed variants). Documents declare type via `kind`, well-known filename, or typed collections; unrelated YAML is ignored even under `.elasticclaw/`.

**Precision stance:** The upstream schema is still evolving — common aliases (`tasks`/`steps`/`jobs`, `needs`/`depends_on`, completion/acceptance criteria) are normalized, but unknown syntax is never guessed at. Malformed *recognized* documents produce a precise configuration finding; valid-but-unsupported documents produce nothing. Judgment rules (goal quality, permission justification) ask a review question at low/medium confidence rather than asserting a defect. Deterministic graph rules (dependencies, retries) fire at full confidence.

Public grounding: general autonomous-agent safety practice — bounded retries, explicit completion criteria, least-privilege tool access, and validation after mutation; the same principles the `adversarylabs/adversary` catalog applies to adversaries themselves.

---

## High

### `elasticclaw.validation.missing`

| | |
| --- | --- |
| **What** | State-changing path with no validation boundary after it |
| **Why** | An autonomous workflow that mutates (writes files, calls tools with side effects, deploys) and never validates gives an agent unbounded blast radius — errors compound silently across subsequent steps |
| **Looks for** | Workflow tasks flagged as mutating (writes, deploys, tool calls with side effects) with no subsequent validation/test/review step before the workflow ends or the next mutation begins |
| **Stays quiet when** | Explicit validation step follows each mutation (`elasticclaw.validation.after-mutation` positive signal); terminal read-only steps; human-approval gates in the path |
| **Remediation** | Follow every state-changing step with an explicit validation boundary (test run, schema check, or review gate) |

---

## Medium

### `elasticclaw.config.invalid`

| | |
| --- | --- |
| **What** | Recognized document fails to parse or violates its schema |
| **Why** | A malformed workflow/goal/agent file silently drops from execution planning — the factory runs with a hole where policy was supposed to be |
| **Looks for** | YAML parse failures and schema violations in documents the adversary positively identifies as ElasticClaw types |
| **Stays quiet when** | Valid-but-unsupported syntax (schema evolution tolerance — never guess); unrelated YAML |
| **Remediation** | Fix the document; keep unknown extensions in separate files rather than mixed into typed documents |

### `elasticclaw.goal.no-completion`

| | |
| --- | --- |
| **What** | Goal without explicit completion evidence |
| **Why** | "Done" defined by agent vibes is how autonomous loops run forever or stop half-finished — completion criteria are the loop's exit condition |
| **Looks for** | Goal documents lacking completion/acceptance criteria (all normalized aliases checked) |
| **Stays quiet when** | Explicit, checkable completion evidence present (`elasticclaw.goals.explicit-completion` positive signal) |
| **Remediation** | Define observable completion evidence: tests pass, artifact exists, review approved |

### `elasticclaw.permissions.too-broad`

| | |
| --- | --- |
| **What** | Agent/task capabilities exceed their responsibility |
| **Why** | Least privilege matters more for autonomous agents than humans — an over-permissioned agent turns any planning mistake into a capability incident |
| **Looks for** | Judgment-gated: agents granted tools/scopes (write, network, deploy) that no task assigned to them requires; wildcard capability grants |
| **Stays quiet when** | Grants map to assigned responsibilities (`elasticclaw.permissions.scoped` positive signal); documented justification on the grant |
| **Remediation** | Scope capabilities per agent to its actual tasks; split agents rather than widening one |

### `elasticclaw.workflow.dependencies`

| | |
| --- | --- |
| **What** | Producer/consumer ordering broken in the workflow graph |
| **Why** | A task consuming an artifact its producer hasn't run yet (or a dependency cycle) makes execution order undefined — the workflow works by accident or not at all |
| **Looks for** | Deterministic graph analysis over `needs`/`depends_on` (normalized): cycles, consumers not depending on their producers, references to undefined tasks |
| **Stays quiet when** | Valid topological order exists and artifact edges are declared (`elasticclaw.dependencies.explicit` positive signal); genuinely independent parallel tasks |
| **Remediation** | Declare artifact dependencies explicitly; break cycles by splitting stages |

### `elasticclaw.retry.unbounded`

| | |
| --- | --- |
| **What** | Retry or recursive behavior without a termination bound |
| **Why** | Unbounded retry in an autonomous system is a cost and safety incident: the loop that "keeps trying" keeps spending — tokens, API quota, side effects |
| **Looks for** | Retry policies without max attempts/backoff ceilings; workflows or agent loops that re-enter themselves without an iteration bound |
| **Stays quiet when** | Bounded attempts with backoff (`elasticclaw.retries.bounded` positive signal); human-gated resumption |
| **Remediation** | Cap attempts, add backoff, and route exhaustion to a human or failure state |

### `elasticclaw.pr-policy.cross-issue`

| | |
| --- | --- |
| **What** | Instruction, prompt, or gate enforces repo-wide "one open PR per repository" without scoping to the current issue |
| **Why** | When multiple ElasticClaw agents (or issue agents) run concurrently on different issues in the same repo, unscoped one-PR rules cause them to close, rewrite, or force-push each other's PRs, thrashing until work is lost |
| **Looks for** | Markdown instructions (AGENTS.md, TOOLS.md), workflow prompts, or gate text containing "one open PR per repository", "exactly one open PR per repo", "close the extras", "sole open PR in the repo", or similar without "for this issue", "leave other issues' PRs alone", Fixes #N, or explicit concurrency tolerance |
| **Stays quiet when** | Policy is explicitly scoped ("one open PR per repository for this issue"), agents are told to leave other issues' PRs alone, duplicate detection uses issue-specific evidence (Fixes #N, issue branch), or concurrent work on other issues is noted as normal |
| **Remediation** | Scope the rule to the current issue only; add explicit language to leave PRs for other issues untouched; use issue-numbered branches and Fixes references as scoping evidence |

---

## Low

### `elasticclaw.goal.ambiguous`

| | |
| --- | --- |
| **What** | Goal doesn't describe an observable outcome with useful boundaries |
| **Why** | Vague goals ("improve the API") delegate scoping to the agent — the most expensive place to discover a misunderstanding. Judgment rule: asks the question, low confidence by design |
| **Looks for** | Judgment-gated: goals with no observable outcome, no scope boundaries, or aspirational language without deliverables |
| **Stays quiet when** | Outcome + boundaries stated, even briefly |
| **Remediation** | State what will exist afterward and what is out of scope |

### `elasticclaw.agent.overlap`

| | |
| --- | --- |
| **What** | Agent ownership not distinct enough to avoid competing work |
| **Why** | Two agents with overlapping mandates and write access to the same surface can generate conflicting changes — coordination cost the factory pays every run |
| **Looks for** | Judgment-gated: agents whose declared responsibilities/target paths substantially intersect without an ordering or ownership rule |
| **Stays quiet when** | Distinct ownership; explicit hand-off/ordering between the overlapping agents |
| **Remediation** | Partition ownership or declare the coordination explicitly |

### `elasticclaw.timeout.missing`

| | |
| --- | --- |
| **What** | Long-running agent or external operation with no timeout |
| **Why** | A stalled step stalls the factory; low severity because the platform may impose defaults — the finding notes the gap rather than asserting an incident |
| **Looks for** | External calls/long operations in workflows without a declared timeout |
| **Stays quiet when** | Timeouts declared; platform-level default documented in workspace config |
| **Remediation** | Declare per-step timeouts with a failure route |

### `elasticclaw.workspace.bloat`

| | |
| --- | --- |
| **What** | Workspace accumulates stale or redundant configuration |
| **Why** | Dead goals and orphaned agents make the factory's actual behavior unreadable — the config stops being the source of truth |
| **Looks for** | Goals no workflow references, agents no task uses, duplicate documents shadowing each other |
| **Stays quiet when** | Everything referenced; intentional archives clearly separated |
| **Remediation** | Delete or archive unreferenced documents |

---

## Info

### `elasticclaw.model.overkill`

| | |
| --- | --- |
| **What** | A reasoning model assigned to deterministic tool work |
| **Why** | Pure cost/latency observation — a template render or file copy doesn't need frontier reasoning. Info-only: never framed as a defect |
| **Looks for** | Agent/task model assignments pairing high-reasoning models with mechanical, fully-specified operations |
| **Stays quiet when** | Task involves judgment, synthesis, or natural language; model tier already minimal |
| **Remediation** | Route mechanical steps to cheaper models or plain tools |

---

## Positive signals

Reported to build trust, mirroring the `complexity` adversary's approach:

| Rule | Recognizes |
| --- | --- |
| `elasticclaw.goals.explicit-completion` | Goals with checkable completion evidence |
| `elasticclaw.dependencies.explicit` | Fully declared producer/consumer edges |
| `elasticclaw.permissions.scoped` | Capability grants matching responsibilities |
| `elasticclaw.retries.bounded` | Bounded retry with backoff and failure routing |
| `elasticclaw.validation.after-mutation` | Validation boundaries after state changes |

The overall assessment (`elasticclaw.review`, with `elasticclaw.factory.none` / `elasticclaw.factory.context-only` states) reports whether a factory was found and how much of it was reviewable.

---

## Out of scope (owned elsewhere)

| Concern | Owner |
| --- | --- |
| Application source code quality | language adversaries (`go/*`, `typescript`, …) |
| CI pipelines invoked by workflows | `ci/github-actions` / `ci/depot` / `gitlab-ci` |
| Committed secrets in config | `security/secrets` |
| Adversary-definition quality (this platform's own reviewers) | `adversarylabs/adversary` |
