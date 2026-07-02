import { Sidebar } from "../../components/Sidebar";
import { QueuePanel } from "./queue-panel";
import { Card, Space } from "antd";

export default function QueuePage() {
  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <Card bordered={false} className="section-card" style={{ marginBottom: 24 }}>
          <Space direction="vertical" size={6}>
            <h1 style={{ margin: 0 }}>Queue dashboard</h1>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              Track inqueue, inprogress, completed, and failed work per runtime config.
            </p>
          </Space>
        </Card>
        <QueuePanel />
      </main>
    </div>
  );
}
