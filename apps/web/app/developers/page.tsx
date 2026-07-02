import { Sidebar } from "../../components/Sidebar";
import { DevelopersPanel } from "./developers-panel";
import { Card, Space } from "antd";

export default function DevelopersPage() {
  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <Card bordered={false} className="section-card" style={{ marginBottom: 24 }}>
          <Space direction="vertical" size={6}>
            <h1 style={{ margin: 0 }}>Developers</h1>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              Maintain the developer directory used by the agent to pick issues.
            </p>
          </Space>
        </Card>
        <DevelopersPanel />
      </main>
    </div>
  );
}
