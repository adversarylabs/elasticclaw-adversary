export type DataMap = Record<string, unknown>;

export interface Location {
  file: string;
  line: number;
  snippet: string;
}

export interface WorkspaceDefinition {
  id: string;
  name: string;
  repositories: string[];
  provider?: string;
  permissions?: unknown;
  raw: DataMap;
  location: Location;
}

export interface GoalDefinition {
  id: string;
  text: string;
  constraints: string[];
  artifacts: string[];
  completionCriteria: string[];
  raw: DataMap;
  location: Location;
}

export interface TaskDefinition {
  id: string;
  name: string;
  description: string;
  agent?: string;
  action?: string;
  needs: string[];
  inputs: string[];
  outputs: string[];
  timeout?: number | string;
  retry?: unknown;
  model?: string;
  reasoning?: string;
  permissions?: unknown;
  raw: DataMap;
  index: number;
  location: Location;
  fieldLocations: Partial<Record<"description" | "needs" | "inputs" | "outputs" | "retry" | "timeout" | "model", Location>>;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  completionCriteria: string[];
  timeout?: number | string;
  permissions?: unknown;
  tasks: TaskDefinition[];
  raw: DataMap;
  location: Location;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  responsibilities: string[];
  scope: string[];
  permissions?: unknown;
  model?: string;
  raw: DataMap;
  source: "yaml" | "workspace-markdown";
  location: Location;
}

export interface ParseFailure {
  path: string;
  line: number;
  column?: number;
  message: string;
  snippet: string;
}

export interface BloatEntry {
  path: string;
  kind: "directory" | "generated-file";
  reason: string;
}

export interface FactoryModel {
  workspaces: WorkspaceDefinition[];
  goals: GoalDefinition[];
  workflows: WorkflowDefinition[];
  agents: AgentDefinition[];
  failures: ParseFailure[];
  bloat: BloatEntry[];
  candidates: string[];
  contextFiles: string[];
}

export interface ParsedFactoryDocument {
  workspaces: WorkspaceDefinition[];
  goals: GoalDefinition[];
  workflows: WorkflowDefinition[];
  agents: AgentDefinition[];
}

export type FactoryParseResult =
  | { kind: "document"; document: ParsedFactoryDocument }
  | { kind: "unsupported" }
  | { kind: "failure"; failure: ParseFailure };

export function isRecord(value: unknown): value is DataMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function stringList(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim().length === 0 ? [] : [value.trim()];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === "string") return item.trim().length === 0 ? [] : [item.trim()];
      if (isRecord(item)) return [asString(item.description) ?? asString(item.name) ?? JSON.stringify(item)];
      return [];
    });
  }
  if (isRecord(value)) {
    return Object.entries(value).map(([key, item]) => typeof item === "string" ? `${key}: ${item}` : key);
  }
  return [];
}

export function serialized(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value);
}
