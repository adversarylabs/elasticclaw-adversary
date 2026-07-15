import { readFile, readdir } from "node:fs/promises";
import { join, sep } from "node:path";
import { type AgentDefinition, type BloatEntry, type FactoryModel } from "./model.js";
import { parseFactoryDocument, workspaceMarkdownAgent } from "./parser.js";

const MAX_FILES = 7000;
const SKIP_DIRECTORIES = new Set([".git", ".hg", ".svn"]);
const BLOAT_DIRECTORIES = new Map([
  ["node_modules", "dependency installation tree"],
  ["vendor", "vendored dependency tree"],
  ["dist", "generated distribution output"],
  ["build", "generated build output"],
  ["target", "generated compiler output"],
  ["coverage", "generated coverage output"],
  [".cache", "tool cache"],
  [".venv", "Python virtual environment"],
  ["__pycache__", "Python bytecode cache"],
]);
const CONTEXT_FILENAMES = new Set(["AGENTS.md", "IDENTITY.md", "SOUL.md", "TOOLS.md", "MEMORY.md", "USER.md"]);

export async function discoverFactory(repoPath: string): Promise<FactoryModel> {
  const inventory = await inventoryRepository(repoPath);
  const model: FactoryModel = {
    workspaces: [],
    goals: [],
    workflows: [],
    agents: [],
    failures: [],
    bloat: inventory.bloat,
    candidates: inventory.files.filter(isFactoryYamlCandidate).sort(),
    contextFiles: inventory.files.filter(isWorkspaceContextFile).sort(),
  };

  for (const path of model.candidates) {
    const source = await readFile(join(repoPath, path), "utf8");
    const result = parseFactoryDocument(path, source);
    if (result.kind === "failure") model.failures.push(result.failure);
    if (result.kind === "document") {
      model.workspaces.push(...result.document.workspaces);
      model.goals.push(...result.document.goals);
      model.workflows.push(...result.document.workflows);
      model.agents.push(...result.document.agents);
    }
  }

  model.agents.push(...await markdownAgents(repoPath, model.contextFiles));
  model.workspaces.sort(byLocation);
  model.goals.sort(byLocation);
  model.workflows.sort(byLocation);
  model.agents = deduplicateAgents(model.agents.sort(byLocation));
  model.failures.sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line);
  return model;
}

async function inventoryRepository(root: string): Promise<{ files: string[]; bloat: BloatEntry[] }> {
  const files: string[] = [];
  const bloat: BloatEntry[] = [];

  async function visit(relativeDirectory: string): Promise<void> {
    if (files.length >= MAX_FILES) return;
    const entries = await readdir(join(root, relativeDirectory), { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (files.length >= MAX_FILES) return;
      const relativePath = toPosix(relativeDirectory.length === 0 ? entry.name : join(relativeDirectory, entry.name));
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        const reason = BLOAT_DIRECTORIES.get(entry.name);
        if (reason !== undefined && isInsideWorkspace(relativePath)) {
          bloat.push({ path: relativePath, kind: "directory", reason });
          continue;
        }
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "target" || entry.name === "vendor") continue;
        await visit(relativePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
        if (isInsideWorkspace(relativePath) && isGeneratedFile(relativePath)) {
          bloat.push({ path: relativePath, kind: "generated-file", reason: "generated or transient file" });
        }
      }
    }
  }

  await visit("");
  return { files: files.sort(), bloat: bloat.sort((left, right) => left.path.localeCompare(right.path)) };
}

function isFactoryYamlCandidate(path: string): boolean {
  const basename = path.split("/").pop()?.toLowerCase() ?? "";
  if (!/\.ya?ml$/.test(basename)) return false;
  return path.startsWith(".elasticclaw/") || /^(?:elasticclaw(?:-config)?|workspace|workflow|goal|agent)(?:-[^.]+)?\.ya?ml$/.test(basename);
}

function isWorkspaceContextFile(path: string): boolean {
  return path.startsWith(".elasticclaw/workspaces/") && CONTEXT_FILENAMES.has(path.split("/").pop() ?? "");
}

async function markdownAgents(repoPath: string, contextFiles: string[]): Promise<AgentDefinition[]> {
  const agentsFiles = contextFiles.filter((path) => path.endsWith("/AGENTS.md"));
  const agents: AgentDefinition[] = [];
  for (const path of agentsFiles) {
    const directory = path.slice(0, path.lastIndexOf("/"));
    const toolsPath = `${directory}/TOOLS.md`;
    const agentsSource = await readFile(join(repoPath, path), "utf8");
    const toolsSource = contextFiles.includes(toolsPath) ? await readFile(join(repoPath, toolsPath), "utf8") : undefined;
    agents.push(workspaceMarkdownAgent(path, agentsSource, toolsSource));
  }
  return agents;
}

function deduplicateAgents(agents: AgentDefinition[]): AgentDefinition[] {
  const seen = new Set<string>();
  return agents.filter((agent) => {
    const key = `${agent.location.file}:${agent.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isInsideWorkspace(path: string): boolean {
  return path.startsWith(".elasticclaw/workspaces/");
}

function isGeneratedFile(path: string): boolean {
  const filename = path.split("/").pop() ?? "";
  return /(?:\.log|\.tmp|\.swp|\.map|\.pyc|\.DS_Store)$/i.test(filename);
}

function byLocation(left: { location: { file: string; line: number } }, right: { location: { file: string; line: number } }): number {
  return left.location.file.localeCompare(right.location.file) || left.location.line - right.location.line;
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}
