import { Router } from "express";
import { z } from "zod";
import type { Repository } from "../../../../packages/db/src/mongo";

const runSchema = z.object({
  id: z.string().min(1),
  issueId: z.string().min(1),
  issueKey: z.string().optional(),
  action: z.enum(["pick", "branch", "develop", "pr"]),
  status: z.enum(["pending", "running", "success", "failed"]),
  message: z.string().optional(),
  jiraContent: z
    .object({
      jiraKey: z.string(),
      summary: z.string().optional(),
      assigneeEmail: z.string().optional(),
      status: z.string().optional(),
      raw: z.unknown().optional()
    })
    .optional(),
  jiraIssue: z.unknown().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

export function runsRouter(repository: Repository) {
  const router = Router();

  router.get("/", async (_req, res) => {
    res.json(await repository.listRuns());
  });

  router.post("/", async (req, res) => {
    const run = runSchema.parse(req.body);
    const normalized = {
      ...run,
      createdAt: run.createdAt ?? new Date().toISOString(),
      updatedAt: run.updatedAt ?? new Date().toISOString()
    };
    res.status(201).json(await repository.saveRun(normalized));
  });

  return router;
}
