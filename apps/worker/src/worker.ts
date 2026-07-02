import { bootstrapEnv } from "../../../packages/config/src/bootstrap";
import { createRepository } from "../../../packages/db/src/mongo";
import { GitClient } from "../../../packages/integrations/src/git/client";
import { JiraClient } from "../../../packages/integrations/src/jira/client";
import { logger } from "../../../packages/utils/src/logger";
import type { RuntimeConfigRecord } from "../../../packages/types/src/index";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function syncJiraForConfig(
  env: ReturnType<typeof bootstrapEnv>,
  repository: Awaited<ReturnType<typeof createRepository>>,
  config: RuntimeConfigRecord
) {
  if (!env.JIRA_BASE_URL || !env.JIRA_EMAIL || !env.JIRA_API_TOKEN || !config.jiraJql) {
    return;
  }

  const jira = new JiraClient({
    baseUrl: env.JIRA_BASE_URL,
    email: env.JIRA_EMAIL,
    apiToken: env.JIRA_API_TOKEN
  });

  const jiraIssues = await jira.searchIssues(config.jiraJql);
  const currentIssues = await repository.listIssues();

  for (const item of jiraIssues) {
    const existing = currentIssues.find(
      (issue) => issue.jiraKey === item.key && issue.configName === config.name
    );
    const assigneeEmail = item.fields?.assignee?.emailAddress;
    const matchedDeveloper = config.developerList.find(
      (developer) => developer.active && developer.email.toLowerCase() === String(assigneeEmail ?? "").toLowerCase()
    );

    await repository.saveIssue({
      id: existing?.id ?? `${config.name}-${item.id}`,
      jiraKey: item.key,
      summary: item.fields?.summary ?? item.key,
      assigneeEmail,
      configName: config.name,
      status: existing?.status ?? "queued",
      branchName: existing?.branchName,
      prUrl: existing?.prUrl,
      developerId: existing?.developerId ?? matchedDeveloper?.id,
      updatedAt: new Date().toISOString()
    });
  }
}

async function processConfig(
  env: ReturnType<typeof bootstrapEnv>,
  repository: Awaited<ReturnType<typeof createRepository>>,
  config: RuntimeConfigRecord
) {
  await repository.upsertRuntimeConfig(config.name, {
    active: config.active,
    queueState: "inqueue",
    lastError: undefined
  });

  await repository.upsertRuntimeConfig(config.name, {
    active: config.active,
    queueState: "inprogress",
    lastError: undefined
  });

  try {
    await syncJiraForConfig(env, repository, config);

    const issue = (await repository.listIssues()).find(
      (item) => item.configName === config.name && item.status === "queued" && item.developerId
    );

    if (!issue) {
      await repository.upsertRuntimeConfig(config.name, {
        active: config.active,
        queueState: "completed",
        lastProcessedAt: new Date().toISOString()
      });
      logger.info("config completed with no eligible issue", { configName: config.name });
      return;
    }

    const branchName = `${config.branchPrefix}/${issue.jiraKey.toLowerCase()}-${slugify(issue.summary) || issue.id.slice(0, 8)}`;
    const git = new GitClient({
      provider: env.GIT_PROVIDER,
      token: env.GIT_TOKEN ?? "",
      owner: env.GIT_OWNER ?? "",
      repository: env.GIT_REPOSITORY ?? "",
      repositoryPath: env.REPOSITORY_PATH || process.cwd()
    });

    await git.ensureBranch(branchName, config.baseBranch);
    const pr = await git.createPullRequest(
      branchName,
      config.prTitleTemplate
        .replace("{issueKey}", issue.jiraKey)
        .replace("{summary}", issue.summary),
      config.prBodyTemplate,
      config.baseBranch
    );

    await repository.saveIssue({
      ...issue,
      status: "ready_for_review",
      branchName,
      prUrl: pr.url,
      updatedAt: new Date().toISOString()
    });

    await repository.saveRun({
      id: crypto.randomUUID(),
      issueId: issue.id,
      configName: config.name,
      action: "pr",
      status: "success",
      message: `Prepared ${branchName}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await repository.upsertRuntimeConfig(config.name, {
      active: config.active,
      queueState: "completed",
      lastProcessedAt: new Date().toISOString()
    });

    logger.info("config processed", { configName: config.name, jiraKey: issue.jiraKey, branchName });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await repository.upsertRuntimeConfig(config.name, {
      active: config.active,
      queueState: "failed",
      lastProcessedAt: new Date().toISOString(),
      lastError: message
    });
    await repository.saveRun({
      id: crypto.randomUUID(),
      issueId: config.name,
      configName: config.name,
      action: "pr",
      status: "failed",
      message,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    logger.error("config failed", { configName: config.name, message });
  }
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function main() {
  const env = bootstrapEnv();
  const repository = await createRepository(env);
  const allConfigs = await repository.listRuntimeConfigs();
  const activeConfigs = allConfigs.filter((config) => config.active);
  const concurrency = Math.max(1, env.WORKER_PARALLELISM || 2);
  const batches = chunk(activeConfigs, concurrency);

  if (activeConfigs.length === 0) {
    logger.info("worker idle - no active configs");
    return;
  }

  for (const batch of batches) {
    await Promise.all(batch.map((config) => processConfig(env, repository, config)));
  }

  logger.info("worker cycle complete", {
    activeConfigs: activeConfigs.length,
    concurrency
  });
}

main().catch((error) => {
  logger.error("failed to start worker", {
    message: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
