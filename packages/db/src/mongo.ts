import { MongoClient, type Db, type MongoClientOptions } from "mongodb";
import { defaultRuntimeConfig, mergeRuntimeConfig } from "../../config/src/runtime-config";
import type {
  AgentRun,
  AgentExecution,
  Developer,
  IssueRecord,
  JiraIssueRecord,
  QueueSummary,
  RuntimeConfig,
  RuntimeConfigRecord
} from "../../types/src/index";
import type { AppEnv } from "../../config/src/env";

export type Repository = {
  getRuntimeConfig(): Promise<RuntimeConfig>;
  listRuntimeConfigs(): Promise<RuntimeConfigRecord[]>;
  upsertRuntimeConfig(name: string, patch: Partial<RuntimeConfigRecord>): Promise<RuntimeConfigRecord>;
  listDevelopers(): Promise<Developer[]>;
  saveDeveloper(developer: Developer): Promise<Developer>;
  listIssues(): Promise<IssueRecord[]>;
  saveIssue(issue: IssueRecord): Promise<IssueRecord>;
  claimIssueLock(jiraKey: string, configName: string): Promise<boolean>;
  releaseIssueLock(jiraKey: string, configName: string): Promise<void>;
  listQueueSummaries(): Promise<QueueSummary[]>;
  listRuns(): Promise<AgentRun[]>;
  saveRun(run: AgentRun): Promise<AgentRun>;
  listExecutions(): Promise<AgentExecution[]>;
  saveExecution(execution: AgentExecution): Promise<AgentExecution>;
  listJiraIssues(): Promise<JiraIssueRecord[]>;
  saveJiraIssue(record: JiraIssueRecord): Promise<JiraIssueRecord>;
  health(): Promise<{ mode: "memory" | "mongo"; connected: boolean }>;
};

type RuntimeConfigDocument = RuntimeConfig & {
  _id: string;
  name: string;
  active: boolean;
  queueState: RuntimeConfigRecord["queueState"];
  createdAt: string;
  lastProcessedAt?: string;
  lastError?: string;
};

let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;

const COLLECTIONS = {
  runtimeConfigs: "ai_agent_runtime_configs",
  developers: "ai_agent_developers",
  issues: "ai_agent_issues",
  issueLocks: "ai_agent_issue_locks",
  runs: "ai_agent_runs",
  executions: "ai_agent_executions",
  jiraIssues: "ai_agent_jira_issues"
} as const;

async function connectMongo(env: AppEnv) {
  const uri = buildMongoUri(env);
  if (!uri) {
    throw new Error("Mongo configuration is required. Set MONGO_URI or MONGO_HOST/MONGO_PORT values.");
  }

  if (mongoDb) {
    return mongoDb;
  }

  const options = buildMongoOptions(env);
  mongoClient = new MongoClient(uri, options);
  await mongoClient.connect();
  mongoDb = mongoClient.db(env.MONGO_DATABASE);
  await ensureIndexes(mongoDb);
  await loadRuntimeConfig(mongoDb);
  return mongoDb;
}

function buildMongoUri(env: AppEnv) {
  if (env.MONGO_URI) {
    return env.MONGO_URI;
  }

  if (!env.MONGO_HOST) {
    return "";
  }

  const auth =
    env.MONGO_USERNAME && env.MONGO_PASSWORD
      ? `${encodeURIComponent(env.MONGO_USERNAME)}:${encodeURIComponent(env.MONGO_PASSWORD)}@`
      : "";
  const query = new URLSearchParams();
  if (env.MONGO_USERNAME && env.MONGO_PASSWORD) {
    query.set("authSource", env.MONGO_AUTH_SOURCE || env.MONGO_DATABASE);
  }
  if (env.MONGO_REPLICA_SET) {
    query.set("replicaSet", env.MONGO_REPLICA_SET);
  }
  if (env.MONGO_SSL_CA_FILE) {
    query.set("tls", "true");
  }

  const queryString = query.toString();
  return `mongodb://${auth}${env.MONGO_HOST}:${env.MONGO_PORT}/${env.MONGO_DATABASE}${queryString ? `?${queryString}` : ""}`;
}

