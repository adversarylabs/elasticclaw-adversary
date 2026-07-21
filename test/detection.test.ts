import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseAdversaryManifest } from "@adversarylabs/sdk";

test("declares deterministic automatic detection", async () => {
  const source = await readFile(new URL("../adversary.yaml", import.meta.url), "utf8");
  const manifest = parseAdversaryManifest(source);

  assert.deepEqual(manifest.detection?.files, [
    ".elasticclaw/**",
    "**/elasticclaw*.yaml",
    "**/elasticclaw*.yml",
    "**/workspace*.yaml",
    "**/workspace*.yml",
    "**/workflow*.yaml",
    "**/workflow*.yml",
    "**/goal*.yaml",
    "**/goal*.yml",
    "**/agent*.yaml",
    "**/agent*.yml"
  ]);
  assert.equal(manifest.detection?.entrypoint, undefined);
});
