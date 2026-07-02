"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../../lib/api";
import { Alert, Button, Card, Descriptions, Drawer, Space, Table, Tag } from "antd";

type Execution = {
  id: string;
  jobId: string;
  configName: string;
  issueKey?: string;
  stage: "config_sync" | "issue_process" | "branch_create" | "pull_request";
  status: "pending" | "in_progress" | "success" | "failed";
  message?: string;
  modelPrompt?: string;
  modelReply?: string;
  startedAt: string;
  endedAt?: string;
  errorStack?: string;
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

const statusColor: Record<Execution["status"], string> = {
  pending: "default",
  in_progress: "processing",
  success: "success",
  failed: "error"
};

export function ExecutionsPanel() {
  const [items, setItems] = useState<Execution[]>([]);
  const [jiraIssues, setJiraIssues] = useState<JiraIssueRecord[]>([]);
  const [message, setMessage] = useState("Loading...");
  const [selected, setSelected] = useState<Execution | null>(null);

  const refresh = async () => {
    try {
      const [executionList, jiraList] = await Promise.all([
        apiGet<Execution[]>("/api/executions"),
        apiGet<JiraIssueRecord[]>("/api/jira-issues")
      ]);
      setItems(executionList);
      setJiraIssues(jiraList);
      setMessage("Loaded");
    } catch {
      setMessage("API unavailable");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const jiraByJobId = useMemo(
    () => new Map(jiraIssues.filter((item) => item.jobId).map((item) => [item.jobId as string, item])),
    [jiraIssues]
  );

  return (
    <Card bordered={false} className="section-card">
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
          <h2 style={{ margin: 0 }}>Execution audit trail</h2>
          <Space wrap>
            <Tag color="blue">{message}</Tag>
            <Button onClick={refresh}>Refresh</Button>
          </Space>
        </Space>

        <Table
          rowKey="id"
          dataSource={items}
          pagination={false}
          scroll={{ x: 1000 }}
          columns={[
            { title: "Job", dataIndex: "jobId" },
            { title: "Config", dataIndex: "configName" },
            { title: "Issue", dataIndex: "issueKey", render: (value?: string) => value ?? "-" },
            { title: "Stage", dataIndex: "stage" },
            {
              title: "Status",
              dataIndex: "status",
              render: (value: Execution["status"]) => <Tag color={statusColor[value]}>{value}</Tag>
            },
            { title: "Message", dataIndex: "message", render: (value?: string) => value ?? "-" },
            {
              title: "Started",
              dataIndex: "startedAt",
              render: (value: string) => new Date(value).toLocaleString()
            },
            {
              title: "Ended",
              dataIndex: "endedAt",
              render: (value?: string) => (value ? new Date(value).toLocaleString() : "-")
            },
            {
              title: "Actions",
              render: (_: unknown, record: Execution) => <Button onClick={() => setSelected(record)}>View</Button>
            }
          ]}
        />

        {items.some((item) => item.errorStack) ? (
          <Alert
            type="error"
            showIcon
            message="One or more executions failed"
            description="Open the row details to inspect the error stack."
          />
        ) : null}

        <Card type="inner" title="Jira payload by execution">
          <Table
            rowKey={(row) => `${row.id}-jira`}
            dataSource={items}
            pagination={false}
            size="small"
            scroll={{ x: 900 }}
            columns={[
              { title: "Job id", dataIndex: "jobId" },
              {
                title: "Issue key",
                render: (_: unknown, record: Execution) => jiraByJobId.get(record.jobId)?.issueKey ?? record.issueKey ?? "-"
              },
              { title: "Stage", dataIndex: "stage" },
              {
                title: "Payload",
                render: (_: unknown, record: Execution) => (
                  <Button size="small" onClick={() => setSelected(record)}>
                    View content
                  </Button>
                )
              }
            ]}
          />
        </Card>
      </Space>

      <Drawer title="Execution details" open={Boolean(selected)} onClose={() => setSelected(null)} width={720}>
        {selected ? (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Job id">{selected.jobId}</Descriptions.Item>
            <Descriptions.Item label="Config">{selected.configName}</Descriptions.Item>
            <Descriptions.Item label="Issue">{selected.issueKey ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="Stage">{selected.stage}</Descriptions.Item>
            <Descriptions.Item label="Status">{selected.status}</Descriptions.Item>
            <Descriptions.Item label="Message">{selected.message ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="Model prompt">
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{selected.modelPrompt ?? "-"}</pre>
            </Descriptions.Item>
            <Descriptions.Item label="Model reply">
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{selected.modelReply ?? "-"}</pre>
            </Descriptions.Item>
            <Descriptions.Item label="Error stack">
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{selected.errorStack ?? "-"}</pre>
            </Descriptions.Item>
            <Descriptions.Item label="Jira payload">
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                {JSON.stringify(jiraByJobId.get(selected.jobId)?.payload ?? null, null, 2)}
              </pre>
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>
    </Card>
  );
}
