import { type FactoryModel, type TaskDefinition, type WorkflowDefinition } from "../model.js";
import {
  isLongRunningTask,
  isMutationTask,
  isValidationTask,
  normalizedArtifacts,
  outputReferences,
  validationAfterMutation,
} from "./helpers.js";
import { type Detection } from "./types.js";

export function analyzeWorkflows(model: FactoryModel): Detection[] {
  const detections: Detection[] = [];
  for (const workflow of model.workflows) {
    detections.push(...dependencies(workflow));
    detections.push(...validation(workflow));
    detections.push(...retries(workflow));
    detections.push(...timeouts(workflow));
  }
  return detections;
}

function dependencies(workflow: WorkflowDefinition): Detection[] {
  const detections: Detection[] = [];
  const byId = new Map(workflow.tasks.map((task) => [task.id, task]));
  const producers = new Map<string, string[]>();
  for (const task of workflow.tasks) {
    for (const output of normalizedArtifacts(task.outputs)) producers.set(output, [...(producers.get(output) ?? []), task.id]);
  }

  for (const task of workflow.tasks) {
    for (const dependency of task.needs) {
      if (!byId.has(dependency)) {
        detections.push(dependencyDetection(workflow, task, "needs", `depends on missing task ${dependency}`, { issue: "missing-task", dependency }));
      }
    }
    for (const producer of outputReferences(task.raw)) {
      if (byId.has(producer) && !task.needs.includes(producer)) {
        detections.push(dependencyDetection(workflow, task, "description", `uses ${producer} output without declaring the dependency`, { issue: "undeclared-output-dependency", producer }));
      }
    }
    for (const input of normalizedArtifacts(task.inputs)) {
      const matching = producers.get(input) ?? [];
      if (matching.length === 1 && matching[0] !== task.id && !task.needs.includes(matching[0] ?? "")) {
        detections.push(dependencyDetection(workflow, task, "inputs", `consumes ${input} without depending on its producer`, {
          issue: "artifact-without-dependency",
          artifact: input,
          producer: matching[0],
        }));
      }
    }
  }
  return detections;
}

function validation(workflow: WorkflowDefinition): Detection[] {
  const mutations = workflow.tasks.filter(isMutationTask);
  if (mutations.length === 0) return [];
  const validations = workflow.tasks.filter(isValidationTask);
  const uncovered = mutations.filter((mutation) => validationAfterMutation(workflow, mutation) === undefined);
  if (uncovered.length === 0) return [];
  const first = uncovered[0];
  if (first === undefined) return [];
  return [{
    ruleId: "elasticclaw.validation.missing",
    subject: workflow.id,
    groupKey: `elasticclaw.validation.missing:${workflow.location.file}:${workflow.id}`,
    file: first.location.file,
    line: first.location.line,
    snippet: first.location.snippet,
    label: `${workflow.id} can mutate state without downstream validation`,
    data: {
      workflow: workflow.id,
      mutatingTasks: uncovered.map((task) => task.id),
      validationTasks: validations.map((task) => task.id),
      dependencyGraphExplicit: workflow.tasks.some((task) => task.needs.length > 0),
    },
  }];
}

function retries(workflow: WorkflowDefinition): Detection[] {
  return workflow.tasks.flatMap((task) => {
    const reason = unboundedRetryReason(task);
    if (reason === undefined) return [];
    return [{
      ruleId: "elasticclaw.retry.unbounded" as const,
      subject: task.id,
      groupKey: "elasticclaw.retry.unbounded:tasks",
      file: task.location.file,
      line: task.location.line,
      snippet: task.location.snippet,
      label: `${workflow.id}/${task.id} has an unbounded retry policy`,
      data: { workflow: workflow.id, task: task.id, retry: task.retry, reason },
    }];
  });
}

function timeouts(workflow: WorkflowDefinition): Detection[] {
  if (workflow.timeout !== undefined) return [];
  return workflow.tasks.filter((task) => isLongRunningTask(task) && task.timeout === undefined).map((task) => ({
    ruleId: "elasticclaw.timeout.missing",
    subject: task.id,
    groupKey: "elasticclaw.timeout.missing:tasks",
    file: task.location.file,
    line: task.location.line,
    snippet: task.location.snippet,
    label: `${workflow.id}/${task.id} has no timeout`,
    data: { workflow: workflow.id, task: task.id, agent: task.agent, model: task.model },
  }));
}

function dependencyDetection(
  workflow: WorkflowDefinition,
  task: TaskDefinition,
  field: "description" | "needs" | "inputs",
  label: string,
  data: Record<string, unknown>,
): Detection {
  const location = task.fieldLocations[field] ?? task.location;
  return {
    ruleId: "elasticclaw.workflow.dependencies",
    subject: task.id,
    groupKey: `elasticclaw.workflow.dependencies:${workflow.location.file}:${workflow.id}`,
    file: location.file,
    line: location.line,
    snippet: location.snippet,
    label: `${workflow.id}/${task.id} ${label}`,
    data: { workflow: workflow.id, task: task.id, declaredNeeds: task.needs, ...data },
  };
}

function unboundedRetryReason(task: TaskDefinition): string | undefined {
  const value = task.retry;
  if (value === undefined) {
    return /\b(?:retry forever|retry indefinitely|while\s+true|until success)\b/i.test(`${task.description} ${task.action ?? ""}`)
      ? "task text explicitly retries without a limit"
      : undefined;
  }
  if (typeof value === "string" && /^(?:forever|unlimited|infinite|until-success)$/i.test(value.trim())) return "retry value is explicitly unlimited";
  if (typeof value === "number" && value < 0) return "negative retry count represents no limit";
  if (typeof value === "object" && value !== null) {
    const text = JSON.stringify(value);
    const enabled = /"(?:enabled|retry)":true/i.test(text);
    const bounded = /"(?:max|max_attempts|attempts|limit|count)":\s*\d+/i.test(text) || /"(?:timeout|max_duration)"/i.test(text);
    if (enabled && !bounded) return "retry policy is enabled without an attempt or duration bound";
  }
  return undefined;
}
