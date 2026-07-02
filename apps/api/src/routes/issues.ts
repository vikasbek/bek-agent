import { Router } from "express";
import { z } from "zod";
import type { Repository } from "../../../../packages/db/src/mongo";

const issueSchema = z.object({
  id: z.string().min(1),
  jiraKey: z.string().min(1),
  summary: z.string().min(1),
  assigneeEmail: z.string().email().optional(),
  status: z.enum(["queued", "picked", "in_progress", "ready_for_review", "done", "blocked"]),
  branchName: z.string().optional(),
  prUrl: z.string().url().optional(),
  developerId: z.string().optional(),
  updatedAt: z.string().optional()
});

export function issuesRouter(repository: Repository) {
  const router = Router();

  router.get("/", async (_req, res) => {
    res.json(await repository.listIssues());
  });

  router.post("/", async (req, res) => {
    const issue = issueSchema.parse(req.body);
    const normalized = {
      ...issue,
      updatedAt: issue.updatedAt ?? new Date().toISOString()
    };
    res.status(201).json(await repository.saveIssue(normalized));
  });

  router.post("/:id/rerun", async (req, res) => {
    const issueId = z.string().min(1).parse(req.params.id);
    const issues = await repository.listIssues();
    const issue = issues.find((item) => item.id === issueId);
    if (!issue) {
      res.status(404).json({ ok: false, message: "Issue not found" });
      return;
    }

    const saved = await repository.saveIssue({
      ...issue,
      status: "queued",
      lockStatus: "unlocked",
      lockedByConfig: undefined,
      lockedAt: undefined,
      lastError: undefined,
      lastProcessedAt: undefined,
      updatedAt: new Date().toISOString()
    });

    res.json({
      ok: true,
      issue: saved
    });
  });

  return router;
}
