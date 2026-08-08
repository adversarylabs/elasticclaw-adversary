import { Adversary, Confidence, Severity, type ObservationInit } from "@adversarylabs/sdk";
import { type Detection, type RuleId } from "./types.js";

interface RuleLanguage {
  id: RuleId;
  category: string;
  severity: (typeof Severity)[keyof typeof Severity];
  confidence: (typeof Confidence)[keyof typeof Confidence];
  title: { singular: string; plural: string };
  summary: (count: number) => string;
  whyItMatters: string;
  impact: string;
  recommendation: string;
  complexity: "trivial" | "small" | "medium" | "large";
  tags: string[];
}

const RULES: RuleLanguage[] = [
  {
    id: "elasticclaw.config.invalid",
    category: "correctness",
    severity: Severity.Medium,
    confidence: Confidence.High,
    title: { singular: "ElasticClaw document is invalid", plural: "ElasticClaw documents are invalid" },
    summary: (count) => `${count} ElasticClaw document${count === 1 ? " cannot" : "s cannot"} be parsed safely.`,
    whyItMatters: "Factory policy is only enforceable when the automation platform can load its configuration deterministically.",
    impact: "Goals, permissions, or execution steps in the malformed document may be skipped or fail before work begins.",
    recommendation: "Fix the reported YAML error and validate the document with the ElasticClaw schema before enabling autonomous execution.",
    complexity: "small",
    tags: ["configuration", "correctness"],
  },
  {
    id: "elasticclaw.goal.ambiguous",
    category: "maintainability",
    severity: Severity.Low,
    confidence: Confidence.High,
    title: { singular: "Goal does not define a concrete outcome", plural: "Goals do not define concrete outcomes" },
    summary: (count) => `${count} goal${count === 1 ? " uses" : "s use"} vague language without enough outcome, constraint, or artifact detail to guide autonomous work.`,
    whyItMatters: "Agents optimize for the instructions they receive; an ambiguous objective permits incompatible interpretations that are all superficially valid.",
    impact: "The factory can spend time on broad refactoring or report completion without delivering the change the operator intended.",
    recommendation: "State the observable outcome, relevant constraints, expected artifacts, and the boundary of work that should not change.",
    complexity: "small",
    tags: ["goals", "maintainability"],
  },
  {
    id: "elasticclaw.goal.no-completion",
    category: "correctness",
    severity: Severity.Medium,
    confidence: Confidence.High,
    title: { singular: "Goal or workflow has no completion contract", plural: "Goals or workflows have no completion contracts" },
    summary: (count) => `${count} goal or workflow definition${count === 1 ? " lacks" : "s lack"} explicit acceptance criteria, expected output, or a verifiable done condition.`,
    whyItMatters: "Autonomous work needs a deterministic stopping condition that is independent of an agent's subjective confidence.",
    impact: "Execution may stop too early, loop on open-ended improvement, or claim success without producing an acceptable artifact.",
    recommendation: "Add explicit acceptance criteria and identify the tests, validation result, or expected artifact that proves completion.",
    complexity: "small",
    tags: ["goals", "completion", "correctness"],
  },
  {
    id: "elasticclaw.permissions.too-broad",
    category: "security",
    severity: Severity.Medium,
    confidence: Confidence.High,
    title: { singular: "Agent or task has excessive permissions", plural: "Agents or tasks have excessive permissions" },
    summary: (count) => `${count} execution principal${count === 1 ? " has" : "s have"} permissions broader than the evidenced responsibility requires.`,
    whyItMatters: "A mistaken or compromised agent can only be contained by the capabilities the factory withholds from it.",
    impact: "Read-only review or deterministic validation work may be able to modify repositories, run unrestricted commands, access secrets, or reach arbitrary networks.",
    recommendation: "Grant the minimum permissions required, scope write and secret access to the exact mutating step, and prefer allowlists over unrestricted capabilities.",
    complexity: "medium",
    tags: ["permissions", "least-privilege", "security"],
  },
  {
    id: "elasticclaw.workflow.dependencies",
    category: "correctness",
    severity: Severity.Medium,
    confidence: Confidence.High,
    title: { singular: "Workflow dependency graph is inconsistent", plural: "Workflow dependency graphs are inconsistent" },
    summary: (count) => `${count} task dependency relationship${count === 1 ? " is" : "s are"} inconsistent with declared producers, consumed outputs, or available tasks.`,
    whyItMatters: "A software factory must make producer-consumer ordering explicit whenever tasks exchange artifacts or state.",
    impact: "Consumers can run before inputs exist, remain blocked on missing tasks, or use stale outputs from a previous execution.",
    recommendation: "Declare the actual producer dependencies and keep unrelated tasks parallel; do not rely on incidental list order for artifact or state handoff.",
    complexity: "small",
    tags: ["workflow", "dependencies", "correctness"],
  },
  {
    id: "elasticclaw.agent.overlap",
    category: "maintainability",
    severity: Severity.Low,
    confidence: Confidence.High,
    title: { singular: "Agent ownership overlaps another agent", plural: "Agent ownership overlaps across agents" },
    summary: (count) => `${count} agent responsibility declaration${count === 1 ? " overlaps" : "s overlap"} without a distinguishing scope or handoff boundary.`,
    whyItMatters: "Multiple owners for the same responsibility make routing and accountability ambiguous.",
    impact: "The factory may duplicate work, produce competing edits, or leave failures unresolved because each agent assumes another owns the boundary.",
    recommendation: "Give one agent primary ownership or define disjoint repository, path, phase, or artifact scopes with an explicit handoff.",
    complexity: "small",
    tags: ["agents", "ownership", "maintainability"],
  },
  {
    id: "elasticclaw.pr-policy.cross-issue",
    category: "reliability",
    severity: Severity.Medium,
    confidence: Confidence.High,
    title: { singular: "Repo-wide one-PR rule lacks issue scope", plural: "Repo-wide one-PR rules lack issue scope" },
    summary: (count) => `${count} instruction${count === 1 ? "" : "s"} or prompt${count === 1 ? " enforces" : "s enforce"} a single open PR per repository without scoping to the current issue.`,
    whyItMatters: "When multiple agents run concurrent issues against the same repository, unscoped one-PR policies cause them to close, rewrite, or force-push each other's pull requests.",
    impact: "Work for separate issues is lost to thrashing instead of proceeding independently.",
    recommendation: "Scope every one-PR rule to the current issue only (\"one open PR per repository for this issue\"). Explicitly tell agents to leave PRs belonging to other issues alone. Use Fixes #N, issue-numbered branches, and notes that concurrent agents on other issues are normal.",
    complexity: "small",
    tags: ["agents", "pull-requests", "concurrency", "reliability"],
  },
  {
    id: "elasticclaw.validation.missing",
    category: "reliability",
    severity: Severity.High,
    confidence: Confidence.High,
    title: { singular: "State mutation has no validation boundary", plural: "State mutations have no validation boundaries" },
    summary: (count) => `${count} mutating workflow path${count === 1 ? " can finish" : "s can finish"} without tests, build, review, lint, or another explicit validation step.`,
    whyItMatters: "Autonomous mutation is trustworthy only when a separate signal verifies the resulting state before it is committed, published, or deployed.",
    impact: "The factory can persist or release broken changes while still reporting successful execution.",
    recommendation: "Add an explicit validation task after mutation and make commit, publish, or deployment depend on that successful validation result.",
    complexity: "medium",
    tags: ["validation", "mutation", "reliability"],
  },
  {
    id: "elasticclaw.retry.unbounded",
    category: "reliability",
    severity: Severity.Medium,
    confidence: Confidence.High,
    title: { singular: "Retry or recursion is unbounded", plural: "Retries or recursion are unbounded" },
    summary: (count) => `${count} task${count === 1 ? " can retry" : "s can retry"} without an attempt, time, or recursion limit.`,
    whyItMatters: "Automation needs a bounded failure mode when an external dependency or agent strategy cannot make progress.",
    impact: "A persistent failure can consume model budget and runners indefinitely while hiding the underlying operational issue.",
    recommendation: "Set a small maximum attempt count, use backoff where appropriate, and define the error that is surfaced when the budget is exhausted.",
    complexity: "small",
    tags: ["retries", "reliability", "cost"],
  },
  {
    id: "elasticclaw.timeout.missing",
    category: "reliability",
    severity: Severity.Low,
    confidence: Confidence.High,
    title: { singular: "Long-running task has no timeout", plural: "Long-running tasks have no timeouts" },
    summary: (count) => `${count} agent, build, test, publish, deploy, wait, or external-operation task${count === 1 ? " has" : "s have"} no explicit timeout.`,
    whyItMatters: "Agent calls and external systems can stall independently of retry policy.",
    impact: "A single stuck task can occupy factory capacity and prevent completion or rollback indefinitely.",
    recommendation: "Set a timeout based on the expected operation and define how the workflow fails or recovers when it expires.",
    complexity: "trivial",
    tags: ["timeouts", "reliability"],
  },
  {
    id: "elasticclaw.model.overkill",
    category: "efficiency",
    severity: Severity.Info,
    confidence: Confidence.Medium,
    title: { singular: "Reasoning model is unnecessary for deterministic work", plural: "Reasoning models are unnecessary for deterministic work" },
    summary: (count) => `${count} deterministic formatting, parsing, search, or schema-validation task${count === 1 ? " uses" : "s use"} an expensive reasoning model.`,
    whyItMatters: "Deterministic tools are faster, cheaper, reproducible, and easier to debug for mechanical transformations and checks.",
    impact: "The factory spends model budget and time while introducing variance into work that has a precise algorithmic answer.",
    recommendation: "Use the formatter, parser, schema validator, or search tool directly and reserve reasoning models for ambiguous engineering decisions.",
    complexity: "small",
    tags: ["models", "efficiency", "cost"],
  },
  {
    id: "elasticclaw.workspace.bloat",
    category: "efficiency",
    severity: Severity.Low,
    confidence: Confidence.High,
    title: { singular: "Workspace contains avoidable generated context", plural: "Workspaces contain avoidable generated context" },
    summary: (count) => `${count} generated file, dependency tree, cache, vendor, or build-output path${count === 1 ? " is" : "s are"} stored inside ElasticClaw workspace context.`,
    whyItMatters: "Workspace files compete for discovery time, context budget, indexing, backup, and operator attention.",
    impact: "Agents can inspect stale or irrelevant content, context assembly becomes slower, and workspace snapshots become unnecessarily large.",
    recommendation: "Move generated outputs and dependency caches outside the workspace or exclude them explicitly; keep only durable instructions and state required by agents.",
    complexity: "small",
    tags: ["workspace", "context", "efficiency"],
  },
];

