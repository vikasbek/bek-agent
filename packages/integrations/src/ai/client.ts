import { logger } from "../../../utils/src/logger";

export type ModelProviderName = "codex" | "ollama" | "openai" | "custom" | "coding-agent-cli";

export type RequirementAnalysis = {
  decision: "requirements_complete" | "requirements_gap" | "needs_clarification";
  summary: string;
  gapSummary?: string;
  commentToReporter?: string;
  confidence?: number;
};

export type ChangePlan = {
  decision: "proceed" | "requirements_gap" | "needs_clarification";
  summary: string;
  commitMessage: string;
  notes?: string;
  patch: string;
};

export type PatchRepairRequest = {
  issueKey: string;
  summary: string;
  requirementSummary: string;
  patchError: string;
  patch: string;
};

export type ModelProviderConfig = {
  provider: ModelProviderName;
  modelName: string;
  baseUrl?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
};

function parseJson<T>(value: string, fallback: T): T {
  const normalized = extractJsonCandidate(value);
  try {
    return JSON.parse(normalized) as T;
  } catch {
    return fallback;
  }
}

function extractJsonCandidate(value: string) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstObject = trimmed.match(/\{[\s\S]*\}/);
  if (firstObject?.[0]) {
    return firstObject[0];
  }

  const firstArray = trimmed.match(/\[[\s\S]*\]/);
  if (firstArray?.[0]) {
    return firstArray[0];
  }

  return trimmed;
}

export function normalizeJiraText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJiraText(item)).filter(Boolean).join(" ");
  }
  if (typeof value === "object") {
    const doc = value as Record<string, unknown>;
    if (typeof doc.text === "string") {
      return doc.text;
    }
    if (typeof doc.body === "string") {
      return doc.body;
    }
    if (Array.isArray(doc.content)) {
      return doc.content.map((item) => normalizeJiraText(item)).filter(Boolean).join(" ");
    }
    return Object.values(doc)
      .map((item) => normalizeJiraText(item))
      .filter(Boolean)
      .join(" ");
  }
  return String(value);
}

function sanitizeJiraComment(value: string) {
  return value
    .replace(/Hi I am viBek:[\s\S]*?(?=\nhttps?:\/\/|\n[A-Z][a-z]+:|\n\n|$)/g, "")
    .replace(/Hi I am etBek:[\s\S]*?(?=\nhttps?:\/\/|\n[A-Z][a-z]+:|\n\n|$)/g, "")
    .replace(/Status:\s*[A-Z_]+/gi, "")
    .replace(/Message:\s*[\s\S]*?(?=\nhttps?:\/\/|\n[A-Z][a-z]+:|\n\n|$)/g, "")
    .replace(/PR message:\s*[\s\S]*?(?=\nhttps?:\/\/|\n[A-Z][a-z]+:|\n\n|$)/g, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "")
    .replace(/\b\d{4,}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeJiraComment(value: unknown): string {
  const text = normalizeJiraText(value).trim();
  if (!text) {
    return "";
  }
  return sanitizeJiraComment(text);
}

function truncate(value: string, limit = 4000) {
  return value.length > limit ? `${value.slice(0, limit)}...<truncated>` : value;
}

function safePrompt(value: string) {
  return truncate(value.replace(/Authorization:\s*Basic\s+[^\s]+/gi, "Authorization: Basic [redacted]"));
}

function getOpenAIBaseUrl(baseUrl?: string) {
  const normalized = (baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

function extractResponseText(payload: unknown) {
  const doc = payload as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
      text?: string;
    }>;
  };

  if (typeof doc.output_text === "string" && doc.output_text.trim()) {
    return doc.output_text;
  }

  const fragments: string[] = [];
  for (const item of doc.output ?? []) {
    if (typeof item.text === "string") {
      fragments.push(item.text);
    }
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") {
        fragments.push(content.text);
      }
    }
  }

  return fragments.join("\n").trim();
}

