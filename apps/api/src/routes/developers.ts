import { Router } from "express";
import { z } from "zod";
import type { Repository } from "../../../../packages/db/src/mongo";
import { logger } from "../../../../packages/utils/src/logger";

const developerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  active: z.boolean().default(true),
  jiraAccountId: z.string().optional()
});

export function developersRouter(repository: Repository) {
  const router = Router();

  router.get("/", async (_req, res) => {
    res.json(await repository.listDevelopers());
  });

  router.post("/", async (req, res) => {
    const developer = developerSchema.parse(req.body);
    const existing = (await repository.listDevelopers()).find((item) => item.email === developer.email);
    const saved = await repository.saveDeveloper(developer);
    logger.info("developer saved", {
      action: existing ? "update" : "create",
      developerId: saved.id,
      email: saved.email
    });
    res.status(201).json(saved);
  });

  return router;
}
