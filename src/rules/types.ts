import { type Confidence, type Severity } from "@adversarylabs/sdk";

export type RuleId =
  | "elasticclaw.config.invalid"
  | "elasticclaw.goal.ambiguous"
  | "elasticclaw.goal.no-completion"
  | "elasticclaw.permissions.too-broad"
  | "elasticclaw.workflow.dependencies"
  | "elasticclaw.agent.overlap"
  | "elasticclaw.validation.missing"
  | "elasticclaw.retry.unbounded"
  | "elasticclaw.timeout.missing"
  | "elasticclaw.model.overkill"
  | "elasticclaw.workspace.bloat";

export interface Detection {
  ruleId: RuleId;
  subject: string;
  groupKey: string;
  file: string;
  line: number;
  snippet: string;
  label: string;
  data: Record<string, unknown>;
  severity?: Severity;
  confidence?: Confidence;
}
