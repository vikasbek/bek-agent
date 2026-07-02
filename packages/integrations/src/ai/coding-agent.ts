import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "../../../utils/src/logger";
import { IntegrationError } from "../../../utils/src/errors";

const execFileAsync = promisify(execFile);

const MAX_OUTPUT_CHARS = 2 * 1024 * 1024;

export type CodingAgentRequest = {
  repoPath: string;
  branchName: string;
  issueKey: string;
  summary: string;
  description: string;
  requirementSummary: string;
  command: string;
  args: string[];
  timeoutMs: number;
};

export type CodingAgentResult = {
  ok: boolean;
  rawOutput: string;
  commitMessage: string;
};

function buildTaskPrompt(req: CodingAgentRequest) {
  return [
    `You are implementing Jira issue ${req.issueKey} on branch ${req.branchName}.`,
    `Summary: ${req.summary}`,
    `Description: ${req.description}`,
    `Requirement analysis: ${req.requirementSummary}`,
    "",
    "Make the minimal set of code changes in this repository to satisfy the issue.",
    "Do not run git commit, git push, or create a pull request yourself - only edit files on disk.",
    "When you are done, print a single final line in the exact form:",
    "COMMIT_MESSAGE: <conventional commit message>"
  ].join("\n");
}

export async function testCodingAgentCli(command: string): Promise<{ ok: true; message: string }> {
  if (!command) {
    throw new IntegrationError("codingAgentCommand is not configured");
  }

  try {
    await execFileAsync(command, ["--version"], { timeout: 5000 });
    return { ok: true, message: `${command} is available on PATH` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new IntegrationError(`Coding agent CLI "${command}" is not available: ${message}`);
  }
}

function makeLineLogger(issueKey: string, stream: "stdout" | "stderr") {
  let buffered = "";
  return (chunk: Buffer) => {
    buffered += chunk.toString("utf8");
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      logger.info("coding agent output", { issueKey, stream, line });
    }
  };
}

export async function runCodingAgent(req: CodingAgentRequest): Promise<CodingAgentResult> {
  if (!req.command) {
    throw new IntegrationError("codingAgentCommand is not configured for this runtime config");
  }

  const task = buildTaskPrompt(req);

  logger.info("coding agent invoke", {
    issueKey: req.issueKey,
    command: req.command,
    args: req.args,
    repoPath: req.repoPath,
    timeoutMs: req.timeoutMs
  });

  return new Promise<CodingAgentResult>((resolve) => {
    const child = spawn(req.command, [...req.args, task], {
      cwd: req.repoPath,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let output = "";
    let timedOut = false;
    let settled = false;

    const appendOutput = (chunk: Buffer) => {
      if (output.length < MAX_OUTPUT_CHARS) {
        output += chunk.toString("utf8");
      }
    };

    const logStdout = makeLineLogger(req.issueKey, "stdout");
    const logStderr = makeLineLogger(req.issueKey, "stderr");

    child.stdout?.on("data", (chunk: Buffer) => {
      appendOutput(chunk);
      logStdout(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      appendOutput(chunk);
      logStderr(chunk);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      logger.warn("coding agent timed out, killing process", {
        issueKey: req.issueKey,
        timeoutMs: req.timeoutMs
      });
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, req.timeoutMs);
    timer.unref();

    const finish = (result: CodingAgentResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    child.on("error", (error) => {
      logger.error("coding agent failed to start", { issueKey: req.issueKey, message: error.message });
      finish({ ok: false, rawOutput: error.message, commitMessage: "" });
    });

    child.on("close", (code, signal) => {
      if (timedOut) {
        logger.error("coding agent timed out", { issueKey: req.issueKey, timeoutMs: req.timeoutMs });
        finish({
          ok: false,
          rawOutput: `${output}\n<timed out after ${req.timeoutMs}ms>`,
          commitMessage: ""
        });
        return;
      }

      if (code !== 0) {
        logger.error("coding agent failed", { issueKey: req.issueKey, exitCode: code, signal });
        finish({ ok: false, rawOutput: output, commitMessage: "" });
        return;
      }

      const matches = [...output.matchAll(/COMMIT_MESSAGE:\s*(.+)/g)];
      const commitMessage =
        matches[matches.length - 1]?.[1]?.trim() || `feat(${req.issueKey}): implement Jira requirement`;
      logger.info("coding agent completed", { issueKey: req.issueKey, commitMessage });
      finish({ ok: true, rawOutput: output, commitMessage });
    });
  });
}
