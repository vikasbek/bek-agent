"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { Button, Card, Col, Form, Input, Row, Space, Switch, Table, Tag } from "antd";

type Developer = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  jiraAccountId?: string;
};

export function DevelopersPanel() {
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [form] = Form.useForm<Developer>();
  const [message, setMessage] = useState("Loading...");

  const refresh = async () => {
    try {
      const data = await apiGet<Developer[]>("/api/developers");
      setDevelopers(data);
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
      await apiPost("/api/developers", {
        ...values,
        jiraAccountId: values.jiraAccountId || undefined
      });
      form.resetFields();
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
          <h2 style={{ margin: 0 }}>Developer directory</h2>
          <Tag color="blue">{message}</Tag>
        </Space>

        <Form layout="vertical" form={form} initialValues={{ active: true }}>
          <Row gutter={16}>
            <Col xs={24} md={6}>
              <Form.Item name="id" label="Developer ID" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="jiraAccountId" label="Jira account ID">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="active" label="Active" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" onClick={submit}>
            Add or update developer
          </Button>
        </Form>

        <Table
          rowKey="email"
          dataSource={developers}
          pagination={false}
          columns={[
            { title: "ID", dataIndex: "id" },
            { title: "Name", dataIndex: "name" },
            { title: "Email", dataIndex: "email" },
            {
              title: "Status",
              dataIndex: "active",
              render: (value: boolean) => <Tag color={value ? "green" : "default"}>{value ? "Active" : "Inactive"}</Tag>
            },
            { title: "Jira account", dataIndex: "jiraAccountId", render: (value?: string) => value ?? "-" }
          ]}
        />
      </Space>
    </Card>
  );
}
