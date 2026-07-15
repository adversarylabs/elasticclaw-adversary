# AGENTS.md

## Purpose

This repository contains the ElasticClaw software-factory adversary.

It reviews automation configuration and workspace context. It must not review application code or modify the repository being reviewed.

## Engineering principles

- Prefer a small number of evidence-backed findings.
- Parse each factory document once.
- Keep discovery, normalization, and rules separate.
- Treat unknown YAML as unsupported rather than guessing.
- Keep output deterministic.
- Use the Adversary SDK for grouping, ranking, suppression, and rendering.
- Add focused positive and negative fixtures for each rule change.

## Layout

- `src/` contains discovery, parsing, normalized models, and analysis.
- `src/rules/` contains stable rule definitions and focused analyzers.
- `test/fixtures/` contains small ElasticClaw factories.
- `adversary.yaml` defines the runtime contract.

Run `npm test` before considering a change complete.
