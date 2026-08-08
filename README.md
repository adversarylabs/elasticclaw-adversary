# ElasticClaw adversary

`elasticclaw` reviews an ElasticClaw software factory as an automation platform. It evaluates declared workspaces, goals, workflows, agents, and execution policy; it does not review application source code.

Version `0.1.0` intentionally favors a few evidence-backed findings over broad lint coverage. Its final assessment answers whether the discovered factory configuration provides enough correctness, permission, validation, and failure boundaries to support autonomous execution.

## What it discovers

The reviewer recognizes the concrete workspace layout used by ElasticClaw:

```text
.elasticclaw/workspaces/<workspace>/elasticclaw-config.yaml
.elasticclaw/workspaces/<workspace>/AGENTS.md
.elasticclaw/workspaces/<workspace>/TOOLS.md
```

It also supports typed goal, workflow, agent, and workspace documents under `.elasticclaw/` or in these repository-root files:

```text
elasticclaw.yaml    workspace.yaml    workflow.yaml
goal.yaml           agent.yaml
```

The `.yml` variants and suffixed names such as `workflow-release.yaml` are also supported. A document can declare its type with `kind`, use the corresponding well-known filename, or contain a typed collection such as `workflows:` or `agents:`. Unrelated YAML is ignored even when it appears below `.elasticclaw/`.

Because the upstream schema is still evolving, v0.1.0 normalizes common field aliases (`tasks`/`steps`/`jobs`, `needs`/`depends_on`, and completion or acceptance criteria) but does not guess at unknown syntax. Malformed recognized documents produce a precise configuration finding; valid but unsupported documents do not.

## Review rules

| Rule | Default severity | Review question |
| --- | --- | --- |
| `elasticclaw.goal.ambiguous` | low | Does the goal describe an observable outcome and useful boundaries? |
| `elasticclaw.goal.no-completion` | medium | Is there explicit evidence that defines done? |
| `elasticclaw.permissions.too-broad` | medium | Are agent and task capabilities justified by their responsibility? |
| `elasticclaw.workflow.dependencies` | medium | Do artifact producers and consumers have a valid execution order? |
| `elasticclaw.agent.overlap` | low | Is agent ownership distinct enough to avoid competing work? |
| `elasticclaw.pr-policy.cross-issue` | medium | Do one-PR or duplicate-PR rules scope to the current issue instead of the whole repository? |
| `elasticclaw.validation.missing` | high | Is every state-changing path followed by an explicit validation boundary? |
| `elasticclaw.retry.unbounded` | medium | Do retries and recursive behavior terminate predictably? |
| `elasticclaw.timeout.missing` | low | Can long-running agent or external operations stall indefinitely? |
| `elasticclaw.model.overkill` | info | Is a reasoning model doing deterministic tool work? |
| `elasticclaw.workspace.bloat` | low | Is generated or transient content expanding factory context? |

`elasticclaw.config.invalid` additionally reports recognized factory documents that cannot be parsed safely.

The reviewer also reports repository-specific positives when it can prove explicit completion criteria, downstream validation, a consistent dependency graph, scoped permissions, or bounded retries. It does not infer a positive from missing configuration.

## Development

Node.js 22 or newer is required.

```bash
npm install
npm test
```

The test suite builds the TypeScript entrypoint and exercises discovery, strict parsing, every initial review area, observation grouping, deterministic ordering, terminal redaction, and the canonical JSON review protocol.

The fixtures are intentionally small:

- [`test/fixtures/good`](test/fixtures/good) is a clean, bounded factory with the concrete ElasticClaw workspace layout.
- [`test/fixtures/missing-validation`](test/fixtures/missing-validation) shows mutation and publication without a validation boundary.
- The other directories under [`test/fixtures`](test/fixtures) isolate ambiguous goals, permission scope, dependencies, retries, timeouts, agent overlap, model selection, workspace bloat, and PR policy scoping (cross-issue vs scoped).

## Running locally

Build first, then run through the current Adversary CLI:

```bash
npm run build
adversary run . --repo ../some-repository
```

After publishing as `adversarylabs/elasticclaw`:

```bash
adversary run adversarylabs/elasticclaw --repo .
```

The SDK owns grouping, ranking, suppression, and terminal or JSON rendering. The adversary emits structured observations with stable rule IDs and precise file/line evidence.

## v0.1.0 boundaries

This release only reasons about supported declarative factory configuration and the durable Markdown context in ElasticClaw workspace directories. It does not inspect application implementation, execute workflows, infer permissions from prose, or claim validation for unrecognized workflow syntax. These constraints keep early findings high-confidence while real-world usage informs `0.1.1`.

## Automatic detection

`adversary auto` selects the elasticclaw adversary when changes include `.elasticclaw/**` or supported factory files such as `workflow-production.yaml`, plus the other domain-specific patterns declared in `adversary.yaml`. Unrelated changes do not select it.