const RULE_MAP = new Map(RULES.map((rule) => [rule.id, rule]));

export function registerRules(app: Adversary): void {
  for (const rule of RULES) {
    app.defineRule({
      id: rule.id,
      category: rule.category,
      defaultSeverity: rule.severity,
      defaultConfidence: rule.confidence,
      aggregate(observations) {
        return {
          title: observations.length === 1 ? rule.title.singular : rule.title.plural,
          category: rule.category,
          summary: rule.summary(observations.length),
          whyItMatters: rule.whyItMatters,
          impact: rule.impact,
          recommendation: rule.recommendation,
          remediation: { complexity: rule.complexity },
          tags: rule.tags,
          confidence: highestConfidence(observations, rule.confidence),
        };
      },
    });
  }
}

export function toObservation(detection: Detection): ObservationInit {
  const rule = RULE_MAP.get(detection.ruleId);
  if (rule === undefined) throw new Error(`Unknown ElasticClaw rule ${detection.ruleId}.`);
  return {
    ruleId: detection.ruleId,
    subject: detection.subject,
    groupKey: detection.groupKey,
    title: rule.title,
    category: rule.category,
    severity: detection.severity,
    confidence: detection.confidence,
    confidenceAggregation: "maximum",
    severityAggregation: "highest",
    location: { file: detection.file, line: detection.line, snippet: detection.snippet, label: detection.label },
    evidence: { label: detection.label, ...detection.data },
    tags: rule.tags,
  };
}

export function severityFor(ruleId: RuleId): (typeof Severity)[keyof typeof Severity] {
  const rule = RULE_MAP.get(ruleId);
  if (rule === undefined) throw new Error(`Unknown ElasticClaw rule ${ruleId}.`);
  return rule.severity;
}

function highestConfidence(observations: ReadonlyArray<ObservationInit>, fallback: (typeof Confidence)[keyof typeof Confidence]) {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  let highest: (typeof Confidence)[keyof typeof Confidence] = Confidence.Low;
  for (const observation of observations) {
    const confidence = typeof observation.confidence === "string" ? observation.confidence : fallback;
    if (rank[confidence] > rank[highest]) highest = confidence;
  }
  return highest;
}
