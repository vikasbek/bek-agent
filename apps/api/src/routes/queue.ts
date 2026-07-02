import { Router } from "express";
import type { Repository } from "../../../../packages/db/src/mongo";

export function queueRouter(repository: Repository) {
  const router = Router();

  router.get("/", async (_req, res) => {
    res.json(await repository.listQueueSummaries());
  });

  return router;
}
