import { LineCounter, parseDocument } from "yaml";
import {
  type AgentDefinition,
  type DataMap,
  type FactoryParseResult,
  type GoalDefinition,
  type Location,
  type ParsedFactoryDocument,
  type TaskDefinition,
  type WorkflowDefinition,
  type WorkspaceDefinition,
  asString,
  isRecord,
  stringList,
} from "./model.js";

const EXPLICIT_DOCUMENT_NAMES = /^(?:elasticclaw(?:-config)?|workspace|workflow|goal|agent)\.ya?ml$/i;

export function parseFactoryDocument(path: string, source: string): FactoryParseResult {
  const lineCounter = new LineCounter();
  const parsed = parseDocument(source, { lineCounter, prettyErrors: false, strict: true, uniqueKeys: true });
  if (parsed.errors.length > 0) {
    if (!isExplicitFactoryPath(path) && !looksLikeFactorySource(source)) {
      return { kind: "unsupported" };
    }
    const error = parsed.errors[0];
    const position = error.linePos?.[0] ?? lineCounter.linePos(error.pos[0]);
    return {
      kind: "failure",
      failure: {
        path,
        line: position.line,
        column: position.col,
        message: `YAML ${error.code.toLowerCase().replaceAll("_", " ")}: ${cleanErrorMessage(error.message)}`,
        snippet: source.split(/\r?\n/)[position.line - 1]?.trim() ?? "",
      },
    };
  }

  let raw: unknown;
  try {
    raw = parsed.toJS({ maxAliasCount: 50 });
  } catch (error) {
    return {
      kind: "failure",
      failure: {
        path,
        line: 1,
        message: `The ElasticClaw document could not be normalized safely: ${error instanceof Error ? error.message : "unknown YAML conversion error"}`,
        snippet: source.split(/\r?\n/)[0]?.trim() ?? "",
      },
    };
  }
  if (!isRecord(raw)) {
    return { kind: "unsupported" };
  }

  const document: ParsedFactoryDocument = { workspaces: [], goals: [], workflows: [], agents: [] };
  const basename = path.split("/").pop()?.toLowerCase() ?? "";
  const declaredKind = `${asString(raw.kind) ?? asString(raw.type) ?? ""}`.toLowerCase();

  if (isWorkspaceDocument(basename, declaredKind, raw)) document.workspaces.push(normalizeWorkspace(path, source, raw));
  if (isGoalDocument(basename, declaredKind, raw)) document.goals.push(normalizeGoal(path, source, raw));
  if (isWorkflowDocument(basename, declaredKind, raw)) document.workflows.push(normalizeWorkflow(path, source, raw));
  if (isAgentDocument(basename, declaredKind, raw)) document.agents.push(normalizeAgent(path, source, raw));

  document.workspaces.push(...normalizeCollection(raw.workspaces, (id, item) => normalizeWorkspace(path, source, { ...item, name: item.name ?? id })));
  document.goals.push(...normalizeCollection(raw.goals, (id, item) => normalizeGoal(path, source, { ...item, id: item.id ?? id })));
  document.workflows.push(...normalizeCollection(raw.workflows, (id, item) => normalizeWorkflow(path, source, { ...item, id: item.id ?? id })));
  document.agents.push(...normalizeCollection(raw.agents, (id, item) => normalizeAgent(path, source, { ...item, id: item.id ?? id })));

  deduplicateDocument(document);
  if (document.workspaces.length + document.goals.length + document.workflows.length + document.agents.length === 0) {
    return { kind: "unsupported" };
  }
  return { kind: "document", document };
}

export function workspaceMarkdownAgent(path: string, agentsSource: string, toolsSource?: string): AgentDefinition {
  const parts = path.split("/");
  const workspaceIndex = parts.lastIndexOf("workspaces");
  const id = workspaceIndex >= 0 ? parts[workspaceIndex + 1] ?? "workspace-agent" : parts.at(-2) ?? "workspace-agent";
  const responsibilities = markdownStatements(agentsSource);
  const description = [...responsibilities, ...markdownStatements(toolsSource ?? "")].join(" ");
  return {
    id,
    name: id,
    description,
    responsibilities,
    scope: [],
    raw: { agentsMarkdown: true, toolsDocumented: toolsSource !== undefined },
    source: "workspace-markdown",
    location: { file: path, line: firstContentLine(agentsSource), snippet: lineAt(agentsSource, firstContentLine(agentsSource)) },
  };
}

