#!/usr/bin/env node

import { Adversary } from "@adversarylabs/sdk";
import { analyzeFactory, reviewedFileCount } from "./analyze.js";
import { discoverFactory } from "./discover.js";
import { registerRules } from "./rules/definitions.js";

export function createApp(): Adversary {
  const app = new Adversary({
    name: "factory/elasticclaw",
    version: "0.0.16",
    review: { maximumFindings: 8 },
  });
  registerRules(app);

  app.rule("elasticclaw.review", async (ctx) => {
    const model = await discoverFactory(ctx.repoPath);
    ctx.summary.files_scanned = reviewedFileCount(ctx, model);
    analyzeFactory(ctx, model);
  });
  return app;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(process.argv[1], "file:").href) {
  await createApp().runFromEnvironment();
}
