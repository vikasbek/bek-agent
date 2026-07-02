import { Sidebar } from "../components/Sidebar";
import { apiGet } from "../lib/api";
import { Card, Col, Row, Space, Statistic, Tag } from "antd";

type HealthResponse = {
  ok: boolean;
  appEnv: string;
  database: {
    mode: "memory" | "mongo";
    connected: boolean;
  };
  ts: string;
};

type CountItem = {
  id: string;
};

export default async function HomePage() {
  let health: HealthResponse | null = null;
  let issueCount = 0;
  let runCount = 0;
  let developerCount = 0;
  try {
    const [healthResponse, issues, runs, developers] = await Promise.all([
      apiGet<HealthResponse>("/health"),
      apiGet<CountItem[]>("/api/issues"),
      apiGet<CountItem[]>("/api/runs"),
      apiGet<CountItem[]>("/api/developers")
    ]);
    health = healthResponse;
    issueCount = issues.length;
    runCount = runs.length;
    developerCount = developers.length;
  } catch {
    health = null;
  }

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <Space direction="vertical" size={24} style={{ width: "100%" }}>
          <Card bordered={false} className="hero-card">
            <Row gutter={[24, 24]} align="middle" justify="space-between">
              <Col xs={24} lg={16}>
                <h1 style={{ margin: 0 }}>
                  etbek administrator dashboard
                </h1>
                <p style={{ marginTop: 12, marginBottom: 0, maxWidth: 760, color: "var(--muted)" }}>
                  Control Jira intake, runtime configs, queue execution, and GitHub automation from a single
                  operational console.
                </p>
              </Col>
              <Col xs={24} lg={8} style={{ textAlign: "right" }}>
                <Tag color={health?.ok ? "green" : "gold"} style={{ padding: "6px 12px", fontSize: 13 }}>
                  {health ? `API ${health.appEnv} / ${health.database.mode}` : "API unavailable"}
                </Tag>
              </Col>
            </Row>
          </Card>

          <Row gutter={[16, 16]}>
            {[
              ["Environment", health?.appEnv ?? "unknown", "dev, staging, or prod"],
              ["Storage", health?.database.mode ?? "offline", "Mongo-backed persistence"],
              ["Queue", String(issueCount), "issues tracked in etbek"],
              ["Runs", String(runCount), "automation executions recorded"],
              ["Developers", String(developerCount), "people in the assignment list"]
              ].map(([title, value, hint]) => (
                <Col key={title} xs={24} sm={12} lg={8}>
                  <Card bordered={false} className="stat-card">
                    <Statistic title={title} value={value} />
                    <div style={{ color: "var(--muted)" }}>{hint}</div>
                  </Card>
                </Col>
              ))}
          </Row>

          <Card bordered={false} title="What the platform includes" className="section-card">
            <Space size={[8, 8]} wrap>
              {[
                "Editable runtime config",
                "Developer directory",
                "Issue queue",
                "Run history",
                "Branch and PR tracking",
                "Jira sync loop",
                "Execution audit trail"
              ].map((item) => (
                <Tag key={item} color="blue">
                  {item}
                </Tag>
              ))}
            </Space>
          </Card>
        </Space>
      </main>
    </div>
  );
}
