"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, apiPut } from "../../lib/api";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography
} from "antd";

type Developer = {
  id: string;
  name: string;
  email: string;
  active: boolean;
};

type RuntimeConfig = {
  name: string;
  active: boolean;
  queueState: "idle" | "inqueue" | "inprogress" | "completed" | "failed";
  jiraProjectKey: string;
  jiraJql: string;
  leadDeveloperEmail: string;
  gitProvider?: "github" | "gitlab" | "bitbucket";
  gitOwner?: string;
  gitRepository?: string;
  repositoryPath?: string;
  baseBranch: string;
  branchPrefix: string;
  autoPickEnabled: boolean;
  reviewRequired: boolean;
  prTitleTemplate: string;
  prBodyTemplate: string;
  modelProvider: "codex" | "ollama" | "openai" | "custom" | "coding-agent-cli";
  modelName: string;
  modelBaseUrl?: string;
  modelTemperature?: number;
  modelMaxTokens?: number;
  codingAgentCommand?: string;
  codingAgentArgs?: string[];
  codingAgentTimeoutMs?: number;
  createdAt: string;
  updatedAt: string;
  lastProcessedAt?: string;
  lastError?: string;
};

type SettingsResponse = {
  configs: RuntimeConfig[];
  activeConfigs: RuntimeConfig[];
};

