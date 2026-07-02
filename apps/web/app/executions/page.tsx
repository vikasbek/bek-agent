import { Sidebar } from "../../components/Sidebar";
import { ExecutionsPanel } from "./executions-panel";
import { Card, Space } from "antd";

export default function ExecutionsPage() {
  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <Card bordered={false} className="section-card" style={{ marginBottom: 24 }}>
          <Space direction="vertical" size={6}>
            <h1 style={{ margin: 0 }}>Executions</h1>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              Inspect the full Mongo audit trail for each job, stage, and status transition.
            </p>
          </Space>
        </Card>
        <ExecutionsPanel />
      </main>
    </div>
  );
}