function buildMongoOptions(env: AppEnv): MongoClientOptions {
  const options: MongoClientOptions = {};

  if (env.MONGO_SSL_CA_FILE) {
    options.tls = true;
    options.tlsCAFile = env.MONGO_SSL_CA_FILE;
  }

  if (env.MONGO_REPLICA_SET) {
    options.replicaSet = env.MONGO_REPLICA_SET;
  }

  return options;
}

async function ensureIndexes(db: Db) {
  try {
    await Promise.all([
      db.collection(COLLECTIONS.runtimeConfigs).createIndex({ name: 1 }, { unique: true }),
      db.collection(COLLECTIONS.developers).createIndex({ email: 1 }, { unique: true }),
      db.collection(COLLECTIONS.issues).createIndex({ configName: 1, jiraKey: 1 }, { unique: true }),
      db.collection(COLLECTIONS.issueLocks).createIndex({ jiraKey: 1 }, { unique: true }),
      db.collection(COLLECTIONS.runs).createIndex({ issueId: 1, createdAt: -1 }),
      db.collection(COLLECTIONS.executions).createIndex({ jobId: 1, stage: 1, startedAt: -1 }),
      db.collection(COLLECTIONS.jiraIssues).createIndex({ issueKey: 1, createdAt: -1 }),
      db.collection(COLLECTIONS.jiraIssues).createIndex({ runId: 1 }, { sparse: true }),
      db.collection(COLLECTIONS.jiraIssues).createIndex({ jobId: 1 }, { sparse: true })
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not authorized")) {
      console.warn(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "warn",
          message: "Mongo index creation skipped due to insufficient privileges",
          detail: message
        })
      );
      return;
    }
    throw error;
  }
}

async function loadRuntimeConfig(db: Db): Promise<RuntimeConfig> {
  const collection = db.collection<RuntimeConfigDocument>(COLLECTIONS.runtimeConfigs);
  const doc = await collection.findOne({ active: true });
  if (!doc) {
    await collection.insertOne({
      _id: "default",
      name: "Default",
      active: true,
      queueState: "idle",
      ...defaultRuntimeConfig,
      createdAt: new Date().toISOString()
    });
    return defaultRuntimeConfig;
  }

  return {
    jiraProjectKey: doc.jiraProjectKey ?? defaultRuntimeConfig.jiraProjectKey,
    jiraJql: doc.jiraJql ?? defaultRuntimeConfig.jiraJql,
    developerList: doc.developerList ?? defaultRuntimeConfig.developerList,
    leadDeveloperEmail: doc.leadDeveloperEmail ?? defaultRuntimeConfig.leadDeveloperEmail,
    gitProvider: doc.gitProvider ?? defaultRuntimeConfig.gitProvider,
    gitOwner: doc.gitOwner ?? defaultRuntimeConfig.gitOwner,
    gitRepository: doc.gitRepository ?? defaultRuntimeConfig.gitRepository,
    repositoryPath: doc.repositoryPath ?? defaultRuntimeConfig.repositoryPath,
    baseBranch: doc.baseBranch ?? defaultRuntimeConfig.baseBranch,
    branchPrefix: doc.branchPrefix ?? defaultRuntimeConfig.branchPrefix,
    autoPickEnabled: doc.autoPickEnabled ?? defaultRuntimeConfig.autoPickEnabled,
    reviewRequired: doc.reviewRequired ?? defaultRuntimeConfig.reviewRequired,
    prTitleTemplate: doc.prTitleTemplate ?? defaultRuntimeConfig.prTitleTemplate,
    prBodyTemplate: doc.prBodyTemplate ?? defaultRuntimeConfig.prBodyTemplate,
    modelProvider: doc.modelProvider ?? defaultRuntimeConfig.modelProvider,
    modelName: doc.modelName ?? defaultRuntimeConfig.modelName,
    modelBaseUrl: doc.modelBaseUrl ?? defaultRuntimeConfig.modelBaseUrl,
    modelTemperature: doc.modelTemperature ?? defaultRuntimeConfig.modelTemperature,
    modelMaxTokens: doc.modelMaxTokens ?? defaultRuntimeConfig.modelMaxTokens,
    codingAgentCommand: doc.codingAgentCommand ?? defaultRuntimeConfig.codingAgentCommand,
    codingAgentArgs: doc.codingAgentArgs ?? defaultRuntimeConfig.codingAgentArgs,
    codingAgentTimeoutMs: doc.codingAgentTimeoutMs ?? defaultRuntimeConfig.codingAgentTimeoutMs,
    updatedAt: doc.updatedAt ?? defaultRuntimeConfig.updatedAt
  };
}

