const WORKFLOW_CONFIG_NAMES = [
  "COMMENT_LENS_WORKFLOW_OWNER",
  "COMMENT_LENS_WORKFLOW_REPOSITORY",
  "COMMENT_LENS_WORKFLOW_ID",
  "COMMENT_LENS_WORKFLOW_REF",
] as const;

type WorkflowConfigName = (typeof WORKFLOW_CONFIG_NAMES)[number];

export interface WorkflowConfig {
  owner: string;
  repository: string;
  workflowId: string;
  ref: string;
}

export class WorkflowConfigurationError extends Error {
  constructor() {
    super("Workflow configuration is unavailable");
    this.name = "WorkflowConfigurationError";
  }
}

function requiredSafeValue(name: WorkflowConfigName): string {
  const value = process.env[name]?.trim();
  if (!value || value.length > 256 || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) || value.includes("..")) throw new WorkflowConfigurationError();
  return value;
}

export function getWorkflowConfig(): WorkflowConfig {
  return {
    owner: requiredSafeValue("COMMENT_LENS_WORKFLOW_OWNER"),
    repository: requiredSafeValue("COMMENT_LENS_WORKFLOW_REPOSITORY"),
    workflowId: requiredSafeValue("COMMENT_LENS_WORKFLOW_ID"),
    ref: requiredSafeValue("COMMENT_LENS_WORKFLOW_REF"),
  };
}
