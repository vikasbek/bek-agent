import { bootstrapEnv } from "../../config/src/bootstrap";
import type { AppEnv } from "../../config/src/env";
import type { Repository } from "../../db/src/mongo";
import { createModelProvider, normalizeJiraText, type ChangePlan } from "../../integrations/src/ai/client";
import { GitClient } from "../../integrations/src/git/client";
import { JiraClient } from "../../integrations/src/jira/client";
import type { AgentExecution, JiraIssueRecord, QueueSummary, RuntimeConfigRecord } from "../../types/src/index";
import { logger } from "../../utils/src/logger";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function executionId(jobId: string, stage: AgentExecution["stage"]) {
  return `${jobId}:${stage}:${crypto.randomUUID()}`;
}

async function startExecution(
  repository: Repository,
  params: {
    jobId: string;
    configName: string;
    issueKey?: string;
    stage: AgentExecution["stage"];
    message?: string;
  }
) {
  const startedAt = new Date().toISOString();
  const execution: AgentExecution = {
    id: executionId(params.jobId, params.stage),
    jobId: params.jobId,
    configName: params.configName,
    issueKey: params.issueKey,
    stage: params.stage,
    status: "in_progress",
    message: params.message,
    startedAt,
    createdAt: startedAt,
    updatedAt: startedAt
  };
  await repository.saveExecution(execution);
  return execution;
}

async function saveJiraIssue(
  repository: Repository,
  params: {
    runId: string;
    jobId?: string;
    configName?: string;
    issueKey: string;
    payload: unknown;
  }
) {
  const now = new Date().toISOString();
  const record: JiraIssueRecord = {
    id: `${params.runId}:${params.issueKey}`,
    runId: params.runId,
    jobId: params.jobId,
    configName: params.configName,
    issueKey: params.issueKey,
    payload: params.payload,
    createdAt: now,
    updatedAt: now
  };
  await repository.saveJiraIssue(record);
  return record;
}

function renderClarificationComment(issueKey: string, summary: string) {
  return [
    `Requirement review for ${issueKey}: ${summary}`,
    "",
    "I need a clearer implementation brief before coding this item.",
    "Please add:",
    "- acceptance criteria",
    "- expected behavior",
    "- edge cases or examples",
    "",
    "I have reassigned this back for clarification."
  ].join("\n");
}

function renderAgentStatusComment(params: {
  issueKey: string;
  status: "success" | "failed";
  message: string;
  prUrl?: string;
  prMessage?: string;
}) {
  const lines = [
    `Hi I am viBek: ${params.issueKey}`,
    params.status === "success" ? "I have completed the requested work." : "I could not complete the requested work.",
    `Status: ${params.status.toUpperCase()}`,
    `Message: ${params.message}`
  ];
  if (params.prUrl) {
    lines.push(`Pull request: ${params.prUrl}`);
  }
  if (params.prMessage) {
    lines.push(`PR message: ${params.prMessage}`);
  }
  return lines.join("\n");
}

function buildAnalysisPrompt(issueKey: string, summary: string, description: string, comments: string[]) {
  return `Return JSON only with keys decision, summary, gapSummary, commentToReporter, confidence. Issue: ${issueKey}. Summary: ${summary}. Description: ${description}. Comments: ${comments.join("\n")}`;
}

function buildPlanPrompt(issueKey: string, summary: string, requirement: string, gapSummary?: string) {
  return [
    "Return JSON only with keys decision, summary, commitMessage, notes, patch.",
    "The patch must be a valid unified diff or empty string.",
    `Issue: ${issueKey}`,
    `Summary: ${summary}`,
    `Requirement decision: requirements_complete`,
    `Requirement summary: ${requirement}`,
    `Gap summary: ${gapSummary ?? ""}`
  ].join("\n");
}

function extractCommentText(comment: unknown) {
  return normalizeJiraText(comment).trim();
}

async function finishExecution(
  repository: Repository,
  execution: AgentExecution,
  outcome: { status: "success" | "failed"; message?: string; errorStack?: string }
) {
  const endedAt = new Date().toISOString();
  await repository.saveExecution({
    ...execution,
    status: outcome.status,
    message: outcome.message ?? execution.message,
    errorStack: outcome.errorStack,
    endedAt,
    updatedAt: endedAt
  });
}

