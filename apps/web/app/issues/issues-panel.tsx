"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { Button, Card, Col, Form, Input, Row, Select, Space, Table, Tag } from "antd";

type Issue = {
  id: string;
  jiraKey: string;
  summary: string;
  assigneeEmail?: string;
  status: string;
  branchName?: string;
  prUrl?: string;
  developerId?: string;
  updatedAt: string;
};

const statuses = ["queued", "picked", "in_progress", "ready_for_review", "done", "blocked"];

export function IssuesPanel() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [message, setMessage] = useState("Loading...");
  const [form] = Form.useForm<Issue>();

  const refresh = async () => {
    try {
      setIssues(await apiGet<Issue[]>("/api/issues"));
      setMessage("Loaded");
    } catch {
      setMessage("API unavailable");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  async function submit() {
    setMessage("Saving...");
    try {
      const values = await form.validateFields();
      await apiPost("/api/issues", {
        ...values,
        assigneeEmail: values.assigneeEmail || undefined,
        branchName: values.branchName || undefined,
        prUrl: values.prUrl || undefined,
        developerId: values.developerId || undefined
      });
      form.resetFields();
      await refresh();
      setMessage("Saved");
    } catch {
      setMessage("Save failed");
    }
  }

  async function rerunIssue(issue: Issue) {
    setMessage(`Re-running ${issue.jiraKey} with etBek...`);
    try {
      await apiPost(`/api/issues/${issue.id}/rerun`, {});
      await apiPost("/api/worker/run-now", {});
      await refresh();
      setMessage(`Re-run requested for ${issue.jiraKey}`);
    } catch {
      setMessage(`Re-run failed for ${issue.jiraKey}`);
    }
  }

  return (
    <Card bordered={false} className="section-card">
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
          <h2 style={{ margin: 0 }}>Issue queue</h2>
          <Tag color="blue">{message}</Tag>
        </Space>

        <Form layout="vertical" form={form} initialValues={{ status: "queued" }}>
          <Row gutter={16}>
            <Col xs={24} md={6}>
              <Form.Item name="id" label="Record ID" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="jiraKey" label="Jira key" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="summary" label="Summary" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="assigneeEmail" label="Assignee email">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="branchName" label="Branch name">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="prUrl" label="PR URL">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="developerId" label="Developer ID">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                <Select options={statuses.map((value) => ({ value, label: value }))} />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" onClick={submit}>
            Save issue
          </Button>
        </Form>

        <Table
          rowKey="id"
          dataSource={issues}
          pagination={false}
          scroll={{ x: 900 }}
          columns={[
            { title: "Issue", dataIndex: "jiraKey" },
            { title: "Summary", dataIndex: "summary" },
            { title: "Assignee", dataIndex: "assigneeEmail", render: (value?: string) => value ?? "-" },
            { title: "Status", dataIndex: "status" },
            { title: "Branch", dataIndex: "branchName", render: (value?: string) => value ?? "-" },
            {
              title: "PR",
              dataIndex: "prUrl",
              render: (value?: string) => (value ? <a href={value}>{value}</a> : "-")
            },
            {
              title: "Action",
              render: (_: unknown, record: Issue) => (
                <Button onClick={() => rerunIssue(record)}>Re-run with etBek</Button>
              )
            }
          ]}
        />
      </Space>
    </Card>
  );
}