function normalizeWorkspace(path: string, source: string, raw: DataMap): WorkspaceDefinition {
  const name = asString(raw.name) ?? asString(raw.id) ?? parentDirectory(path) ?? "workspace";
  return {
    id: asString(raw.id) ?? name,
    name,
    repositories: stringList(raw.repositories),
    provider: asString(raw.provider),
    permissions: raw.permissions ?? raw.policy,
    raw,
    location: entityLocation(path, source, name),
  };
}

function normalizeGoal(path: string, source: string, raw: DataMap): GoalDefinition {
  const text = firstString(raw.objective, raw.goal, raw.description, raw.outcome, raw.name) ?? "";
  const id = asString(raw.id) ?? asString(raw.name) ?? slug(text) ?? "goal";
  return {
    id,
    text,
    constraints: combinedLists(raw.constraints, raw.requirements, raw.boundaries),
    artifacts: combinedLists(raw.artifacts, raw.expected_artifacts, raw.outputs, raw.expected_outputs, raw.deliverables),
    completionCriteria: completionCriteria(raw),
    raw,
    location: entityLocation(path, source, id, text),
  };
}

function normalizeWorkflow(path: string, source: string, raw: DataMap): WorkflowDefinition {
  const id = asString(raw.id) ?? asString(raw.name) ?? filenameStem(path);
  const tasksValue = raw.tasks ?? raw.steps ?? raw.jobs;
  const tasks = normalizeCollection(tasksValue, (taskId, item, index) => normalizeTask(path, source, taskId, item, index));
  return {
    id,
    name: asString(raw.name) ?? id,
    description: firstString(raw.description, raw.objective, raw.goal) ?? "",
    completionCriteria: completionCriteria(raw),
    timeout: scalarTimeout(raw.timeout ?? raw.timeout_minutes ?? raw["timeout-minutes"]),
    permissions: raw.permissions ?? raw.policy,
    tasks,
    raw,
    location: entityLocation(path, source, id),
  };
}

function normalizeTask(path: string, source: string, id: string, raw: DataMap, index: number): TaskDefinition {
  const taskId = asString(raw.id) ?? asString(raw.name) ?? (id.length > 0 ? id : `task-${index + 1}`);
  const description = firstString(raw.description, raw.objective, raw.prompt, raw.run, raw.action, raw.name) ?? "";
  return {
    id: taskId,
    name: asString(raw.name) ?? taskId,
    description,
    agent: asString(raw.agent) ?? asString(raw.owner),
    action: asString(raw.action) ?? asString(raw.run) ?? asString(raw.type),
    needs: combinedLists(raw.needs, raw.depends_on, raw.dependencies, raw.after),
    inputs: combinedLists(raw.inputs, raw.consumes, raw.requires),
    outputs: combinedLists(raw.outputs, raw.produces, raw.artifacts),
    timeout: scalarTimeout(raw.timeout ?? raw.timeout_minutes ?? raw["timeout-minutes"]),
    retry: raw.retry ?? raw.retries ?? raw.retry_policy,
    model: asString(raw.model),
    reasoning: asString(raw.reasoning) ?? asString(raw.reasoning_effort),
    permissions: raw.permissions ?? raw.policy,
    raw,
    index,
    location: entityLocation(path, source, taskId, description),
  };
}

function normalizeAgent(path: string, source: string, raw: DataMap): AgentDefinition {
  const id = asString(raw.id) ?? asString(raw.name) ?? filenameStem(path);
  const responsibilities = combinedLists(raw.responsibilities, raw.capabilities, raw.owns, raw.duties);
  return {
    id,
    name: asString(raw.name) ?? id,
    description: firstString(raw.description, raw.role, raw.purpose) ?? responsibilities.join(" "),
    responsibilities,
    scope: combinedLists(raw.scope, raw.paths, raw.repositories, raw.boundaries),
    permissions: raw.permissions ?? raw.tools ?? raw.policy,
    model: asString(raw.model),
    raw,
    source: "yaml",
    location: entityLocation(path, source, id),
  };
}

function normalizeCollection<T>(value: unknown, convert: (id: string, raw: DataMap, index: number) => T): T[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => isRecord(item) ? [convert(asString(item.id) ?? asString(item.name) ?? `item-${index + 1}`, item, index)] : []);
  }
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([id, item], index) => isRecord(item) ? [convert(id, item, index)] : []);
  }
  return [];
}