type QueueSummary = {
  configName: string;
  active: boolean;
  queueState: RuntimeConfig["queueState"];
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

type CodexModelsResponse = {
  ok: boolean;
  models?: string[];
  message?: string;
};

const emptyConfig: RuntimeConfig = {
  name: "",
  active: false,
  queueState: "idle",
  jiraProjectKey: "",
  jiraJql: "key = ES-2927",
  leadDeveloperEmail: "",
  gitProvider: "github",
  gitOwner: "",
  gitRepository: "",
  repositoryPath: "",
  baseBranch: "master",
  branchPrefix: "viBek",
  autoPickEnabled: false,
  reviewRequired: true,
  prTitleTemplate: "[{issueKey}] {summary}",
  prBodyTemplate: "Prepared by viBek for review.",
  modelProvider: "ollama",
  modelName: "qwen3.5",
  modelBaseUrl: "http://localhost:11434",
  modelTemperature: 0.2,
  modelMaxTokens: 2048,
  codingAgentCommand: "codex",
  codingAgentArgs: ["exec", "--full-auto"],
  codingAgentTimeoutMs: 15 * 60 * 1000,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const queueColor: Record<RuntimeConfig["queueState"], string> = {
  idle: "default",
  inqueue: "processing",
  inprogress: "warning",
  completed: "success",
  failed: "error"
};

export function SettingsForm() {
  const [configs, setConfigs] = useState<RuntimeConfig[]>([]);
  const [queue, setQueue] = useState<QueueSummary[]>([]);
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [selectedName, setSelectedName] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [message, setMessage] = useState("Loading...");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [selected, setSelected] = useState<RuntimeConfig>(emptyConfig);
  const [codexModels, setCodexModels] = useState<string[]>([]);
  const [codexModelsLoading, setCodexModelsLoading] = useState(false);
  const [form] = Form.useForm<RuntimeConfig>();

  const selectedConfig = useMemo(
    () => configs.find((config) => config.name === selectedName) ?? null,
    [configs, selectedName]
  );
  const pagedConfigs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return configs.slice(start, start + pageSize);
  }, [configs, page, pageSize]);

  const refresh = async () => {
    const [settings, queueSummary, developerList] = await Promise.all([
      apiGet<SettingsResponse>("/api/settings"),
      apiGet<QueueSummary[]>("/api/queue"),
      apiGet<Developer[]>("/api/developers")
    ]);
    setConfigs(settings.configs);
    setQueue(queueSummary);
    setDevelopers(developerList);
    setSelectedName((current) => current || settings.configs[0]?.name || "");
    setMessage("Loaded");
  };

  useEffect(() => {
    refresh().catch(() => setMessage("API unavailable"));
  }, []);

  useEffect(() => {
    if (selectedConfig) {
      setSelected(selectedConfig);
      form.setFieldsValue(selectedConfig);
    }
  }, [selectedConfig, form]);

  useEffect(() => {
    async function loadCodexModels() {
      if (form.getFieldValue("modelProvider") !== "codex") {
        return;
      }
      setCodexModelsLoading(true);
      try {
        const response = await apiGet<CodexModelsResponse>("/api/settings/codex-models");
        setCodexModels(response.models ?? []);
      } catch {
        setCodexModels([]);
      } finally {
        setCodexModelsLoading(false);
      }
    }

    if (drawerOpen) {
      void loadCodexModels();
    }
  }, [drawerOpen, form]);

  const activeConfigs = configs.filter((config) => config.active).length;

  function openEditor(config: RuntimeConfig, nextMode: "view" | "edit") {
    setSelected(config);
    setSelectedName(config.name);
    setMode(nextMode);
    setDrawerOpen(true);
    form.setFieldsValue(config);
  }

  function newConfig() {
    const nextName = `config-${configs.length + 1}`;
    const draft = { ...emptyConfig, name: nextName };
    setSelected(draft);
    setSelectedName(nextName);
    setMode("edit");
    setDrawerOpen(true);
    form.setFieldsValue(draft);
  }

  async function save() {
    const values = await form.validateFields();
    setMessage("Saving...");
    try {
      const payload = { ...selected, ...values };
      const saved =
        selected && configs.some((config) => config.name === selected.name)
          ? await apiPut<RuntimeConfig>("/api/settings", payload)
          : await apiPost<RuntimeConfig>("/api/settings", payload);
      setSelected(saved);
      setSelectedName(saved.name);
      setMode("view");
      setDrawerOpen(false);
      await refresh();
      setMessage("Saved");
    } catch {
      setMessage("Save failed");
    }
  }

  async function runActiveNow() {
    setMessage("Running active configs...");
    try {
      await apiPost("/api/worker/run-now", {});
      await refresh();
      setMessage("Run started");
    } catch {
      setMessage("Run failed");
    }
  }

  async function testProvider() {
    const values = await form.validateFields();
    setMessage("Testing provider...");
    try {
      await apiPost("/api/settings/test-provider", {
        modelProvider: values.modelProvider,
        modelName: values.modelName,
        modelBaseUrl: values.modelBaseUrl,
        modelTemperature: values.modelTemperature,
        modelMaxTokens: values.modelMaxTokens,
        codingAgentCommand: values.codingAgentCommand,
        codingAgentArgs: values.codingAgentArgs,
        codingAgentTimeoutMs: values.codingAgentTimeoutMs
      });
      setMessage("Provider test passed");
    } catch {
      setMessage("Provider test failed");
    }
  }

  async function onModelProviderChange(value: RuntimeConfig["modelProvider"]) {
    form.setFieldValue("modelProvider", value);
    if (value !== "codex") {
      setCodexModels([]);
      return;
    }
    setCodexModelsLoading(true);
    try {
      const response = await apiGet<CodexModelsResponse>("/api/settings/codex-models");
      setCodexModels(response.models ?? []);
    } catch {
      setCodexModels([]);
    } finally {
      setCodexModelsLoading(false);
    }
  }

  const columns = [
    { title: "Name", dataIndex: "name" },
    {
      title: "Active",
      dataIndex: "active",
      render: (value: boolean) => <Badge status={value ? "success" : "default"} text={value ? "Yes" : "No"} />
    },
    {
      title: "Queue",
      dataIndex: "queueState",
      render: (value: RuntimeConfig["queueState"]) => <Tag color={queueColor[value]}>{value}</Tag>
    },
    { title: "Jira filter", dataIndex: "jiraJql", ellipsis: true },
    {
      title: "Repository",
      render: (_: unknown, record: RuntimeConfig) =>
        record.gitOwner && record.gitRepository ? `${record.gitOwner}/${record.gitRepository}` : "-"
    },
    { title: "Base branch", dataIndex: "baseBranch" },
    { title: "Developers", render: () => developers.length },
    {
      title: "Error",
      dataIndex: "lastError",
      render: (value?: string) => (value ? <span style={{ color: "#ff7875" }}>{value}</span> : "-")
    },
    {
      title: "Action",
      render: (_: unknown, record: RuntimeConfig) => (
        <Space>
          <Button onClick={() => openEditor(record, "view")}>View</Button>
          <Button type="primary" onClick={() => openEditor(record, "edit")}>
            Edit
          </Button>
        </Space>
      )
    }
  ];

  return (
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      <Card bordered={false} className="section-card">
        <Row gutter={[16, 16]} justify="space-between" align="middle">
          <Col xs={24} lg={16}>
            <Typography.Title level={3} style={{ margin: 0 }}>
              Runtime configs
            </Typography.Title>
            <Typography.Text type="secondary">
              Manage Jira, workflow, and branch settings without touching code.
            </Typography.Text>
          </Col>
          <Col xs={24} lg={8} style={{ textAlign: "right" }}>
            <Space wrap>
              <Tag color="blue">Active configs: {activeConfigs}</Tag>
              <Tag color="default">{message}</Tag>
            </Space>
          </Col>
        </Row>

        {queue.some((item) => item.lastError) ? (
          <Alert
            style={{ marginTop: 16 }}
            type="error"
            showIcon
            message="Configuration errors detected"
            description="The agent will not run successfully until these are fixed."
          />
        ) : null}

        <Space style={{ marginTop: 16, width: "100%", justifyContent: "space-between" }} wrap>
          <Space wrap>
            <Button type="primary" onClick={newConfig}>
              New config
            </Button>
            <Button onClick={runActiveNow}>Run active configs now</Button>
            <Button onClick={testProvider}>Test provider</Button>
            <Button onClick={refresh}>Refresh</Button>
          </Space>
          <Space>
            <Button onClick={() => setPage((current) => Math.max(1, current - 1))}>Prev</Button>
            <Button onClick={() => setPage((current) => current + 1)}>Next</Button>
            <Select
              value={pageSize}
              onChange={(value) => setPageSize(value)}
              style={{ width: 120 }}
              options={[
                { value: 5, label: "5 / page" },
                { value: 10, label: "10 / page" },
                { value: 20, label: "20 / page" }
              ]}
            />
          </Space>
        </Space>

        <Table
          style={{ marginTop: 16 }}
          rowKey="name"
          dataSource={pagedConfigs}
          columns={columns}
          pagination={false}
          scroll={{ x: 1100 }}
        />
      </Card>

      <Drawer
        title={mode === "edit" ? "Edit config" : "View config"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={720}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Close</Button>
            {mode !== "view" ? (
              <Button type="primary" onClick={save}>
                Save
              </Button>
            ) : null}
          </Space>
        }
      >
        <Form layout="vertical" form={form} disabled={mode === "view"}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="name" label="Config name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="jiraProjectKey" label="Jira project key">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="jiraJql" label="Jira JQL">
                <Input.TextArea rows={3} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="leadDeveloperEmail" label="Lead developer email">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="gitProvider" label="Git provider">
                <Select
                  options={[
                    { value: "github", label: "GitHub" },
                    { value: "gitlab", label: "GitLab" },
                    { value: "bitbucket", label: "Bitbucket" }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="gitOwner" label="Repository owner">
                <Input placeholder="org-or-user" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="gitRepository" label="Repository name">
                <Input placeholder="repository" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="repositoryPath" label="Local repository path">
                <Input placeholder="/absolute/path/to/local/checkout" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="baseBranch" label="Base branch">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="branchPrefix" label="Branch prefix">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="active" label="Active">
                <Select
                  options={[
                    { value: true, label: "Yes" },
                    { value: false, label: "No" }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="autoPickEnabled" label="Auto pick">
                <Select
                  options={[
                    { value: true, label: "Enabled" },
                    { value: false, label: "Disabled" }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="reviewRequired" label="Review required">
                <Select
                  options={[
                    { value: true, label: "Required" },
                    { value: false, label: "Not required" }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="prTitleTemplate" label="PR title template">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="prBodyTemplate" label="PR body template">
                <Input.TextArea rows={4} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="modelProvider" label="Model provider">
                <Select
                  onChange={onModelProviderChange}
                  options={[
                    { value: "ollama", label: "Ollama" },
                    { value: "codex", label: "Codex" },
                    { value: "openai", label: "OpenAI" },
                    { value: "custom", label: "Custom" },
                    { value: "coding-agent-cli", label: "Coding agent CLI (writes real code)" }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="modelName" label="Model name">
                {form.getFieldValue("modelProvider") === "codex" ? (
                  <Select
                    showSearch
                    loading={codexModelsLoading}
                    options={codexModels.map((model) => ({ value: model, label: model }))}
                    notFoundContent={codexModelsLoading ? "Loading models..." : "No models found"}
                  />
                ) : (
                  <Input />
                )}
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="modelBaseUrl" label="Model base URL">
                <Input placeholder="http://localhost:11434" />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="modelTemperature" label="Temperature">
                <Input type="number" min={0} max={2} step={0.1} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="modelMaxTokens" label="Max tokens">
                <Input type="number" min={128} step={128} />
              </Form.Item>
            </Col>
            {form.getFieldValue("modelProvider") === "coding-agent-cli" ? (
              <>
                <Col xs={24} md={12}>
                  <Form.Item name="codingAgentCommand" label="Coding agent CLI command">
                    <Input placeholder="codex" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="codingAgentArgs" label="Coding agent CLI args">
                    <Select mode="tags" open={false} placeholder="exec --full-auto" tokenSeparators={[" "]} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="codingAgentTimeoutMs" label="Coding agent timeout (ms)">
                    <Input type="number" min={30000} step={30000} />
                  </Form.Item>
                </Col>
              </>
            ) : null}
          </Row>
        </Form>
      </Drawer>
    </Space>
  );
}
