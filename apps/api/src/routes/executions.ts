import { Router } from "express";
import type { Repository } from "../../../../packages/db/src/mongo";

export function executionsRouter(repository: Repository) {
  const router = Router();

  router.get("/", async (_req, res) => {
    res.json(await repository.listExecutions());
  });

  return router;
}
