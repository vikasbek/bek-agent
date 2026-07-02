import express, { type Express } from "express";
import cors from "cors";
import { healthRouter } from "./routes/health";
import { settingsRouter } from "./routes/settings";
import { queueRouter } from "./routes/queue";
import { workerRouter } from "./routes/worker";
import { developersRouter } from "./routes/developers";
import { issuesRouter } from "./routes/issues";
import { runsRouter } from "./routes/runs";
import { executionsRouter } from "./routes/executions";
import { jiraIssuesRouter } from "./routes/jira-issues";
import type { AppEnv } from "../../../packages/config/src/env";
import type { Repository } from "../../../packages/db/src/mongo";

export function createServer({ env, repository }: { env: AppEnv; repository: Repository }): Express {
  const app = express();

  app.use(
    cors({
      origin: [env.APP_BASE_URL, env.NEXT_PUBLIC_API_BASE_URL],
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.use("/health", healthRouter(repository, env));
  app.use("/api/settings", settingsRouter(repository, env));
  app.use("/api/queue", queueRouter(repository));
  app.use("/api/worker", workerRouter(repository, env));
  app.use("/api/developers", developersRouter(repository));
  app.use("/api/issues", issuesRouter(repository));
  app.use("/api/runs", runsRouter(repository));
  app.use("/api/executions", executionsRouter(repository));
  app.use("/api/jira-issues", jiraIssuesRouter(repository));

  app.get("/", (_req, res) => {
    res.json({
      name: "etbek api",
      status: "ok",
      appEnv: env.APP_ENV
    });
  });

  return app;
}
