import { type FactoryModel } from "../model.js";
import { isDeterministicTask, isExpensiveModel } from "./helpers.js";
import { type Detection } from "./types.js";

export function analyzeEfficiency(model: FactoryModel): Detection[] {
  const detections: Detection[] = model.bloat.map((entry) => ({
    ruleId: "elasticclaw.workspace.bloat",
    subject: entry.path,
    groupKey: "elasticclaw.workspace.bloat:paths",
    file: entry.path,
    line: 1,
    snippet: entry.path,
    label: `${entry.path} is avoidable workspace context`,
    data: { path: entry.path, kind: entry.kind, reason: entry.reason },
  }));

  const agents = new Map(model.agents.map((agent) => [agent.id, agent]));
  for (const workflow of model.workflows) {
    for (const task of workflow.tasks) {
      const agentModel = task.agent === undefined ? undefined : agents.get(task.agent)?.model;
      const modelName = task.model ?? agentModel;
      if (isDeterministicTask(task) && isExpensiveModel(modelName, task.reasoning)) {
        detections.push({
          ruleId: "elasticclaw.model.overkill",
          subject: task.id,
          groupKey: "elasticclaw.model.overkill:tasks",
          file: task.location.file,
          line: task.location.line,
          snippet: task.location.snippet,
          label: `${workflow.id}/${task.id} uses ${modelName ?? `reasoning:${task.reasoning}`} for deterministic work`,
          data: { workflow: workflow.id, task: task.id, model: modelName, reasoning: task.reasoning, operation: task.description || task.action },
        });
      }
    }
  }
  return detections;
}
