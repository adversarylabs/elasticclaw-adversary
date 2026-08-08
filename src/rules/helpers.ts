import { type AgentDefinition, type TaskDefinition, type WorkflowDefinition, serialized } from "../model.js";

const MUTATION_PATTERN = /\b(?:edit|write|modify|change|create|delete|commit|push|publish|release|deploy|apply|migrate|upload|merge|open\s+(?:a\s+)?pull request|pull request)\b/i;
const VALIDATION_PATTERN = /\b(?:test|lint|validate|validation|verify|verification|review|check|build|typecheck|scan|audit)\b/i;
const LONG_RUNNING_PATTERN = /\b(?:agent|model|build|test|deploy|publish|release|wait|poll|download|upload|network|external|integration|migration|clone)\b/i;
const DETERMINISTIC_PATTERN = /\b(?:format|prettier|gofmt|json|ya?ml\s+(?:parse|validat)|schema\s+validat|grep|search\s+(?:files|text)|sort|deduplicat|checksum|lint\s+format)\b/i;
const EXPENSIVE_MODEL_PATTERN = /(?:^|[\/:_-])(?:opus|o1|o3|gpt-5(?:\.[0-9]+)?-pro|gpt-5(?:\.[0-9]+)?-thinking|reasoning)(?:$|[\/:_-])/i;

export function taskText(task: TaskDefinition): string {
  return `${task.id} ${task.name} ${task.description} ${task.action ?? ""} ${serialized(task.raw)}`;
}

export function agentText(agent: AgentDefinition): string {
  return `${agent.id} ${agent.name} ${agent.description} ${agent.responsibilities.join(" ")}`;
}

export function isMutationTask(task: TaskDefinition): boolean {
  return MUTATION_PATTERN.test(`${task.id} ${task.name} ${task.description} ${task.action ?? ""}`);
}

export function isValidationTask(task: TaskDefinition): boolean {
  return VALIDATION_PATTERN.test(`${task.id} ${task.name} ${task.description} ${task.action ?? ""}`);
}

export function isLongRunningTask(task: TaskDefinition): boolean {
  return task.agent !== undefined || task.model !== undefined || LONG_RUNNING_PATTERN.test(taskText(task));
}

export function isDeterministicTask(task: TaskDefinition): boolean {
  return DETERMINISTIC_PATTERN.test(taskText(task));
}

export function isExpensiveModel(model: string | undefined, reasoning: string | undefined): boolean {
  return EXPENSIVE_MODEL_PATTERN.test(model ?? "") || /^(?:high|max|extended)$/i.test(reasoning ?? "");
}

export function validationAfterMutation(workflow: WorkflowDefinition, mutation: TaskDefinition): TaskDefinition | undefined {
  const validations = workflow.tasks.filter((task) => isValidationTask(task) && task.index > mutation.index);
  if (validations.length === 0) return undefined;
  const graphIsExplicit = workflow.tasks.some((task) => task.needs.length > 0);
  if (!graphIsExplicit) return validations[0];
  return validations.find((task) => transitiveNeeds(workflow, task).has(mutation.id));
}

export function transitiveNeeds(workflow: WorkflowDefinition, task: TaskDefinition): Set<string> {
  const byId = new Map(workflow.tasks.map((candidate) => [candidate.id, candidate]));
  const result = new Set<string>();
  const pending = [...task.needs];
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined || result.has(id)) continue;
    result.add(id);
    pending.push(...(byId.get(id)?.needs ?? []));
  }
  return result;
}

export function outputReferences(value: unknown): string[] {
  return [...new Set([...serialized(value).matchAll(/\b(?:tasks|steps|jobs)\.([A-Za-z0-9_-]+)\.(?:output|outputs|result|artifacts?)\b/g)]
    .map((match) => match[1])
    .filter((id): id is string => id !== undefined))].sort();
}

export function normalizedArtifacts(values: string[]): Set<string> {
  return new Set(values.map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()).filter((value) => value.length > 0));
}

export function responsibilityCategories(agent: AgentDefinition): string[] {
  const text = agentText(agent);
  const categories = [
    ["review", /\b(?:review|code review|architecture review|approve)\b/i],
    ["implementation", /\b(?:implement|coding|write code|modify code|developer|engineer)\b/i],
    ["release", /\b(?:release|publish|deploy|distribution)\b/i],
    ["validation", /\b(?:test|quality|validation|lint|verify)\b/i],
    ["security", /\b(?:security|vulnerability|threat|audit)\b/i],
    ["documentation", /\b(?:documentation|docs|technical writing)\b/i],
    ["operations", /\b(?:operations|infrastructure|incident|sre|platform)\b/i],
  ] as const;
  return categories.filter(([, pattern]) => pattern.test(text)).map(([category]) => category);
}

export function scopesAreDisjoint(left: AgentDefinition, right: AgentDefinition): boolean {
  if (left.scope.length === 0 || right.scope.length === 0) return false;
  const leftScope = new Set(left.scope.map(normalizeScope));
  const rightScope = new Set(right.scope.map(normalizeScope));
  return [...leftScope].every((scope) => !rightScope.has(scope));
}

function normalizeScope(value: string): string {
  return value.toLowerCase().replace(/[\\/]+$/, "").trim();
}

export function hasUnscopedOnePrPolicy(text: string): boolean {
  if (!text || text.length === 0) return false;
  const t = text.toLowerCase();

  const mentionsOnePrPerRepo =
    /\b(?:one|exactly one|single)\s+open\s+PR\s+per\s+(?:repo|repository)\b/.test(t);
  const mentionsCloseExtras =
    /\bclose the extras\b|\bclose.*(?:other|extra|additional).*PRs?\b/i.test(t) ||
    /if you discover multiple open PRs in one repo/i.test(t);
  const mentionsSoleAdopt =
    /\b(?:sole|only) open PR in the repo\b|\badopt.*(?:the )?sole open PR\b/i.test(t);
  const hasUnscopedCountCheck =
    /open PR count > 1|more than one open PR.*repo|number of open PRs.*(?:>|greater than)/i.test(t) &&
    !/for this issue/i.test(t);

  const hasBad = mentionsOnePrPerRepo || mentionsCloseExtras || mentionsSoleAdopt || hasUnscopedCountCheck;
  if (!hasBad) return false;

  const hasSafeScope =
    /\bfor this (?:issue|ticket)\b/i.test(t) ||
    /leave other issues'? PRs? alone/i.test(t) ||
    /never open a second PR for this issue/i.test(t) ||
    /\bFixes #\d+/i.test(t) ||
    /issue-number.*branch|branch.*with.*issue/i.test(t) ||
    /concurrent .*?(?:agent|issue)s? .*?(?:normal|expected|leave alone)/i.test(t);

  return hasBad && !hasSafeScope;
}
