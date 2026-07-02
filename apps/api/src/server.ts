import { createServer } from "./server-app";
import { bootstrapEnv } from "../../../packages/config/src/bootstrap";
import { createRepository } from "../../../packages/db/src/mongo";
import { logger } from "../../../packages/utils/src/logger";

async function main() {
  const env = bootstrapEnv();
  const repository = await createRepository(env);
  const app = createServer({ env, repository });

  app.listen(env.API_PORT, () => {
    logger.info("viBek api listening", {
      port: env.API_PORT,
      appEnv: env.APP_ENV
    });
  });
}

main().catch((error) => {
  logger.error("failed to start api", {
    message: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
