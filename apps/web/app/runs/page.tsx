import { Sidebar } from "../../components/Sidebar";
import { RunsPanel } from "./runs-panel";
import { Card, Space } from "antd";

export default function RunsPage() {
  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <Card bordered={false} className="section-card" style={{ marginBottom: 24 }}>
          <Space direction="vertical" size={6}>
            <h1 style={{ margin: 0 }}>Runs</h1>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              Track agent activity across pick, branch, development, and PR stages.
            </p>
          </Space>
        </Card>
        <RunsPanel />
      </main>
    </div>
  );
}
