import { type FactoryModel } from "../model.js";
import { isValidationTask } from "./helpers.js";
import { type Detection } from "./types.js";

const VAGUE_PHRASES = new Set([
  "improve performance",
  "fix the project",
  "fix project",
  "make it better",
  "improve the code",
  "improve quality",
  "optimize everything",
  "clean it up",
]);
const VAGUE_VERB = /\b(?:improve|fix|optimi[sz]e|enhance|clean|refactor|better|moderni[sz]e)\b/i;
const CONCRETE_SIGNAL = /\b(?:by|from|to|under|within|without|must|should|produce|create|return|emit|artifact|file|endpoint|command|test|metric|percent|seconds?|minutes?|version|schema|report|package|image|pull request)\b/i;

export function analyzeGoals(model: FactoryModel): Detection[] {
  const detections: Detection[] = [];
  for (const goal of model.goals) {
    const ambiguityReasons = ambiguousReasons(goal.text, goal.constraints.length, goal.artifacts.length, goal.completionCriteria.length);
    if (ambiguityReasons.length > 0) {
      detections.push({
        ruleId: "elasticclaw.goal.ambiguous",
        subject: goal.id,
        groupKey: "elasticclaw.goal.ambiguous:goals",
        file: goal.location.file,
        line: goal.location.line,
        snippet: goal.location.snippet,
        label: `${goal.id} does not define a concrete outcome`,
        data: { goal: goal.id, objective: goal.text, reasons: ambiguityReasons },
      });
    }
    if (goal.completionCriteria.length === 0 && goal.artifacts.length === 0) {
      detections.push({
        ruleId: "elasticclaw.goal.no-completion",
        subject: goal.id,
        groupKey: "elasticclaw.goal.no-completion:definitions",
        file: goal.location.file,
        line: goal.location.line,
        snippet: goal.location.snippet,
        label: `${goal.id} has no acceptance criteria or expected artifact`,
        data: { type: "goal", goal: goal.id, objective: goal.text },
      });
    }
  }

  for (const workflow of model.workflows) {
    const hasCompletionEvidence = workflow.completionCriteria.length > 0 ||
      workflow.tasks.some((task) => isValidationTask(task)) ||
      workflow.tasks.some((task) => task.outputs.length > 0);
    if (!hasCompletionEvidence) {
      detections.push({
        ruleId: "elasticclaw.goal.no-completion",
        subject: workflow.id,
        groupKey: "elasticclaw.goal.no-completion:definitions",
        file: workflow.location.file,
        line: workflow.location.line,
        snippet: workflow.location.snippet,
        label: `${workflow.id} has no verifiable completion condition`,
        data: { type: "workflow", workflow: workflow.id, taskCount: workflow.tasks.length },
      });
    }
  }
  return detections;
}

function ambiguousReasons(text: string, constraints: number, artifacts: number, completion: number): string[] {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const reasons: string[] = [];
  if (VAGUE_PHRASES.has(normalized)) reasons.push("objective matches a broad improvement phrase");
  if (wordCount > 0 && wordCount < 8 && VAGUE_VERB.test(text) && !CONCRETE_SIGNAL.test(text)) reasons.push("short objective uses a vague improvement verb without an observable target");
  if (text.length === 0) reasons.push("objective text is empty");
  if (reasons.length > 0 && constraints === 0 && artifacts === 0 && completion === 0) reasons.push("no constraints, artifacts, or success criteria narrow the interpretation");
  return [...new Set(reasons)];
}
