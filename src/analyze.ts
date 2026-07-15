import { Severity, type RuleContext } from "@adversarylabs/sdk";
import { type FactoryModel, isRecord } from "./model.js";
import { analyzeAgents } from "./rules/agents.js";
import { severityFor, toObservation } from "./rules/definitions.js";
import { analyzeEfficiency } from "./rules/efficiency.js";
import { analyzeGoals } from "./rules/goals.js";
import { isMutationTask, isValidationTask, validationAfterMutation } from "./rules/helpers.js";
import { type Detection } from "./rules/types.js";
import { analyzeWorkflows } from "./rules/workflows.js";

export function analyzeFactory(ctx: RuleContext, model: FactoryModel): void {
  const detections: Detection[] = model.failures.map((failure) => ({
    ruleId: "elasticclaw.config.invalid",
    subject: failure.path,
    groupKey: `elasticclaw.config.invalid:${failure.path}`,
    file: failure.path,
    line: failure.line,
    snippet: failure.snippet,
    label: `${failure.path}:${failure.line}${failure.column === undefined ? "" : `:${failure.column}`} is invalid`,
    data: { error: failure.message, column: failure.column },
  }));
  detections.push(...analyzeGoals(model));
  detections.push(...analyzeAgents(model));
  detections.push(...analyzeWorkflows(model));
  detections.push(...analyzeEfficiency(model));
  detections.sort(compareDetections);
  for (const detection of detections) ctx.observe(toObservation(detection));

  reportPositives(ctx, model, detections);
  reportAssessment(ctx, model, detections);
}

function reportPositives(ctx: RuleContext, model: FactoryModel, detections: Detection[]): void {
  if (model.goals.length > 0 && model.goals.every((goal) => goal.completionCriteria.length > 0 || goal.artifacts.length > 0) &&
      !detections.some((detection) => detection.ruleId === "elasticclaw.goal.ambiguous" || detection.ruleId === "elasticclaw.goal.no-completion")) {
    ctx.review.positive({
      key: "elasticclaw.goals.explicit-completion",
      summary: `Defines concrete completion evidence for all ${model.goals.length} declared goal${model.goals.length === 1 ? "" : "s"}.`,
      evidence: model.goals.slice(0, 5).map((goal) => ({ file: goal.location.file, line: goal.location.line, label: goal.id })),
    });
  }

  const mutatingWorkflows = model.workflows.filter((workflow) => workflow.tasks.some(isMutationTask));
  if (mutatingWorkflows.length > 0 && mutatingWorkflows.every((workflow) =>
    workflow.tasks.filter(isMutationTask).every((mutation) => validationAfterMutation(workflow, mutation) !== undefined)) &&
      !detections.some((detection) => detection.ruleId === "elasticclaw.validation.missing")) {
    ctx.review.positive({
      key: "elasticclaw.validation.after-mutation",
      summary: `Places explicit validation after mutation in all ${mutatingWorkflows.length} state-changing workflow${mutatingWorkflows.length === 1 ? "" : "s"}.`,
      evidence: mutatingWorkflows.slice(0, 5).map((workflow) => ({ file: workflow.location.file, line: workflow.location.line, label: workflow.id })),
    });
  }

  const workflowsWithDependencies = model.workflows.filter((workflow) => workflow.tasks.some((task) => task.needs.length > 0));
  if (workflowsWithDependencies.length > 0 && !detections.some((detection) => detection.ruleId === "elasticclaw.workflow.dependencies")) {
    ctx.review.positive({
      key: "elasticclaw.dependencies.explicit",
      summary: `Uses a consistent explicit dependency graph in ${workflowsWithDependencies.length} workflow${workflowsWithDependencies.length === 1 ? "" : "s"}.`,
      evidence: workflowsWithDependencies.slice(0, 5).map((workflow) => ({ file: workflow.location.file, line: workflow.location.line, label: workflow.id })),
    });
  }

  const explicitPermissions = model.agents.filter((agent) => agent.permissions !== undefined);
  if (explicitPermissions.length > 0 && !detections.some((detection) => detection.ruleId === "elasticclaw.permissions.too-broad")) {
    ctx.review.positive({
      key: "elasticclaw.permissions.scoped",
      summary: `Documents scoped capabilities for ${explicitPermissions.length} agent${explicitPermissions.length === 1 ? "" : "s"} without an evident least-privilege violation.`,
      evidence: explicitPermissions.slice(0, 5).map((agent) => ({ file: agent.location.file, line: agent.location.line, label: agent.id })),
    });
  }

  const retryingTasks = model.workflows.flatMap((workflow) => workflow.tasks).filter((task) => task.retry !== undefined);
  if (retryingTasks.length > 0 && !detections.some((detection) => detection.ruleId === "elasticclaw.retry.unbounded")) {
    ctx.review.positive({
      key: "elasticclaw.retries.bounded",
      summary: `Bounds retry behavior for all ${retryingTasks.length} task${retryingTasks.length === 1 ? "" : "s"} that declare retries.`,
      evidence: retryingTasks.slice(0, 5).map((task) => ({ file: task.location.file, line: task.location.line, label: task.id })),
    });
  }
}

