"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { Button, Card, Descriptions, Drawer, Space, Table, Tag } from "antd";

type Run = {
  id: string;
  issueId: string;
  issueKey?: string;
  configName?: string;
  action: "pick" | "branch" | "develop" | "pr";
  status: "pending" | "running" | "success" | "failed";
  message?: string;
  jiraContent?: {
    jiraKey: string;
    summary?: string;
    assigneeEmail?: string;
    status?: string;
    raw?: unknown;
  };
  jiraIssue?: unknown;
  createdAt: string;
  updatedAt: string;
};

type JiraIssueRecord = {
  id: string;
  runId?: string;
  jobId?: string;
  configName?: string;
  issueKey: string;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
};

export function RunsPanel() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [jiraIssues, setJiraIssues] = useState<JiraIssueRecord[]>([]);
  const [message, setMessage] = useState("Loading...");
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);

  const refresh = async () => {
    try {
      const [runList, jiraList] = await Promise.all([
        apiGet<Run[]>("/api/runs"),
        apiGet<JiraIssueRecord[]>("/api/jira-issues")
      ]);
      setRuns(runList);
      setJiraIssues(jiraList);
      setMessage("Loaded");
    } catch {
      setMessage("API unavailable");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const jiraByRunId = useMemo(
    () => new Map(jiraIssues.filter((item) => item.runId).map((item) => [item.runId as string, item])),
    [jiraIssues]
  );

  async function seedSample() {
    setMessage("Saving...");
    try {
      await apiPost("/api/runs", {
        id: crypto.randomUUID(),
        issueId: "sample-1",
        action: "pick",
        status: "success",
        message: "Sample run created",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      await refresh();
      setMessage("Saved");
    } catch {
      setMessage("Save failed");
    }
  }

  return (
    <Card bordered={false} className="section-card">
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
          <h2 style={{ margin: 0 }}>Agent runs</h2>
          <Space wrap>
            <Tag color="blue">{message}</Tag>
            <Button onClick={seedSample}>Seed sample run</Button>
          </Space>
        </Space>

        <Table
          rowKey="id"
          dataSource={runs}
          pagination={false}
          scroll={{ x: 900 }}
          columns={[
            { title: "Issue", dataIndex: "issueId" },
            {
              title: "Jira key",
              render: (_: unknown, record: Run) => record.issueKey ?? record.jiraContent?.jiraKey ?? "-"
            },
            { title: "Action", dataIndex: "action" },
            { title: "Status", dataIndex: "status" },
            { title: "Message", dataIndex: "message" },
            {
              title: "Created at",
              dataIndex: "createdAt",
              render: (value: string) => new Date(value).toLocaleString()
            },
            {
              title: "Updated at",
              dataIndex: "updatedAt",
              render: (value: string) => new Date(value).toLocaleString()
            },
            {
              title: "Actions",
              render: (_: unknown, record: Run) => (
                <Button onClick={() => setSelectedRun(record)}>View</Button>
              )
            }
          ]}
        />

        <Card type="inner" title="Jira payload by run">
          <Table
            rowKey={(row) => `${row.id}-jira`}
            dataSource={runs}
            pagination={false}
            size="small"
            scroll={{ x: 900 }}
            columns={[
              { title: "Run id", dataIndex: "id" },
              {
                title: "Issue key",
                render: (_: unknown, record: Run) => jiraByRunId.get(record.id)?.issueKey ?? record.issueKey ?? "-"
              },
              {
                title: "Config",
                render: (_: unknown, record: Run) => jiraByRunId.get(record.id)?.configName ?? record.configName ?? "-"
              },
              {
                title: "Payload",
                render: (_: unknown, record: Run) => (
                  <Button size="small" onClick={() => setSelectedRun(record)}>
                    View content
                  </Button>
                )
              }
            ]}
          />
        </Card>
      </Space>

      <Drawer title="Run details" open={Boolean(selectedRun)} onClose={() => setSelectedRun(null)} width={720}>
        {selectedRun ? (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Run id">{selectedRun.id}</Descriptions.Item>
            <Descriptions.Item label="Issue">{selectedRun.issueId}</Descriptions.Item>
            <Descriptions.Item label="Jira key">
              {selectedRun.issueKey ?? selectedRun.jiraContent?.jiraKey ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Action">{selectedRun.action}</Descriptions.Item>
            <Descriptions.Item label="Status">{selectedRun.status}</Descriptions.Item>
            <Descriptions.Item label="Message">{selectedRun.message ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="Jira payload">
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                {JSON.stringify(jiraByRunId.get(selectedRun.id)?.payload ?? selectedRun.jiraIssue ?? selectedRun.jiraContent?.raw ?? null, null, 2)}
              </pre>
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>
    </Card>
  );
}
