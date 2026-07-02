import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { loadEnv, type AppEnv } from "./env";

function findEnvRoot(startDir: string) {
  let current = startDir;
  while (true) {
    const hasProfileFiles =
      fs.existsSync(path.join(current, ".env.development")) ||
      fs.existsSync(path.join(current, ".env.staging")) ||
      fs.existsSync(path.join(current, ".env.production"));
    if (hasProfileFiles) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

function profileFileName(appEnv: AppEnv["APP_ENV"]) {
  if (appEnv === "staging") {
    return ".env.staging";
  }
  if (appEnv === "prod") {
    return ".env.production";
  }
  return ".env.development";
}

export function bootstrapEnv(cwd = process.cwd()): AppEnv {
  const envRoot = findEnvRoot(cwd);
  const baseEnvFile = path.join(envRoot, ".env");
  if (fs.existsSync(baseEnvFile)) {
    dotenv.config({ path: baseEnvFile });
  }

  const profile = process.env.APP_ENV === "staging" ? "staging" : process.env.APP_ENV === "prod" ? "prod" : "dev";
  const profileEnvFile = path.join(envRoot, profileFileName(profile));
  if (fs.existsSync(profileEnvFile)) {
    dotenv.config({ path: profileEnvFile, override: true });
  }

  if (process.env.MONGO_SSL_CA_FILE && !path.isAbsolute(process.env.MONGO_SSL_CA_FILE)) {
    process.env.MONGO_SSL_CA_FILE = path.join(envRoot, process.env.MONGO_SSL_CA_FILE);
  }

  return loadEnv(process.env);
}