function reportAssessment(ctx: RuleContext, model: FactoryModel, detections: Detection[]): void {
  const hasFactorySurface = model.workspaces.length + model.goals.length + model.workflows.length + model.agents.length > 0;
  if (!hasFactorySurface && model.failures.length === 0) {
    ctx.review.observe({ key: "elasticclaw.factory.none", summary: "No supported ElasticClaw workspace, goal, workflow, or agent definitions were discovered." });
    ctx.review.assessment({ risk: "none", summary: "No ElasticClaw software-factory surface was available for review." });
    ctx.review.opinion({ summary: "Autonomous execution readiness cannot be assessed from this repository." });
    return;
  }
  if (model.workflows.length === 0 && model.goals.length === 0 && detections.length === 0) {
    ctx.review.observe({
      key: "elasticclaw.factory.context-only",
      summary: "The repository defines workspace identity and agent context but no declarative goal or execution workflow to assess.",
    });
    ctx.review.assessment({
      risk: "none",
      summary: "The ElasticClaw workspace context is small and maintainable, but autonomous execution correctness and reliability are not yet evidenced by a workflow.",
    });
    ctx.review.opinion({ summary: "I would review a representative goal and execution workflow before trusting this factory to operate autonomously." });
    return;
  }

  const risk = highestRisk(detections);
  if (risk === "none") {
    ctx.review.assessment({
      risk,
      summary: "The factory has clear goals, bounded execution, explicit validation, and no material maintainability or reliability concerns in the reviewed configuration.",
    });
    ctx.review.opinion({ ship: true, summary: "I would trust this factory to execute the reviewed workflows autonomously." });
  } else if (risk === "low") {
    ctx.review.assessment({
      risk,
      summary: "The factory is operationally coherent with a small number of maintainability or efficiency improvements available.",
    });
    ctx.review.opinion({ ship: true, summary: "I would use this factory with the low-risk improvements scheduled before broader autonomous use." });
  } else {
    ctx.review.assessment({
      risk,
      summary: "The factory has correctness, permission, or validation gaps that weaken its reliability as an autonomous production system.",
    });
    ctx.review.opinion({ ship: false, summary: "I would address the material factory-control findings before trusting autonomous execution." });
  }
}

function highestRisk(detections: Detection[]): "none" | "low" | "medium" | "high" | "critical" {
  const ranks = { info: 0, low: 1, medium: 2, high: 3, critical: 4 } as const;
  let highest: keyof typeof ranks = "info";
  for (const detection of detections) {
    const severity = detection.severity ?? severityFor(detection.ruleId);
    if (ranks[severity] > ranks[highest]) highest = severity;
  }
  return highest === Severity.Info ? "none" : highest;
}

function compareDetections(left: Detection, right: Detection): number {
  return left.ruleId.localeCompare(right.ruleId) || left.file.localeCompare(right.file) || left.line - right.line || left.subject.localeCompare(right.subject);
}
