export type AppEnvName = "dev" | "staging" | "prod";

export type Developer = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  jiraAccountId?: string;
};

export type RuntimeConfig = {
  jiraProjectKey: string;
  jiraJql: string;
  developerList: Developer[];
  leadDeveloperEmail: string;
  gitProvider?: "github" | "gitlab" | "bitbucket";
  gitOwner?: string;
  gitRepository?: string;
  repositoryPath?: string;
  baseBranch: string;
  branchPrefix: string;
  autoPickEnabled: boolean;
  reviewRequired: boolean;
  prTitleTemplate: string;
  prBodyTemplate: string;
  modelProvider: "codex" | "ollama" | "openai" | "custom";
  modelName: string;
  modelBaseUrl?: string;
  modelTemperature?: number;
  modelMaxTokens?: number;
  updatedAt: string;
};

export type RuntimeConfigRecord = RuntimeConfig & {
  name: string;
  active: boolean;
  queueState: "idle" | "inqueue" | "inprogress" | "completed" | "failed";
  createdAt: string;
  lastProcessedAt?: string;
  lastError?: string;
};

export type IssueRecord = {
  id: string;
  jiraKey: string;
  summary: string;
  assigneeEmail?: string;
  configName?: string;
  status: "queued" | "picked" | "in_progress" | "ready_for_review" | "done" | "blocked";
  lockStatus?: "unlocked" | "locked";
  lockedByConfig?: string;
  lockedAt?: string;
  lastProcessedAt?: string;
  lastError?: string;
  branchName?: string;
  prUrl?: string;
  developerId?: string;
  updatedAt: string;
};

export type AgentRun = {
  id: string;
  issueId: string;
  configName?: string;
  issueKey?: string;
  action: "pick" | "branch" | "develop" | "pr";
  status: "pending" | "running" | "success" | "failed";
  message?: string;
  jiraContent?: {
    jiraKey: string;
    summary?: string;
    assigneeEmail?: string;
    status?: string;
    raw?: unknown;
  };
  jiraIssue?: unknown;
  createdAt: string;
  updatedAt: string;
};

export type JiraIssueRecord = {
  id: string;
  runId?: string;
  jobId?: string;
  configName?: string;
  issueKey: string;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
};

export type AgentExecution = {
  id: string;
  jobId: string;
  configName: string;
  issueKey?: string;
  stage: "config_sync" | "issue_process" | "branch_create" | "pull_request";
  status: "pending" | "in_progress" | "success" | "failed";
  message?: string;
  modelPrompt?: string;
  modelReply?: string;
  startedAt: string;
  endedAt?: string;
  errorStack?: string;
  createdAt: string;
  updatedAt: string;
};

export type QueueSummary = {
  configName: string;
  active: boolean;
  queueState: RuntimeConfigRecord["queueState"];
  counts: {
    queued: number;
    in_progress: number;
    completed: number;
    failed: number;
    blocked: number;
  };
  lastProcessedAt?: string;
  lastError?: string;
};

export type AppSettingsDocument = RuntimeConfig & {
  id: string;
  createdAt: string;
};
