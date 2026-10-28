type WorkflowConfigName =
  | "COMMENT_LENS_WORKFLOW_OWNER"
  | "COMMENT_LENS_WORKFLOW_REPOSITORY"
  | "COMMENT_LENS_WORKFLOW_ID"
  | "COMMENT_LENS_WORKFLOW_REF";

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

export type WorkflowTarget = "production" | "development";

export function getWorkflowTarget(): WorkflowTarget {
  const target = process.env.COMMENT_LENS_WORKFLOW_TARGET?.trim()
    || (process.env.NODE_ENV === "production" ? "production" : "development");
  if (target !== "production" && target !== "development") throw new WorkflowConfigurationError();
  return target;
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