async function listRuntimeConfigs(db: Db): Promise<RuntimeConfigRecord[]> {
  const collection = db.collection<RuntimeConfigDocument>(COLLECTIONS.runtimeConfigs);
  const docs = await collection.find({}).sort({ active: -1, name: 1 }).toArray();
  if (docs.length === 0) {
    const createdAt = new Date().toISOString();
    await collection.insertOne({
      _id: "default",
      name: "Default",
      active: true,
      queueState: "idle",
      ...defaultRuntimeConfig,
      createdAt
    });
    return [
      {
        name: "Default",
        active: true,
        queueState: "idle",
        ...defaultRuntimeConfig,
        createdAt
      }
    ];
  }

  return docs.map((doc) => ({
    name: doc.name,
    active: doc.active,
    queueState: doc.queueState ?? "idle",
    jiraProjectKey: doc.jiraProjectKey ?? defaultRuntimeConfig.jiraProjectKey,
    jiraJql: doc.jiraJql ?? defaultRuntimeConfig.jiraJql,
    developerList: doc.developerList ?? defaultRuntimeConfig.developerList,
    leadDeveloperEmail: doc.leadDeveloperEmail ?? defaultRuntimeConfig.leadDeveloperEmail,
    gitProvider: doc.gitProvider ?? defaultRuntimeConfig.gitProvider,
    gitOwner: doc.gitOwner ?? defaultRuntimeConfig.gitOwner,
    gitRepository: doc.gitRepository ?? defaultRuntimeConfig.gitRepository,
    repositoryPath: doc.repositoryPath ?? defaultRuntimeConfig.repositoryPath,
    baseBranch: doc.baseBranch ?? defaultRuntimeConfig.baseBranch,
    branchPrefix: doc.branchPrefix ?? defaultRuntimeConfig.branchPrefix,
    autoPickEnabled: doc.autoPickEnabled ?? defaultRuntimeConfig.autoPickEnabled,
    reviewRequired: doc.reviewRequired ?? defaultRuntimeConfig.reviewRequired,
    prTitleTemplate: doc.prTitleTemplate ?? defaultRuntimeConfig.prTitleTemplate,
    prBodyTemplate: doc.prBodyTemplate ?? defaultRuntimeConfig.prBodyTemplate,
    modelProvider: doc.modelProvider ?? defaultRuntimeConfig.modelProvider,
    modelName: doc.modelName ?? defaultRuntimeConfig.modelName,
    modelBaseUrl: doc.modelBaseUrl ?? defaultRuntimeConfig.modelBaseUrl,
    modelTemperature: doc.modelTemperature ?? defaultRuntimeConfig.modelTemperature,
    modelMaxTokens: doc.modelMaxTokens ?? defaultRuntimeConfig.modelMaxTokens,
    codingAgentCommand: doc.codingAgentCommand ?? defaultRuntimeConfig.codingAgentCommand,
    codingAgentArgs: doc.codingAgentArgs ?? defaultRuntimeConfig.codingAgentArgs,
    codingAgentTimeoutMs: doc.codingAgentTimeoutMs ?? defaultRuntimeConfig.codingAgentTimeoutMs,
    updatedAt: doc.updatedAt ?? defaultRuntimeConfig.updatedAt,
    createdAt: doc.createdAt,
    lastProcessedAt: doc.lastProcessedAt,
    lastError: doc.lastError
  }));
}