export interface ModelProvider {
  testConnection(): Promise<{ ok: true; message: string }>;
  analyzeRequirement(input: {
    issueKey: string;
    summary: string;
    description?: string;
    comments?: string[];
  }): Promise<RequirementAnalysis>;
  generateImplementationPlan(input: {
    issueKey: string;
    summary: string;
    requirement: RequirementAnalysis;
  }): Promise<ChangePlan>;
  repairPatch(input: PatchRepairRequest): Promise<ChangePlan>;
}

class BaseProvider implements ModelProvider {
  constructor(protected readonly config: ModelProviderConfig) {}

  async testConnection() {
    return {
      ok: true as const,
      message: `Provider ${this.config.provider}:${this.config.modelName} is ready`
    };
  }

  protected logPrompt(stage: string, prompt: string) {
    logger.info("model prompt", {
      provider: this.config.provider,
      modelName: this.config.modelName,
      stage,
      prompt: safePrompt(prompt)
    });
  }

  protected logReply(stage: string, reply: unknown) {
    const serialized = typeof reply === "string" ? reply : JSON.stringify(reply);
    logger.info("model reply", {
      provider: this.config.provider,
      modelName: this.config.modelName,
      stage,
      reply: truncate(serialized)
    });
  }

  async analyzeRequirement(input: {
    issueKey: string;
    summary: string;
    description?: string;
    comments?: string[];
  }): Promise<RequirementAnalysis> {
    const description = normalizeJiraText(input.description).trim();
    const hasDescription = Boolean(description);
    if (!hasDescription) {
      return {
        decision: "needs_clarification",
        summary: `Issue ${input.issueKey} needs clarification`,
        gapSummary: "Jira description is missing or empty",
        commentToReporter: `Hi I am etBek: ${input.issueKey}\nI need a Jira description with the expected behavior, scope, and examples before I can implement this.`,
        confidence: 0.95
      };
    }

    return {
      decision: "requirements_complete",
      summary: `Requirement for ${input.issueKey} looks actionable`,
      confidence: 0.7
    };
  }

  async generateImplementationPlan(input: {
    issueKey: string;
    summary: string;
    requirement: RequirementAnalysis;
  }): Promise<ChangePlan> {
    return {
      decision: "proceed",
      summary: `No-op implementation plan for ${input.issueKey}`,
      commitMessage: `feat(${input.issueKey}): implement Jira requirement`,
      notes: `Plan generated by ${this.config.provider}:${this.config.modelName}`,
      patch: ""
    };
  }

  async repairPatch(input: PatchRepairRequest): Promise<ChangePlan> {
    return {
      decision: "proceed",
      summary: `Patch repair not available for ${input.issueKey}`,
      commitMessage: `feat(${input.issueKey}): implement Jira requirement`,
      notes: `Patch repair skipped for ${this.config.provider}:${this.config.modelName}`,
      patch: input.patch
    };
  }
}

abstract class OpenAICompatibleProvider extends BaseProvider {
  protected get endpoint() {
    return `${getOpenAIBaseUrl(this.config.baseUrl)}/responses`;
  }

