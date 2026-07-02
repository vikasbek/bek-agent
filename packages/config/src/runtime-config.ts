import type { RuntimeConfig } from "../../types/src/index";

export const defaultRuntimeConfig: RuntimeConfig = {
  jiraProjectKey: "",
  jiraJql: "project = ETBEK ORDER BY priority DESC, updated DESC",
  developerList: [],
  leadDeveloperEmail: "",
  baseBranch: "master",
  branchPrefix: "etbek",
  autoPickEnabled: false,
  reviewRequired: true,
  prTitleTemplate: "[{issueKey}] {summary}",
  prBodyTemplate: "Prepared by etbek for review.",
  modelProvider: "ollama",
  modelName: "qwen3.5",
  modelBaseUrl: "http://localhost:11434",
  modelTemperature: 0.2,
  modelMaxTokens: 2048,
  updatedAt: new Date().toISOString()
};

export function mergeRuntimeConfig(
  current: RuntimeConfig,
  patch: Partial<RuntimeConfig>
): RuntimeConfig {
  return {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };
}
