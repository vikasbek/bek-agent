import { Router } from "express";
import type { Repository } from "../../../../packages/db/src/mongo";
import type { AppEnv } from "../../../../packages/config/src/env";
import { runActiveConfigs } from "../../../../packages/agent/src/runner";

export function workerRouter(repository: Repository, env: AppEnv) {
  const router = Router();

  router.post("/run-now", async (_req, res) => {
    const result = await runActiveConfigs(repository, env);
    res.json({
      ok: true,
      ...result
    });
  });

  return router;
}