  protected async callResponses(prompt: string, maxTokens: number) {
    if (!this.config.apiKey) {
      throw new Error("OpenAI API key is required for this provider. Set AI_API_KEY.");
    }

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.config.modelName,
        input: prompt,
        max_output_tokens: maxTokens
      })
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`OpenAI Responses API request failed: ${response.status} ${response.statusText}: ${message}`);
    }

    return response.json();
  }

  protected async callChatCompletions(prompt: string, maxTokens: number) {
    if (!this.config.apiKey) {
      throw new Error("OpenAI API key is required for this provider. Set AI_API_KEY.");
    }

    const response = await fetch(`${getOpenAIBaseUrl(this.config.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.config.modelName,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: maxTokens
      })
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`OpenAI Chat Completions request failed: ${response.status} ${response.statusText}: ${message}`);
    }

    return response.json();
  }

  protected async callOpenAIText(prompt: string, maxTokens: number) {
    try {
      return await this.callResponses(prompt, maxTokens);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("model") && message.includes("not found")) {
        logger.warn("responses api model not found, falling back to chat completions", {
          provider: this.config.provider,
          modelName: this.config.modelName,
          message
        });
        return await this.callChatCompletions(prompt, maxTokens);
      }
      throw error;
    }
  }
}

class OllamaProvider extends BaseProvider {
  async testConnection() {
    const baseUrl = this.config.baseUrl ?? "http://localhost:11434";
    const response = await fetch(`${baseUrl}/api/tags`, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Ollama connection failed with HTTP ${response.status}`);
    }
    return {
      ok: true as const,
      message: `Ollama reachable at ${baseUrl}`
    };
  }

  async analyzeRequirement(input: {
    issueKey: string;
    summary: string;
    description?: string;
    comments?: string[];
  }): Promise<RequirementAnalysis> {
    const baseUrl = this.config.baseUrl ?? "http://localhost:11434";
    const prompt = `Return JSON only with keys decision, summary, gapSummary, commentToReporter, confidence. Issue: ${input.issueKey}. Summary: ${input.summary}. Description: ${input.description ?? ""}. Comments: ${(input.comments ?? []).join("\n")}`;
    this.logPrompt("analyze_requirement", prompt);
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.modelName,
        prompt,
        stream: false,
        options: {
          temperature: this.config.temperature ?? 0.2,
          num_predict: this.config.maxTokens ?? 1024
        }
      })
    });
    if (!response.ok) {
      return super.analyzeRequirement(input);
    }
    const payload = (await response.json()) as { response?: string };
    this.logReply("analyze_requirement", payload.response ?? "");
    return parseJson<RequirementAnalysis>(
      payload.response ?? "",
      await super.analyzeRequirement(input)
    );
  }

  async generateImplementationPlan(input: {
    issueKey: string;
    summary: string;
    requirement: RequirementAnalysis;
  }): Promise<ChangePlan> {
    const baseUrl = this.config.baseUrl ?? "http://localhost:11434";
    const prompt = [
      "Return JSON only with keys decision, summary, commitMessage, notes, patch.",
      "Do not wrap the JSON in markdown or code fences.",
      "The patch must be a valid unified diff with explicit file headers and hunks.",
      "Do not return an empty patch if any source files can be modified.",
      "Target files must be existing repo files or clearly named new files.",
      `Issue: ${input.issueKey}`,
      `Summary: ${input.summary}`,
      `Requirement decision: ${input.requirement.decision}`,
      `Requirement summary: ${input.requirement.summary}`,
      `Gap summary: ${input.requirement.gapSummary ?? ""}`,
      "If you cannot determine a safe implementation, return decision requirements_gap and explain why.",
      "Suggested output shape:",
      JSON.stringify(
        {
          decision: "proceed",
          summary: "short summary",
          commitMessage: "feat(scope): concise message",
          notes: "optional implementation notes",
          patch: "diff --git a/path b/path\\n..."
        },
        null,
        2
      )
    ].join("\n");
    this.logPrompt("generate_plan", prompt);
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.modelName,
        prompt,
        stream: false,
        options: {
          temperature: this.config.temperature ?? 0.2,
          num_predict: this.config.maxTokens ?? 2048
        }
      })
    });
    if (!response.ok) {
      return super.generateImplementationPlan(input);
    }
    const payload = (await response.json()) as { response?: string };
    this.logReply("generate_plan", payload.response ?? "");
    return parseJson<ChangePlan>(
      payload.response ?? "",
      await super.generateImplementationPlan(input)
    );
  }

  async repairPatch(input: PatchRepairRequest): Promise<ChangePlan> {
    const baseUrl = this.config.baseUrl ?? "http://localhost:11434";
    const prompt = [
      "Return JSON only with keys decision, summary, commitMessage, notes, patch.",
      "Do not wrap the JSON in markdown or code fences.",
      "Fix the provided patch so it becomes a valid unified diff with explicit file headers and hunks.",
      `Issue: ${input.issueKey}`,
      `Summary: ${input.summary}`,
      `Requirement summary: ${input.requirementSummary}`,
      `Patch error: ${input.patchError}`,
      `Patch to repair:\n${input.patch}`,
      "If the patch cannot be repaired, return decision requirements_gap and explain why."
    ].join("\n");
    this.logPrompt("repair_patch", prompt);
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.modelName,
        prompt,
        stream: false,
        options: {
          temperature: this.config.temperature ?? 0.2,
          num_predict: this.config.maxTokens ?? 2048
        }
      })
    });
    if (!response.ok) {
      return super.repairPatch(input);
    }
    const payload = (await response.json()) as { response?: string };
    this.logReply("repair_patch", payload.response ?? "");
    return parseJson<ChangePlan>(
      payload.response ?? "",
      await super.repairPatch(input)
    );
  }
}

