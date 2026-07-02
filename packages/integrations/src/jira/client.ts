import { IntegrationError } from "../../../utils/src/errors";

export type JiraClientConfig = {
  baseUrl: string;
  email: string;
  apiToken: string;
};

export class JiraClient {
  constructor(private readonly config: JiraClientConfig) {}

  private ensureConfigured() {
    if (!this.config.baseUrl || !this.config.email || !this.config.apiToken) {
      throw new IntegrationError("Jira is not configured");
    }
  }

  async getIssue(issueKey: string) {
    this.ensureConfigured();
    const response = await fetch(
      `${this.config.baseUrl}/rest/api/3/issue/${issueKey}?expand=renderedFields`,
      {
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.config.email}:${this.config.apiToken}`).toString("base64")}`,
        Accept: "application/json"
      }
      }
    );
    if (!response.ok) {
      const body = await readErrorBody(response);
      throw new IntegrationError(
        `Unable to fetch Jira issue ${issueKey} (${response.status} ${response.statusText})${body ? `: ${body}` : ""}`
      );
    }
    return response.json();
  }

  async searchIssues(jql: string, maxResults = 25) {
    this.ensureConfigured();
    const searchUrl = new URL(`${this.config.baseUrl}/rest/api/3/search/jql`);
    searchUrl.searchParams.set("jql", jql);
    searchUrl.searchParams.set("maxResults", String(maxResults));
    searchUrl.searchParams.set("fields", "summary,assignee,status,updated");

    const response = await fetch(searchUrl, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.config.email}:${this.config.apiToken}`).toString("base64")}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      const body = await readErrorBody(response);
      throw new IntegrationError(
        `Unable to search Jira issues with JQL: ${jql} (${response.status} ${response.statusText})${body ? `: ${body}` : ""}`
      );
    }

    const payload = (await response.json()) as {
      issues?: Array<{
        id: string;
        key: string;
        fields?: {
          summary?: string;
          assignee?: {
            emailAddress?: string;
            accountId?: string;
            displayName?: string;
          } | null;
          status?: {
            name?: string;
          } | null;
        };
      }>;
    };

    return payload.issues ?? [];
  }

  async addComment(issueKey: string, body: string) {
    this.ensureConfigured();
    const response = await fetch(`${this.config.baseUrl}/rest/api/3/issue/${issueKey}/comment`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.config.email}:${this.config.apiToken}`).toString("base64")}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        body: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: body }]
            }
          ]
        }
      })
    });

    if (!response.ok) {
      const error = await readErrorBody(response);
      throw new IntegrationError(
        `Unable to add Jira comment to ${issueKey} (${response.status} ${response.statusText})${error ? `: ${error}` : ""}`
      );
    }

    return response.json();
  }

  async assignIssue(issueKey: string, accountId: string) {
    this.ensureConfigured();
    const response = await fetch(`${this.config.baseUrl}/rest/api/3/issue/${issueKey}/assignee`, {
      method: "PUT",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.config.email}:${this.config.apiToken}`).toString("base64")}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ accountId })
    });

    if (!response.ok) {
      const error = await readErrorBody(response);
      throw new IntegrationError(
        `Unable to assign Jira issue ${issueKey} (${response.status} ${response.statusText})${error ? `: ${error}` : ""}`
      );
    }
  }
}

async function readErrorBody(response: Response) {
  try {
    const text = await response.text();
    return text.trim().slice(0, 1000);
  } catch {
    return "";
  }
}
