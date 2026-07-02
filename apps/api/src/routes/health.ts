import { Router } from "express";
import type { AppEnv } from "../../../../packages/config/src/env";
import type { Repository } from "../../../../packages/db/src/mongo";

export function healthRouter(repository: Repository, env: AppEnv) {
  const router = Router();

  router.get("/", async (_req, res) => {
    const db = await repository.health();
    res.json({
      ok: true,
      appEnv: env.APP_ENV,
      database: db,
      ts: new Date().toISOString()
    });
  });

  return router;
}
