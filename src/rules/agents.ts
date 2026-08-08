import { Confidence } from "@adversarylabs/sdk";
import { type AgentDefinition, type FactoryModel, serialized } from "../model.js";
import { agentText, hasUnscopedOnePrPolicy, responsibilityCategories, scopesAreDisjoint } from "./helpers.js";
import { type Detection } from "./types.js";

export function analyzeAgents(model: FactoryModel): Detection[] {
  return [
    ...permissionDetections(model),
    ...overlapDetections(model.agents.filter((agent) => agent.source === "yaml")),
    ...prPolicyDetections(model),
  ];
}

function permissionDetections(model: FactoryModel): Detection[] {
  const detections: Detection[] = [];
  for (const agent of model.agents) {
    if (agent.permissions === undefined) continue;
    const reasons = broadPermissionReasons(agent.permissions, agentText(agent));
    if (reasons.length > 0) detections.push(permissionDetection(agent, reasons));
  }
  for (const workflow of model.workflows) {
    for (const task of workflow.tasks) {
      if (task.permissions === undefined) continue;
      const reasons = broadPermissionReasons(task.permissions, `${task.id} ${task.name} ${task.description}`);
      if (reasons.length > 0) {
        detections.push({
          ruleId: "elasticclaw.permissions.too-broad",
          subject: `${workflow.id}/${task.id}`,
          groupKey: "elasticclaw.permissions.too-broad:principals",
          file: task.location.file,
          line: task.location.line,
          snippet: task.location.snippet,
          label: `${workflow.id}/${task.id} has capabilities broader than its task description`,
          data: { type: "task", workflow: workflow.id, task: task.id, reasons },
        });
      }
    }
  }
  return detections;
}

function overlapDetections(agents: AgentDefinition[]): Detection[] {
  const byCategory = new Map<string, Set<AgentDefinition>>();
  for (let leftIndex = 0; leftIndex < agents.length; leftIndex += 1) {
    const left = agents[leftIndex];
    if (left === undefined) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < agents.length; rightIndex += 1) {
      const right = agents[rightIndex];
      if (right === undefined || left.id === right.id || scopesAreDisjoint(left, right)) continue;
      const shared = responsibilityCategories(left).filter((category) => responsibilityCategories(right).includes(category));
      for (const category of shared) {
        byCategory.set(category, new Set([...(byCategory.get(category) ?? []), left, right]));
      }
    }
  }

  const detections: Detection[] = [];
  for (const [category, owners] of [...byCategory.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    for (const agent of [...owners].sort((left, right) => left.id.localeCompare(right.id))) {
      detections.push({
        ruleId: "elasticclaw.agent.overlap",
        subject: agent.id,
        groupKey: `elasticclaw.agent.overlap:${category}`,
        file: agent.location.file,
        line: agent.location.line,
        snippet: agent.location.snippet,
        label: `${agent.id} shares ${category} ownership with ${[...owners].filter((owner) => owner !== agent).map((owner) => owner.id).sort().join(", ")}`,
        data: { agent: agent.id, responsibility: category, overlappingAgents: [...owners].map((owner) => owner.id).sort(), scope: agent.scope },
      });
    }
  }
  return detections;
}

function broadPermissionReasons(permissions: unknown, responsibility: string): string[] {
  const text = serialized(permissions).toLowerCase();
  const readOnlyResponsibility = /\b(?:review|inspect|analy[sz]e|research|plan|advis|read-only)\b/i.test(responsibility) &&
    !/\b(?:implement|edit|write|commit|publish|deploy|release|fix)\b/i.test(responsibility);
  const releaseResponsibility = /\b(?:publish|deploy|release|secret|credential|integration)\b/i.test(responsibility);
  const networkResponsibility = /\b(?:network|download|external|api|deploy|publish|release)\b/i.test(responsibility);
  const reasons: string[] = [];
  if (/"(?:all|unrestricted|root|\*)"|"allow_all":true|"full_access":true/.test(text)) reasons.push("contains an unrestricted or wildcard capability");
  if (readOnlyResponsibility && /"(?:write|git_write|push|commit)"\s*:\s*(?:true|"(?:all|\*|write|rw|unrestricted)")|"write"\s*:\s*\[[^\]]+\]/.test(text)) {
    reasons.push("read-only responsibility is granted filesystem or repository write access");
  }
  if (!releaseResponsibility && /"secrets?"\s*:\s*(?:true|"(?:all|\*)"|\[[^\]]+\])/.test(text)) reasons.push("secret access is not supported by a release, deployment, or integration responsibility");
  if (!networkResponsibility && /"network"\s*:\s*(?:true|"(?:all|\*|unrestricted)"|\[[^\]]*"\*"[^\]]*\])/.test(text)) reasons.push("unrestricted network access is not supported by the responsibility");
  return [...new Set(reasons)];
}

function permissionDetection(agent: AgentDefinition, reasons: string[]): Detection {
  return {
    ruleId: "elasticclaw.permissions.too-broad",
    subject: agent.id,
    groupKey: "elasticclaw.permissions.too-broad:principals",
    confidence: reasons.some((reason) => reason.includes("responsibility")) ? Confidence.High : Confidence.Medium,
    file: agent.location.file,
    line: agent.location.line,
    snippet: agent.location.snippet,
    label: `${agent.id} has capabilities broader than its documented responsibility`,
    data: { type: "agent", agent: agent.id, reasons },
  };
}

function prPolicyDetections(model: FactoryModel): Detection[] {
  const detections: Detection[] = [];

  for (const agent of model.agents) {
    if (hasUnscopedOnePrPolicy(agentText(agent))) {
      detections.push({
        ruleId: "elasticclaw.pr-policy.cross-issue",
        subject: agent.id,
        groupKey: "elasticclaw.pr-policy.cross-issue:instructions",
        file: agent.location.file,
        line: agent.location.line,
        snippet: agent.location.snippet,
        label: `${agent.id} instructions or description enforce a repo-wide one-PR rule without issue scoping`,
        data: { type: "agent", agent: agent.id },
      });
    }
  }

  for (const workflow of model.workflows) {
    for (const task of workflow.tasks) {
      const text = `${task.id} ${task.name} ${task.description} ${task.action ?? ""} ${serialized(task.raw ?? {})}`;
      if (hasUnscopedOnePrPolicy(text)) {
        detections.push({
          ruleId: "elasticclaw.pr-policy.cross-issue",
          subject: `${workflow.id}/${task.id}`,
          groupKey: "elasticclaw.pr-policy.cross-issue:instructions",
          file: task.location.file,
          line: task.location.line,
          snippet: task.location.snippet,
          label: `${workflow.id}/${task.id} prompt or description contains repo-wide one-PR policy without issue scoping`,
          data: { type: "task", workflow: workflow.id, task: task.id },
        });
      }
    }
  }

  return detections;
}