async function upsertRuntimeConfig(
  db: Db,
  name: string,
  patch: Partial<RuntimeConfigRecord>
): Promise<RuntimeConfigRecord> {
  const collection = db.collection<RuntimeConfigDocument>(COLLECTIONS.runtimeConfigs);
  const existing = await collection.findOne({ name });
  const currentRuntime: RuntimeConfig =
    existing
      ? {
          jiraProjectKey: existing.jiraProjectKey ?? defaultRuntimeConfig.jiraProjectKey,
          jiraJql: existing.jiraJql ?? defaultRuntimeConfig.jiraJql,
          developerList: existing.developerList ?? defaultRuntimeConfig.developerList,
          leadDeveloperEmail: existing.leadDeveloperEmail ?? defaultRuntimeConfig.leadDeveloperEmail,
          gitProvider: existing.gitProvider ?? defaultRuntimeConfig.gitProvider,
          gitOwner: existing.gitOwner ?? defaultRuntimeConfig.gitOwner,
          gitRepository: existing.gitRepository ?? defaultRuntimeConfig.gitRepository,
          repositoryPath: existing.repositoryPath ?? defaultRuntimeConfig.repositoryPath,
          baseBranch: existing.baseBranch ?? defaultRuntimeConfig.baseBranch,
          branchPrefix: existing.branchPrefix ?? defaultRuntimeConfig.branchPrefix,
          autoPickEnabled: existing.autoPickEnabled ?? defaultRuntimeConfig.autoPickEnabled,
          reviewRequired: existing.reviewRequired ?? defaultRuntimeConfig.reviewRequired,
          prTitleTemplate: existing.prTitleTemplate ?? defaultRuntimeConfig.prTitleTemplate,
          prBodyTemplate: existing.prBodyTemplate ?? defaultRuntimeConfig.prBodyTemplate,
          modelProvider: existing.modelProvider ?? defaultRuntimeConfig.modelProvider,
          modelName: existing.modelName ?? defaultRuntimeConfig.modelName,
          modelBaseUrl: existing.modelBaseUrl ?? defaultRuntimeConfig.modelBaseUrl,
          modelTemperature: existing.modelTemperature ?? defaultRuntimeConfig.modelTemperature,
          modelMaxTokens: existing.modelMaxTokens ?? defaultRuntimeConfig.modelMaxTokens,
          codingAgentCommand: existing.codingAgentCommand ?? defaultRuntimeConfig.codingAgentCommand,
          codingAgentArgs: existing.codingAgentArgs ?? defaultRuntimeConfig.codingAgentArgs,
          codingAgentTimeoutMs: existing.codingAgentTimeoutMs ?? defaultRuntimeConfig.codingAgentTimeoutMs,
          updatedAt: existing.updatedAt ?? defaultRuntimeConfig.updatedAt
        }
      : defaultRuntimeConfig;

  const currentMetadata = {
    active: existing?.active ?? false,
    queueState: existing?.queueState ?? "idle",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    lastProcessedAt: existing?.lastProcessedAt,
    lastError: existing?.lastError
  };

  const runtimePatch: Partial<RuntimeConfig> = {};
  if (patch.jiraProjectKey !== undefined) runtimePatch.jiraProjectKey = patch.jiraProjectKey;
  if (patch.jiraJql !== undefined) runtimePatch.jiraJql = patch.jiraJql;
  if (patch.developerList !== undefined) runtimePatch.developerList = patch.developerList;
  if (patch.leadDeveloperEmail !== undefined) runtimePatch.leadDeveloperEmail = patch.leadDeveloperEmail;
  if (patch.gitProvider !== undefined) runtimePatch.gitProvider = patch.gitProvider;
  if (patch.gitOwner !== undefined) runtimePatch.gitOwner = patch.gitOwner;
  if (patch.gitRepository !== undefined) runtimePatch.gitRepository = patch.gitRepository;
  if (patch.repositoryPath !== undefined) runtimePatch.repositoryPath = patch.repositoryPath;
  if (patch.baseBranch !== undefined) runtimePatch.baseBranch = patch.baseBranch;
  if (patch.branchPrefix !== undefined) runtimePatch.branchPrefix = patch.branchPrefix;
  if (patch.autoPickEnabled !== undefined) runtimePatch.autoPickEnabled = patch.autoPickEnabled;
  if (patch.reviewRequired !== undefined) runtimePatch.reviewRequired = patch.reviewRequired;
  if (patch.prTitleTemplate !== undefined) runtimePatch.prTitleTemplate = patch.prTitleTemplate;
  if (patch.prBodyTemplate !== undefined) runtimePatch.prBodyTemplate = patch.prBodyTemplate;
  if (patch.modelProvider !== undefined) runtimePatch.modelProvider = patch.modelProvider;
  if (patch.modelName !== undefined) runtimePatch.modelName = patch.modelName;
  if (patch.modelBaseUrl !== undefined) runtimePatch.modelBaseUrl = patch.modelBaseUrl;
  if (patch.modelTemperature !== undefined) runtimePatch.modelTemperature = patch.modelTemperature;
  if (patch.modelMaxTokens !== undefined) runtimePatch.modelMaxTokens = patch.modelMaxTokens;
  if (patch.codingAgentCommand !== undefined) runtimePatch.codingAgentCommand = patch.codingAgentCommand;
  if (patch.codingAgentArgs !== undefined) runtimePatch.codingAgentArgs = patch.codingAgentArgs;
  if (patch.codingAgentTimeoutMs !== undefined) runtimePatch.codingAgentTimeoutMs = patch.codingAgentTimeoutMs;
  if (patch.updatedAt !== undefined) runtimePatch.updatedAt = patch.updatedAt;

  const nextRuntime = mergeRuntimeConfig(currentRuntime, runtimePatch);
  const nextMetadata = {
    active: patch.active ?? currentMetadata.active,
    queueState: patch.queueState ?? currentMetadata.queueState,
    lastProcessedAt: patch.lastProcessedAt ?? currentMetadata.lastProcessedAt,
    lastError: patch.lastError ?? currentMetadata.lastError
  };
  await collection.updateOne(
    { name },
    {
      $set: {
        name,
        active: nextMetadata.active,
        queueState: nextMetadata.queueState,
        lastProcessedAt: nextMetadata.lastProcessedAt,
        lastError: nextMetadata.lastError,
        ...nextRuntime
      },
      $setOnInsert: {
        _id: name,
        createdAt: currentMetadata.createdAt
      }
    },
    { upsert: true }
  );

  return {
    name,
    active: nextMetadata.active,
    queueState: nextMetadata.queueState,
    ...nextRuntime,
    createdAt: currentMetadata.createdAt,
    lastProcessedAt: nextMetadata.lastProcessedAt,
    lastError: nextMetadata.lastError
  };
}

