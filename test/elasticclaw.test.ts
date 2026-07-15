import assert from "node:assert/strict";
import test from "node:test";
import {
  REVIEW_RESULT_SCHEMA_VERSION,
  TerminalRenderer,
  createAdversaryRunEnvelope,
} from "@adversarylabs/sdk";
import { createApp } from "../src/index.ts";
import { discoverFactory } from "../src/discover.ts";

function fixturePath(name: string): string {
  return new URL(`./fixtures/${name}`, import.meta.url).pathname;
}

async function review(name: string, options: { raw?: boolean; informational?: boolean } = {}) {
  return createApp().run({
    input: { source: { path: fixturePath(name) } },
    includeRawObservations: options.raw,
    review: { includeInformational: options.informational },
  });
}

test("discovers the concrete ElasticClaw workspace layout and ignores unrelated YAML", async () => {
  const good = await discoverFactory(fixturePath("good"));
  assert.deepEqual(good.workspaces.map((workspace) => workspace.name), ["platform"]);
  assert.deepEqual(good.goals.map((goal) => goal.id), ["reduce-api-latency"]);
  assert.deepEqual(good.workflows.map((workflow) => workflow.id), ["optimize-api"]);
  assert.deepEqual(good.agents.map((agent) => agent.id), ["platform", "implementer", "validator"]);
  assert.equal(good.contextFiles.length, 2);

  const unrelated = await discoverFactory(fixturePath("unrelated"));
  assert.deepEqual(unrelated.candidates, [".elasticclaw/notes.yaml", ".elasticclaw/settings.yaml"]);
  assert.equal(unrelated.workspaces.length + unrelated.goals.length + unrelated.workflows.length + unrelated.agents.length, 0);
  assert.equal(unrelated.failures.length, 0);
});

test("ambiguous goals report concrete reasons and precise evidence", async () => {
  const output = await review("ambiguous-goal");
  const finding = output.findings.find((item) => item.ruleId === "elasticclaw.goal.ambiguous");
  assert.ok(finding);
  assert.equal(finding.evidence[0]?.location?.file, "goal.yml");
  assert.equal(finding.evidence[0]?.location?.line, 3);
  assert.match(JSON.stringify(finding.evidence[0]?.data?.reasons), /vague|observable target/);
});

test("goals without acceptance criteria or expected artifacts are reported", async () => {
  const output = await review("missing-completion");
  const finding = output.findings.find((item) => item.ruleId === "elasticclaw.goal.no-completion");
  assert.ok(finding);
  assert.equal(finding.evidence[0]?.data?.type, "goal");
  assert.equal(output.opinion?.ship, false);
});

test("mutating workflows require a downstream validation boundary", async () => {
  const output = await review("missing-validation");
  const finding = output.findings.find((item) => item.ruleId === "elasticclaw.validation.missing");
  assert.ok(finding);
  assert.equal(finding.severity, "high");
  assert.deepEqual(finding.evidence[0]?.data?.mutatingTasks, ["implement", "publish"]);
  assert.deepEqual(finding.evidence[0]?.data?.validationTasks, []);
});

test("duplicate agent responsibilities group the overlapping owners", async () => {
  const output = await review("duplicate-agents", { raw: true });
  const observations = output.rawObservations?.filter((item) => item.ruleId === "elasticclaw.agent.overlap") ?? [];
  assert.equal(observations.length, 2);
  assert.equal(new Set(observations.map((item) => item.groupKey)).size, 1);
  const finding = output.findings.find((item) => item.ruleId === "elasticclaw.agent.overlap");
  assert.ok(finding);
  assert.equal(finding.evidence.length, 2);
});

test("dependency review catches missing tasks and undeclared producer relationships", async () => {
  const output = await review("missing-dependencies");
  const finding = output.findings.find((item) => item.ruleId === "elasticclaw.workflow.dependencies");
  assert.ok(finding);
  assert.equal(finding.evidence.length, 3);
  assert.deepEqual(finding.evidence.map((evidence) => evidence.location?.line), [11, 12, 13]);
  assert.deepEqual(finding.evidence.map((evidence) => evidence.data?.issue).sort(), [
    "artifact-without-dependency",
    "missing-task",
    "undeclared-output-dependency",
  ]);
});