function completionCriteria(raw: DataMap): string[] {
  return combinedLists(
    raw.completion,
    raw.completion_criteria,
    raw.success_criteria,
    raw.acceptance_criteria,
    raw.done_when,
    raw.validation,
    raw.expected_output,
    raw.expected_outputs,
  );
}

function combinedLists(...values: unknown[]): string[] {
  return [...new Set(values.flatMap(stringList))];
}

function firstString(...values: unknown[]): string | undefined {
  return values.map(asString).find((value) => value !== undefined);
}

function scalarTimeout(value: unknown): number | string | undefined {
  return typeof value === "number" || typeof value === "string" ? value : undefined;
}

function isWorkspaceDocument(basename: string, kind: string, raw: DataMap): boolean {
  return /^(?:elasticclaw(?:-config)?|workspace)\.ya?ml$/i.test(basename) || kind === "workspace" || ("schema_version" in raw && ("repositories" in raw || "provider" in raw));
}

function isGoalDocument(basename: string, kind: string, raw: DataMap): boolean {
  return /^goal(?:-[^.]+)?\.ya?ml$/i.test(basename) || kind === "goal" || ("objective" in raw && !("tasks" in raw || "steps" in raw));
}

function isWorkflowDocument(basename: string, kind: string, raw: DataMap): boolean {
  return /^workflow(?:-[^.]+)?\.ya?ml$/i.test(basename) || kind === "workflow" || "tasks" in raw || "steps" in raw || "jobs" in raw;
}

function isAgentDocument(basename: string, kind: string, raw: DataMap): boolean {
  return /^agent(?:-[^.]+)?\.ya?ml$/i.test(basename) || kind === "agent" || ("responsibilities" in raw && !("tasks" in raw));
}

function isExplicitFactoryPath(path: string): boolean {
  return EXPLICIT_DOCUMENT_NAMES.test(path.split("/").pop() ?? "") || /\.elasticclaw\//.test(path);
}

function looksLikeFactorySource(source: string): boolean {
  return /^\s*(?:schema_version|workspaces|workflows|goals|agents|tasks|responsibilities)\s*:/m.test(source);
}

function entityLocation(path: string, source: string, ...identifiers: string[]): Location {
  const lines = source.split(/\r?\n/);
  for (const identifier of identifiers.filter((value) => value.length > 0)) {
    const escaped = escapeRegExp(identifier.slice(0, 80));
    const index = lines.findIndex((line) => new RegExp(`(?:^|[:\\-]\\s*)["']?${escaped}["']?(?:\\s*$|\\s*#)`, "i").test(line.trim()) || line.includes(identifier));
    if (index >= 0) return { file: path, line: index + 1, snippet: lines[index]?.trim() ?? "" };
  }
  return { file: path, line: 1, snippet: lines[0]?.trim() ?? "" };
}

function markdownStatements(source: string): string[] {
  return source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith("#")).map((line) => line.replace(/^[-*]\s+/, ""));
}

function firstContentLine(source: string): number {
  const index = source.split(/\r?\n/).findIndex((line) => line.trim().length > 0 && !line.trim().startsWith("#"));
  return index < 0 ? 1 : index + 1;
}

function lineAt(source: string, line: number): string {
  return source.split(/\r?\n/)[line - 1]?.trim() ?? "";
}

function cleanErrorMessage(message: string): string {
  return message.replace(/ at line \d+, column \d+.*$/s, "").trim();
}

function filenameStem(path: string): string {
  return (path.split("/").pop() ?? "document").replace(/\.ya?ml$/i, "");
}

function parentDirectory(path: string): string | undefined {
  return path.split("/").at(-2);
}

function slug(value: string): string | undefined {
  const result = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return result.length === 0 ? undefined : result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function deduplicateDocument(document: ParsedFactoryDocument): void {
  document.workspaces = uniqueBy(document.workspaces, (item) => `${item.location.file}:${item.id}`);
  document.goals = uniqueBy(document.goals, (item) => `${item.location.file}:${item.id}`);
  document.workflows = uniqueBy(document.workflows, (item) => `${item.location.file}:${item.id}`);
  document.agents = uniqueBy(document.agents, (item) => `${item.location.file}:${item.id}`);
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