class CodexProvider extends OpenAICompatibleProvider {
  async testConnection() {
    const payload = await this.callOpenAIText("Reply with the single word: ready", 16);
    const text = extractResponseText(payload);
    if (!text) {
      throw new Error("Codex endpoint did not return any text");
    }
    return {
      ok: true as const,
      message: `Codex reachable via Responses API using ${this.config.modelName}`
    };
  }

  async analyzeRequirement(input: {
    issueKey: string;
    summary: string;
    description?: string;
    comments?: string[];
  }): Promise<RequirementAnalysis> {
    const prompt = [
      "Return JSON only with keys decision, summary, gapSummary, commentToReporter, confidence.",
      "Do not wrap the JSON in markdown or code fences.",
      `Issue: ${input.issueKey}`,
      `Summary: ${input.summary}`,
      `Description: ${input.description ?? ""}`,
      `Comments: ${(input.comments ?? []).join("\n")}`
    ].join("\n");
    this.logPrompt("analyze_requirement", prompt);
    const payload = await this.callOpenAIText(prompt, this.config.maxTokens ?? 1024);
    const text = extractResponseText(payload);
    this.logReply("analyze_requirement", text);
    return parseJson<RequirementAnalysis>(text, await super.analyzeRequirement(input));
  }

  async generateImplementationPlan(input: {
    issueKey: string;
    summary: string;
    requirement: RequirementAnalysis;
  }): Promise<ChangePlan> {
    const prompt = [
      "Return JSON only with keys decision, summary, commitMessage, notes, patch.",
      "Do not wrap the JSON in markdown or code fences.",
      "The patch must be a valid unified diff with explicit file headers and hunks.",
      "Do not return an empty patch if any source files can be modified.",
      `Issue: ${input.issueKey}`,
      `Summary: ${input.summary}`,
      `Requirement decision: ${input.requirement.decision}`,
      `Requirement summary: ${input.requirement.summary}`,
      `Gap summary: ${input.requirement.gapSummary ?? ""}`
    ].join("\n");
    this.logPrompt("generate_plan", prompt);
    const payload = await this.callOpenAIText(prompt, this.config.maxTokens ?? 2048);
    const text = extractResponseText(payload);
    this.logReply("generate_plan", text);
    return parseJson<ChangePlan>(text, await super.generateImplementationPlan(input));
  }

  async repairPatch(input: PatchRepairRequest): Promise<ChangePlan> {
    const prompt = [
      "Return JSON only with keys decision, summary, commitMessage, notes, patch.",
      "Do not wrap the JSON in markdown or code fences.",
      "Fix the provided patch so it becomes a valid unified diff with explicit file headers and hunks.",
      `Issue: ${input.issueKey}`,
      `Summary: ${input.summary}`,
      `Requirement summary: ${input.requirementSummary}`,
      `Patch error: ${input.patchError}`,
      `Patch to repair:\n${input.patch}`
    ].join("\n");
    this.logPrompt("repair_patch", prompt);
    const payload = await this.callOpenAIText(prompt, this.config.maxTokens ?? 2048);
    const text = extractResponseText(payload);
    this.logReply("repair_patch", text);
    return parseJson<ChangePlan>(text, await super.repairPatch(input));
  }
}

export function createModelProvider(config: ModelProviderConfig): ModelProvider {
  switch (config.provider) {
    case "ollama":
      return new OllamaProvider(config);
    case "codex":
      return new CodexProvider(config);
    case "openai":
    case "custom":
      return new CodexProvider(config);
    default:
      return new BaseProvider(config);
  }
}
