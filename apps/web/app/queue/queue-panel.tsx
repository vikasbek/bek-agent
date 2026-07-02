"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../../lib/api";
import { Alert, Card, Space, Table, Tag } from "antd";

type QueueSummary = {
  configName: string;
  active: boolean;
  queueState: "idle" | "inqueue" | "inprogress" | "completed" | "failed";
  counts: {
    queued: number;
    in_progress: number;
    completed: number;
    failed: number;
    blocked: number;
  };
  lastProcessedAt?: string;
  lastError?: string;
};

const stateColor: Record<QueueSummary["queueState"], string> = {
  idle: "default",
  inqueue: "processing",
  inprogress: "warning",
  completed: "success",
  failed: "error"
};

export function QueuePanel() {
  const [items, setItems] = useState<QueueSummary[]>([]);
  const [message, setMessage] = useState("Loading...");

  const refresh = async () => {
    try {
      setItems(await apiGet<QueueSummary[]>("/api/queue"));
      setMessage("Loaded");
    } catch {
      setMessage("API unavailable");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const hasErrors = useMemo(() => items.some((item) => item.lastError), [items]);

  return (
    <Card bordered={false} className="section-card">
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
          <h2 style={{ margin: 0 }}>Runtime queue</h2>
          <Space wrap>
            <Tag color="blue">{message}</Tag>
            <Tag color={hasErrors ? "red" : "green"}>{hasErrors ? "Errors present" : "Healthy"}</Tag>
            <button className="button secondary" type="button" onClick={refresh}>
              Refresh
            </button>
          </Space>
        </Space>

        {hasErrors ? (
          <Alert
            type="error"
            showIcon
            message="One or more configs has a recorded queue error"
            description="Check the Error column below."
          />
        ) : null}

        <Table
          rowKey="configName"
          dataSource={items}
          pagination={false}
          scroll={{ x: 1100 }}
          columns={[
            { title: "Config", dataIndex: "configName" },
            {
              title: "Active",
              dataIndex: "active",
              render: (value: boolean) => (value ? "Yes" : "No")
            },
            {
              title: "Inqueue",
              dataIndex: ["counts", "queued"]
            },
            {
              title: "Inprogress",
              dataIndex: ["counts", "in_progress"]
            },
            { title: "Completed", dataIndex: ["counts", "completed"] },
            { title: "Failed", dataIndex: ["counts", "failed"] },
            { title: "Blocked", dataIndex: ["counts", "blocked"] },
            {
              title: "State",
              dataIndex: "queueState",
              render: (value: QueueSummary["queueState"]) => <Tag color={stateColor[value]}>{value}</Tag>
            },
            {
              title: "Last processed",
              dataIndex: "lastProcessedAt",
              render: (value?: string) => (value ? new Date(value).toLocaleString() : "-")
            },
            {
              title: "Last error",
              dataIndex: "lastError",
              render: (value?: string) => (value ? <span style={{ color: "#ff7875" }}>{value}</span> : "-")
            }
          ]}
        />
      </Space>
    </Card>
  );
}