test("review-only agents with wildcard write, shell, network, and secret access are reported", async () => {
  const output = await review("excessive-permissions");
  const finding = output.findings.find((item) => item.ruleId === "elasticclaw.permissions.too-broad");
  assert.ok(finding);
  const reasons = JSON.stringify(finding.evidence[0]?.data?.reasons);
  assert.match(reasons, /wildcard|write access|secret access|network access/);
});

test("explicit unlimited retries are reported", async () => {
  const output = await review("retry-loop");
  const finding = output.findings.find((item) => item.ruleId === "elasticclaw.retry.unbounded");
  assert.ok(finding);
  assert.equal(finding.evidence[0]?.data?.retry, "forever");
  assert.match(String(finding.evidence[0]?.data?.reason), /unlimited/);
});

test("long-running agent and deployment tasks without timeouts are grouped", async () => {
  const output = await review("missing-timeout");
  const finding = output.findings.find((item) => item.ruleId === "elasticclaw.timeout.missing");
  assert.ok(finding);
  assert.equal(finding.evidence.length, 2);
  assert.deepEqual(finding.evidence.map((evidence) => evidence.data?.task), ["deploy", "verify"]);
});

test("expensive models used for deterministic validation are informational", async () => {
  const hidden = await review("model-overkill");
  assert.equal(hidden.findings.some((item) => item.ruleId === "elasticclaw.model.overkill"), false);
  assert.equal(hidden.suppressed.findings, 1);

  const included = await review("model-overkill", { informational: true });
  const finding = included.findings.find((item) => item.ruleId === "elasticclaw.model.overkill");
  assert.ok(finding);
  assert.equal(finding.severity, "info");
  assert.equal(finding.confidence, "medium");
  assert.equal(finding.evidence[0]?.data?.model, "gpt-5-pro");
});

test("generated workspace trees and transient files are grouped as bloat", async () => {
  const output = await review("workspace-bloat");
  const finding = output.findings.find((item) => item.ruleId === "elasticclaw.workspace.bloat");
  assert.ok(finding);
  assert.deepEqual(finding.evidence.map((evidence) => evidence.data?.path), [
    ".elasticclaw/workspaces/demo/node_modules",
    ".elasticclaw/workspaces/demo/session.log",
  ]);
});

test("malformed factory documents fail with a useful line location", async () => {
  const output = await review("malformed");
  const finding = output.findings.find((item) => item.ruleId === "elasticclaw.config.invalid");
  assert.ok(finding);
  assert.equal(finding.evidence[0]?.location?.line, 6);
  assert.match(String(finding.evidence[0]?.data?.error), /yaml|flow sequence/i);
});

test("a well-structured factory produces concrete positives and no findings", async () => {
  const output = await review("good", { raw: true });
  assert.equal(output.adversary.name, "elasticclaw");
  assert.equal(output.adversary.version, "0.1.0");
  assert.equal(output.target.filesScanned, 6);
  assert.deepEqual(output.findings, []);
  assert.deepEqual(output.rawObservations, []);
  assert.equal(output.assessment?.risk, "none");
  assert.equal(output.opinion?.ship, true);
  assert.deepEqual(output.positives.map((positive) => positive.key), [
    "elasticclaw.goals.explicit-completion",
    "elasticclaw.validation.after-mutation",
  ]);
});

test("output ordering is deterministic", async () => {
  const first = await review("ambiguous-goal", { raw: true });
  const second = await review("ambiguous-goal", { raw: true });
  assert.deepEqual(second, first);
  assert.deepEqual(first.findings.map((finding) => finding.ruleId), [
    "elasticclaw.goal.no-completion",
    "elasticclaw.goal.ambiguous",
  ]);
});

test("terminal rendering does not leak raw factory metadata", async () => {
  const output = await review("excessive-permissions", { raw: true });
  const rendered: string[] = [];
  new TerminalRenderer((text) => rendered.push(text)).render(output);
  const terminal = rendered.join("");
  assert.match(terminal, /Agent or task has excessive permissions/);
  assert.doesNotMatch(terminal, /PRODUCTION_TOKEN|rawObservations|groupKey|git_write/);
});

test("JSON output uses the canonical review protocol", async () => {
  const output = await review("good");
  const envelope = JSON.parse(JSON.stringify(createAdversaryRunEnvelope(output)));
  assert.equal(envelope.protocolVersion, 1);
  assert.equal(envelope.result.schemaVersion, REVIEW_RESULT_SCHEMA_VERSION);
  assert.equal(envelope.result.schemaVersion, "adversary.review.v1");
  assert.equal(envelope.result.adversary.name, "elasticclaw");
});
