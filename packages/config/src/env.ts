import { z } from "zod";

export const envSchema = z.object({
  APP_ENV: z.enum(["dev", "staging", "prod"]).default("dev"),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4000),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_API_BASE_URL: z.string().url().default("http://localhost:4000"),
  MONGO_URI: z.string().optional().default(""),
  MONGO_HOST: z.string().optional().default(""),
  MONGO_PORT: z.coerce.number().default(27017),
  MONGO_DATABASE: z.string().default("vienna"),
  MONGO_USERNAME: z.string().optional().default(""),
  MONGO_PASSWORD: z.string().optional().default(""),
  MONGO_AUTH_SOURCE: z.string().optional().default(""),
  MONGO_REPLICA_SET: z.string().optional().default(""),
  MONGO_PRIMARY: z.coerce.boolean().default(true),
  MONGO_SSL_CA_FILE: z.string().optional().default(""),
  MONGO_SSL_CA_PASSWORD: z.string().optional().default(""),
  MONGO_REPOSITORIES_ENABLED: z.string().optional().default("true"),
  REDIS_URL: z.string().optional().default(""),
  JIRA_BASE_URL: z.string().optional().default(""),
  JIRA_EMAIL: z.string().optional().default(""),
  JIRA_API_TOKEN: z.string().optional().default(""),
  GIT_PROVIDER: z.enum(["github", "gitlab", "bitbucket"]).default("github"),
  GIT_TOKEN: z.string().optional().default(""),
  GIT_OWNER: z.string().optional().default(""),
  GIT_REPOSITORY: z.string().optional().default(""),
  REPOSITORY_PATH: z.string().optional().default(""),
  AI_API_KEY: z.string().optional().default(""),
  LOG_MODEL_PROMPTS: z.coerce.boolean().default(false),
  DEFAULT_BASE_BRANCH: z.string().default("master"),
  WORKER_PARALLELISM: z.coerce.number().default(2),
  AGENT_CLI_COMMAND: z.string().optional().default("codex"),
  AGENT_CLI_ARGS: z.string().optional().default("exec --full-auto"),
  AGENT_CLI_TIMEOUT_MS: z.coerce.number().default(15 * 60 * 1000)
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(source);
}
