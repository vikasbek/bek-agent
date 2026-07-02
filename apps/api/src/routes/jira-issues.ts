import { Router } from "express";
import type { Repository } from "../../../../packages/db/src/mongo";

export function jiraIssuesRouter(repository: Repository) {
  const router = Router();

  router.get("/", async (_req, res) => {
    res.json(await repository.listJiraIssues());
  });

  return router;
}
