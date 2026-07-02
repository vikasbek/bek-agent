import { Sidebar } from "../../components/Sidebar";
import { IssuesPanel } from "./issues-panel";
import { Card, Space } from "antd";

export default function IssuesPage() {
  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <Card bordered={false} className="section-card" style={{ marginBottom: 24 }}>
          <Space direction="vertical" size={6}>
            <h1 style={{ margin: 0 }}>Issues</h1>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              View Jira issues and the branch or PR state tracked by etbek.
            </p>
          </Space>
        </Card>
        <IssuesPanel />
      </main>
    </div>
  );
}