async function claimIssueLock(db: Db, jiraKey: string, configName: string): Promise<boolean> {
  const collection = db.collection<{ jiraKey: string; lockedByConfig?: string; lockedAt?: string }>(
    COLLECTIONS.issueLocks
  );
  const existing = await collection.findOne({ jiraKey });
  if (existing) {
    return existing.lockedByConfig === configName;
  }

  try {
    await collection.insertOne({
      jiraKey,
      lockedByConfig: configName,
      lockedAt: new Date().toISOString()
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("duplicate key")) {
      return false;
    }
    throw error;
  }
}

async function listQueueSummaries(db: Db): Promise<QueueSummary[]> {
  const configs = await listRuntimeConfigs(db);
  const issues = await db.collection<IssueRecord>(COLLECTIONS.issues).find({}).toArray();

  return configs.map((config) => {
    const items = issues.filter((issue) => issue.configName === config.name);
    const counts = {
      queued: items.filter((item) => item.status === "queued").length,
      in_progress: items.filter((item) => item.status === "picked" || item.status === "in_progress").length,
      completed: items.filter((item) => item.status === "ready_for_review" || item.status === "done").length,
      failed: items.filter((item) => item.status === "blocked").length,
      blocked: items.filter((item) => item.status === "blocked").length
    };

    return {
      configName: config.name,
      active: config.active,
      queueState: config.queueState,
      counts,
      lastProcessedAt: config.lastProcessedAt,
      lastError: config.lastError
    };
  });
}

function mongoRepo(db: Db): Repository {
  return {
    async getRuntimeConfig() {
      return loadRuntimeConfig(db);
    },
    async listRuntimeConfigs() {
      return listRuntimeConfigs(db);
    },
    async upsertRuntimeConfig(name, patch) {
      return upsertRuntimeConfig(db, name, patch);
    },
    async listDevelopers() {
      return db.collection<Developer>(COLLECTIONS.developers).find({}).sort({ name: 1 }).toArray();
    },
    async saveDeveloper(developer) {
      await db.collection(COLLECTIONS.developers).updateOne(
        { email: developer.email },
        { $set: developer },
        { upsert: true }
      );
      return developer;
    },
    async listIssues() {
      return db.collection<IssueRecord>(COLLECTIONS.issues).find({}).sort({ updatedAt: -1 }).toArray();
    },
    async saveIssue(issue) {
      await db.collection(COLLECTIONS.issues).updateOne(
        { configName: issue.configName, jiraKey: issue.jiraKey },
        { $set: issue },
        { upsert: true }
      );
      return issue;
    },
    async claimIssueLock(jiraKey, configName) {
      return claimIssueLock(db, jiraKey, configName);
    },
    async releaseIssueLock(jiraKey, configName) {
      await db.collection(COLLECTIONS.issueLocks).deleteOne({ jiraKey, lockedByConfig: configName });
    },
    async listQueueSummaries() {
      return listQueueSummaries(db);
    },
    async listRuns() {
      return db.collection<AgentRun>(COLLECTIONS.runs).find({}).sort({ createdAt: -1 }).toArray();
    },
    async saveRun(run) {
      await db.collection(COLLECTIONS.runs).updateOne({ id: run.id }, { $set: run }, { upsert: true });
      return run;
    },
    async listExecutions() {
      return db.collection<AgentExecution>(COLLECTIONS.executions).find({}).sort({ startedAt: -1 }).toArray();
    },
    async saveExecution(execution) {
      await db.collection(COLLECTIONS.executions).updateOne(
        { id: execution.id },
        { $set: execution },
        { upsert: true }
      );
      return execution;
    },
    async listJiraIssues() {
      return db.collection<JiraIssueRecord>(COLLECTIONS.jiraIssues).find({}).sort({ createdAt: -1 }).toArray();
    },
    async saveJiraIssue(record) {
      await db.collection(COLLECTIONS.jiraIssues).updateOne(
        { id: record.id },
        { $set: record },
        { upsert: true }
      );
      return record;
    },
    async health() {
      return { mode: "mongo", connected: true };
    }
  };
}

export async function createRepository(env: AppEnv): Promise<Repository> {
  const db = await connectMongo(env);
  return mongoRepo(db);
}