function getRepositoryRoot(env: AppEnv, config?: RuntimeConfigRecord) {
  return config?.repositoryPath || env.REPOSITORY_PATH || process.cwd();
}

function looksLikeUnifiedDiff(patch: string) {
  const trimmed = patch.trimStart();
  return trimmed.startsWith("*** Begin Patch") || trimmed.startsWith("diff --git") || trimmed.includes("\n+++ ");
}

async function applyChangePlan(env: AppEnv, plan: ChangePlan, config?: RuntimeConfigRecord) {
  const repoRoot = getRepositoryRoot(env, config);
  if (!plan.patch.trim()) {
    return [];
  }
  if (!looksLikeUnifiedDiff(plan.patch)) {
    throw new Error("Model patch does not look like a unified diff");
  }
  const patchFile = path.join(os.tmpdir(), `etbek-patch-${crypto.randomUUID()}.diff`);
  await fs.writeFile(patchFile, plan.patch, "utf8");
  try {
    await execFileAsync("git", ["apply", "--whitespace=fix", patchFile], { cwd: repoRoot });
  } finally {
    await fs.unlink(patchFile).catch(() => undefined);
  }
  const { stdout } = await execFileAsync("git", ["diff", "--name-only"], { cwd: repoRoot });
  return String(stdout)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function applyPlanWithRepair(
  env: AppEnv,
  config: RuntimeConfigRecord,
  model: ReturnType<typeof createModelProvider>,
  plan: ChangePlan,
  issueKey: string,
  issueSummary: string,
  requirementSummary: string
) {
  try {
    return await applyChangePlan(env, plan, config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("patch application failed, attempting repair", {
      issueKey,
      message
    });
    const repaired = await model.repairPatch({
      issueKey,
      summary: issueSummary,
      requirementSummary,
      patchError: message,
      patch: plan.patch
    });
    return await applyChangePlan(env, repaired, config);
  }
}

async function commentOnJira(jira: JiraClient, issueKey: string, params: { status: "success" | "failed"; message: string; prUrl?: string; prMessage?: string }) {
  await jira.addComment(issueKey, renderAgentStatusComment({ issueKey, ...params }));
}

async function recordModelTrace(
  repository: Repository,
  execution: AgentExecution,
  params: {
    prompt: string;
    reply: unknown;
    message: string;
  }
) {
  const now = new Date().toISOString();
  await repository.saveExecution({
    ...execution,
    modelPrompt: params.prompt,
    modelReply: typeof params.reply === "string" ? params.reply : JSON.stringify(params.reply),
    message: params.message,
    updatedAt: now
  });
}

async function syncJiraForConfig(env: AppEnv, repository: Repository, config: RuntimeConfigRecord) {
  if (!env.JIRA_BASE_URL || !env.JIRA_EMAIL || !env.JIRA_API_TOKEN || !config.jiraJql) {
    return;
  }

  const jira = new JiraClient({
    baseUrl: env.JIRA_BASE_URL,
    email: env.JIRA_EMAIL,
    apiToken: env.JIRA_API_TOKEN
  });

  const jobId = `${config.name}:config-sync:${new Date().toISOString()}`;
  const execution = await startExecution(repository, {
    jobId,
    configName: config.name,
    stage: "config_sync",
    message: `Syncing Jira for ${config.name}`
  });

  let jiraIssues;
  try {
    jiraIssues = await jira.searchIssues(config.jiraJql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await repository.upsertRuntimeConfig(config.name, {
      lastError: message,
      queueState: "failed"
    });
    await finishExecution(repository, execution, {
      status: "failed",
      message,
      errorStack: error instanceof Error ? error.stack : undefined
    });
    await repository.saveRun({
      id: crypto.randomUUID(),
      issueId: config.name,
      configName: config.name,
      issueKey: undefined,
      action: "pick",
      status: "failed",
      message,
      jiraContent: {
        jiraKey: config.name,
        summary: "Jira sync failed",
        status: "failed"
      },
      jiraIssue: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    logger.error("jira sync failed", { configName: config.name, message });
    return;
  }
  await finishExecution(repository, execution, {
    status: "success",
    message: `Synced ${jiraIssues.length} Jira issues`
  });
  const currentIssues = await repository.listIssues();

  for (const item of jiraIssues) {
    const existing = currentIssues.find(
      (issue) => issue.jiraKey === item.key && issue.configName === config.name
    );
    const fullIssue = await jira.getIssue(item.key);
    const assigneeEmail = item.fields?.assignee?.emailAddress;
    const matchedDeveloper = config.developerList.find(
      (developer) => developer.active && developer.email.toLowerCase() === String(assigneeEmail ?? "").toLowerCase()
    );

    const runId = crypto.randomUUID();
    await saveJiraIssue(repository, {
      runId,
      jobId,
      configName: config.name,
      issueKey: item.key,
      payload: fullIssue
    });

    await repository.saveIssue({
      id: existing?.id ?? `${config.name}-${item.id}`,
      jiraKey: item.key,
      summary: item.fields?.summary ?? item.key,
      assigneeEmail,
      configName: config.name,
      status: existing?.status ?? "queued",
      lockStatus: existing?.lockStatus ?? "unlocked",
      lockedByConfig: existing?.lockedByConfig,
      lockedAt: existing?.lockedAt,
      lastProcessedAt: existing?.lastProcessedAt,
      lastError: existing?.lastError,
      branchName: existing?.branchName,
      prUrl: existing?.prUrl,
      developerId: existing?.developerId ?? matchedDeveloper?.id,
      updatedAt: new Date().toISOString()
    });
  }
}

async function processIssue(env: AppEnv, repository: Repository, config: RuntimeConfigRecord, issue: Awaited<ReturnType<Repository["listIssues"]>>[number]) {
  const jobId = `${config.name}:${issue.jiraKey}:${new Date().toISOString()}`;
  const issueExecution = await startExecution(repository, {
    jobId,
    configName: config.name,
    issueKey: issue.jiraKey,
    stage: "issue_process",
    message: `Processing ${issue.jiraKey}`
  });
  const jira = new JiraClient({
    baseUrl: env.JIRA_BASE_URL,
    email: env.JIRA_EMAIL,
    apiToken: env.JIRA_API_TOKEN
  });
  let lockAcquired = false;
  try {
    const locked = await repository.claimIssueLock(issue.jiraKey, config.name);
    if (!locked) {
      await repository.saveIssue({
        ...issue,
        status: "blocked",
        lastError: `Locked by another config`,
        updatedAt: new Date().toISOString()
      });
      await finishExecution(repository, issueExecution, {
        status: "failed",
        message: `Locked by another config`
      });
      return;
    }
    lockAcquired = true;

    await repository.saveIssue({
      ...issue,
      status: "in_progress",
      lockStatus: "locked",
      lockedByConfig: config.name,
      lockedAt: new Date().toISOString(),
      lastError: undefined,
      updatedAt: new Date().toISOString()
    });

    const branchName = `${config.branchPrefix}/${issue.jiraKey.toLowerCase()}-${slugify(issue.summary) || issue.id.slice(0, 8)}`;
    const git = new GitClient({
      provider: config.gitProvider ?? env.GIT_PROVIDER,
      token: env.GIT_TOKEN ?? "",
      owner: config.gitOwner || env.GIT_OWNER || "",
      repository: config.gitRepository || env.GIT_REPOSITORY || "",
      repositoryPath: config.repositoryPath || env.REPOSITORY_PATH || process.cwd()
    });
    const fullIssue = await jira.getIssue(issue.jiraKey);
    const description = normalizeJiraText(fullIssue?.fields?.description).trim();
    const comments = fullIssue?.fields?.comment?.comments?.map((comment: any) => extractCommentText(comment)).filter(Boolean);
    const model = createModelProvider({
      provider: config.modelProvider,
      modelName: config.modelName,
      baseUrl: config.modelBaseUrl,
      apiKey: env.AI_API_KEY,
      temperature: config.modelTemperature,
      maxTokens: config.modelMaxTokens
    });
    const analysisPrompt = buildAnalysisPrompt(issue.jiraKey, issue.summary, description, comments ?? []);
    const analysis = await model.analyzeRequirement({
      issueKey: issue.jiraKey,
      summary: issue.summary,
      description,
      comments
    });
    await recordModelTrace(repository, issueExecution, {
      prompt: analysisPrompt,
      reply: analysis,
      message: `Model analysis: ${analysis.decision}`
    });

    if (analysis.decision !== "requirements_complete") {
      const reporterAccountId = fullIssue?.fields?.reporter?.accountId;
      await jira.addComment(
        issue.jiraKey,
        analysis.commentToReporter ??
          renderClarificationComment(
            issue.jiraKey,
            analysis.gapSummary ? `${issue.summary}\n\nGap: ${analysis.gapSummary}` : issue.summary
          )
      );
      if (reporterAccountId) {
        await jira.assignIssue(issue.jiraKey, reporterAccountId);
      }
      await repository.saveRun({
        id: crypto.randomUUID(),
        issueId: issue.id,
        configName: config.name,
        issueKey: issue.jiraKey,
        action: "pick",
        status: "failed",
        message: "Requirement gap detected; sent back for clarification",
        jiraContent: {
          jiraKey: issue.jiraKey,
          summary: issue.summary,
          assigneeEmail: issue.assigneeEmail,
          status: issue.status,
          raw: fullIssue
        },
        jiraIssue: fullIssue,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      await saveJiraIssue(repository, {
        runId: crypto.randomUUID(),
        jobId,
        configName: config.name,
        issueKey: issue.jiraKey,
        payload: fullIssue
      });
      await finishExecution(repository, issueExecution, {
        status: "failed",
        message: "Requirement gap detected and issue reassigned"
      });
      await repository.releaseIssueLock(issue.jiraKey, config.name);
      lockAcquired = false;
      logger.info("requirement gap detected", { configName: config.name, jiraKey: issue.jiraKey });
      return;
    }

    const branchExecution = await startExecution(repository, {
      jobId,
      configName: config.name,
      issueKey: issue.jiraKey,
      stage: "branch_create",
      message: `Creating branch ${branchName}`
    });
    await git.ensureBranch(branchName, config.baseBranch);
    await finishExecution(repository, branchExecution, {
      status: "success",
      message: `Branch ready: ${branchName}`
    });

    const plan = await model.generateImplementationPlan({
      issueKey: issue.jiraKey,
      summary: issue.summary,
      requirement: analysis
    });
    const planPrompt = buildPlanPrompt(issue.jiraKey, issue.summary, analysis.summary, analysis.gapSummary);
    await recordModelTrace(repository, issueExecution, {
      prompt: planPrompt,
      reply: plan,
      message: `Model plan: ${plan.decision}`
    });

    if (plan.decision !== "proceed") {
      throw new Error(plan.summary || "Model did not return a proceed decision");
    }

    const changedFiles = await applyPlanWithRepair(
      env,
      config,
      model,
      plan,
      issue.jiraKey,
      issue.summary,
      analysis.summary
    );
    if (changedFiles.length === 0) {
      throw new Error(`No code changes were generated for ${issue.jiraKey}`);
    }

    const commitResult = await git.commitAndPush(
      branchName,
      plan.commitMessage
    );
    if (!commitResult.committed || !commitResult.pushed) {
      throw new Error(
        `No code changes were generated for ${issue.jiraKey}. The agent needs an implementation step before PR creation.`
      );
    }

    const prExecution = await startExecution(repository, {
      jobId,
      configName: config.name,
      issueKey: issue.jiraKey,
      stage: "pull_request",
      message: `Creating pull request for ${branchName}`
    });
    const pr = await git.createPullRequest(
      branchName,
      config.prTitleTemplate.replace("{issueKey}", issue.jiraKey).replace("{summary}", issue.summary),
      config.prBodyTemplate,
      config.baseBranch
    );
    await commentOnJira(jira, issue.jiraKey, {
      status: "success",
      message: `Pull request raised successfully for ${issue.jiraKey}`,
      prUrl: pr.url,
      prMessage: config.prBodyTemplate
    });
    await finishExecution(repository, prExecution, {
      status: "success",
      message: `PR created: ${pr.url}`
    });

    await saveJiraIssue(repository, {
      runId: issueExecution.id,
      jobId,
      configName: config.name,
      issueKey: issue.jiraKey,
      payload: fullIssue
    });
    await repository.saveIssue({
      ...issue,
      status: "ready_for_review",
      lockStatus: "unlocked",
      lockedByConfig: undefined,
      lockedAt: undefined,
      branchName,
      prUrl: pr.url,
      lastProcessedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await repository.releaseIssueLock(issue.jiraKey, config.name);
    lockAcquired = false;
    const hasDiff = await git.hasDiff(branchName);
    if (!hasDiff) {
      throw new Error(`No code changes were produced for ${issue.jiraKey}`);
    }
    await finishExecution(repository, issueExecution, {
      status: "success",
      message: `Completed ${issue.jiraKey} -> ${pr.url}`
    });

    await repository.saveRun({
      id: crypto.randomUUID(),
      issueId: issue.id,
      configName: config.name,
      issueKey: issue.jiraKey,
      action: "pr",
      status: "success",
      message: `Prepared ${branchName}`,
      jiraContent: {
        jiraKey: issue.jiraKey,
        summary: issue.summary,
        assigneeEmail: issue.assigneeEmail,
        status: issue.status,
        raw: fullIssue
      },
      jiraIssue: fullIssue,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await commentOnJira(jira, issue.jiraKey, {
        status: "failed",
        message
      });
    } catch (commentError) {
      logger.warn("failed to post Jira failure comment", {
        issueKey: issue.jiraKey,
        message: commentError instanceof Error ? commentError.message : String(commentError)
      });
    }
    await repository.saveIssue({
      ...issue,
      status: "blocked",
      lastError: message,
      updatedAt: new Date().toISOString()
    });
    await finishExecution(repository, issueExecution, {
      status: "failed",
      message,
      errorStack: error instanceof Error ? error.stack : undefined
    });
      const failedRunId = crypto.randomUUID();
      await repository.saveRun({
        id: failedRunId,
        issueId: issue.id,
        configName: config.name,
        issueKey: issue.jiraKey,
        action: "pr",
        status: "failed",
        message,
        jiraContent: {
          jiraKey: issue.jiraKey,
          summary: issue.summary,
          assigneeEmail: issue.assigneeEmail,
          status: issue.status,
          raw: issue
        },
        jiraIssue: issue,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    await saveJiraIssue(repository, {
        runId: failedRunId,
        jobId,
        configName: config.name,
        issueKey: issue.jiraKey,
        payload: issue
      });
    if (lockAcquired) {
      await repository.releaseIssueLock(issue.jiraKey, config.name);
      lockAcquired = false;
    }
    throw error;
  }
}

async function updateQueueState(repository: Repository, configName: string) {
  const summaries = await repository.listQueueSummaries();
  const summary = summaries.find((item) => item.configName === configName);
  if (!summary) {
    return;
  }

  const nextState: RuntimeConfigRecord["queueState"] =
    summary.counts.queued > 0
      ? "inqueue"
      : summary.counts.in_progress > 0
        ? "inprogress"
        : summary.counts.failed > 0
          ? "failed"
          : "completed";

  await repository.upsertRuntimeConfig(configName, {
    queueState: nextState,
    lastProcessedAt: summary.lastProcessedAt,
    lastError: summary.lastError
  });
}

async function processConfig(env: AppEnv, repository: Repository, config: RuntimeConfigRecord) {
  await repository.upsertRuntimeConfig(config.name, {
    active: config.active,
    queueState: "inqueue",
    lastError: undefined
  });

  await syncJiraForConfig(env, repository, config);

  const issues = (await repository.listIssues()).filter(
    (issue) => issue.configName === config.name && issue.status === "queued"
  );

  if (issues.length === 0) {
    await updateQueueState(repository, config.name);
    logger.info("config queue empty", { configName: config.name });
    return;
  }

  await repository.upsertRuntimeConfig(config.name, {
    active: config.active,
    queueState: "inprogress"
  });

  for (const issue of issues) {
    try {
      await processIssue(env, repository, config, issue);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("issue failed", { configName: config.name, jiraKey: issue.jiraKey, message });
    }
  }

  await updateQueueState(repository, config.name);
  logger.info("config processed", { configName: config.name });
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function runActiveConfigs(repository: Repository, env: AppEnv, opts?: { limit?: number }) {
  const configs = await repository.listRuntimeConfigs();
  const activeConfigs = configs.filter((config) => config.active);
  const parallelism = Math.max(1, opts?.limit ?? env.WORKER_PARALLELISM ?? 2);
  const batches = chunk(activeConfigs, parallelism);

  for (const batch of batches) {
    await Promise.all(batch.map((config) => processConfig(env, repository, config)));
  }

  return {
    activeConfigs: activeConfigs.length,
    parallelism
  };
}

export async function createEnvAndRun(repository: Repository) {
  const env = bootstrapEnv();
  return runActiveConfigs(repository, env);
}
