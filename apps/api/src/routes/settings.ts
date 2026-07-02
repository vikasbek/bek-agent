import { Router } from "express";
import { z } from "zod";
import type { Repository } from "../../../../packages/db/src/mongo";
import { createModelProvider } from "../../../../packages/integrations/src/ai/client";
import type { AppEnv } from "../../../../packages/config/src/env";

const runtimeConfigSchema = z.object({
  name: z.string().min(1),
  active: z.boolean().optional().default(false),
  jiraProjectKey: z.string().optional().default(""),
  jiraJql: z.string().optional().default(""),
  leadDeveloperEmail: z.string().optional().default(""),
  gitProvider: z.enum(["github", "gitlab", "bitbucket"]).optional().default("github"),
  gitOwner: z.string().optional().default(""),
  gitRepository: z.string().optional().default(""),
  repositoryPath: z.string().optional().default(""),
  baseBranch: z.string().optional().default("master"),
  branchPrefix: z.string().optional().default("viBek"),
  autoPickEnabled: z.boolean().optional().default(false),
  reviewRequired: z.boolean().optional().default(true),
  prTitleTemplate: z.string().optional().default("[{issueKey}] {summary}"),
  prBodyTemplate: z.string().optional().default("Prepared by viBek for review."),
  modelProvider: z.enum(["codex", "ollama", "openai", "custom"]).optional().default("ollama"),
  modelName: z.string().optional().default("qwen3.5"),
  modelBaseUrl: z.string().optional().default("http://localhost:11434"),
  modelTemperature: z.coerce.number().optional().default(0.2),
  modelMaxTokens: z.coerce.number().optional().default(2048)
});

export function settingsRouter(repository: Repository, env: AppEnv) {
  const router = Router();

  router.get("/", async (_req, res) => {
    const configs = await repository.listRuntimeConfigs();
    const activeConfigs = configs.filter((config) => config.active);
    res.json({
      configs,
      activeConfigs
    });
  });

  router.post("/", async (req, res) => {
    const payload = runtimeConfigSchema.parse(req.body);
    const saved = await repository.upsertRuntimeConfig(payload.name, {
      active: payload.active,
      jiraProjectKey: payload.jiraProjectKey,
      jiraJql: payload.jiraJql,
      leadDeveloperEmail: payload.leadDeveloperEmail,
      gitProvider: payload.gitProvider,
      gitOwner: payload.gitOwner,
      gitRepository: payload.gitRepository,
      repositoryPath: payload.repositoryPath,
      baseBranch: payload.baseBranch,
      branchPrefix: payload.branchPrefix,
      autoPickEnabled: payload.autoPickEnabled,
      reviewRequired: payload.reviewRequired,
      prTitleTemplate: payload.prTitleTemplate,
      prBodyTemplate: payload.prBodyTemplate,
      modelProvider: payload.modelProvider,
      modelName: payload.modelName,
      modelBaseUrl: payload.modelBaseUrl,
      modelTemperature: payload.modelTemperature,
      modelMaxTokens: payload.modelMaxTokens
    });
    res.status(201).json(saved);
  });

  router.put("/", async (req, res) => {
    const payload = runtimeConfigSchema.partial().required({ name: true }).parse(req.body);
    const saved = await repository.upsertRuntimeConfig(payload.name, {
      active: payload.active,
      jiraProjectKey: payload.jiraProjectKey,
      jiraJql: payload.jiraJql,
      leadDeveloperEmail: payload.leadDeveloperEmail,
      gitProvider: payload.gitProvider,
      gitOwner: payload.gitOwner,
      gitRepository: payload.gitRepository,
      repositoryPath: payload.repositoryPath,
      baseBranch: payload.baseBranch,
      branchPrefix: payload.branchPrefix,
      autoPickEnabled: payload.autoPickEnabled,
      reviewRequired: payload.reviewRequired,
      prTitleTemplate: payload.prTitleTemplate,
      prBodyTemplate: payload.prBodyTemplate,
      modelProvider: payload.modelProvider,
      modelName: payload.modelName,
      modelBaseUrl: payload.modelBaseUrl,
      modelTemperature: payload.modelTemperature,
      modelMaxTokens: payload.modelMaxTokens
    });
    res.json(saved);
  });

  router.post("/test-provider", async (req, res) => {
    const payload = runtimeConfigSchema.partial().required({ modelProvider: true, modelName: true }).parse(req.body);
    const provider = createModelProvider({
      provider: payload.modelProvider,
      modelName: payload.modelName,
      baseUrl: payload.modelBaseUrl,
      apiKey: env.AI_API_KEY,
      temperature: payload.modelTemperature,
      maxTokens: payload.modelMaxTokens
    });
    const result = await provider.testConnection();
    res.json(result);
  });

  return router;
}
