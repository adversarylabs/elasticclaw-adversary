# ElasticClaw adversary

Reviews ElasticClaw workspaces, workflows, goals, agents, and execution policies for correctness, maintainability, reliability, and efficiency.

## Goals

The adversary is designed to produce a small number of high-confidence,
actionable findings grounded in concrete repository evidence. Its review should
be deterministic where possible, explicit about impact, and quiet when the
available evidence does not justify a finding.

## Scope

It evaluates ElasticClaw workspace, workflow, goal, agent, dependency, permission, retry, and validation configuration.

The complete detector or review inventory is maintained in
[CHECKS.md](CHECKS.md).

## Boundaries

It stays within this domain, does not execute target code, and leaves unrelated concerns to the corresponding specialist adversaries.
