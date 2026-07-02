import { SettingsForm } from "./settings-form";
import { Sidebar } from "../../components/Sidebar";
import { Card, Space } from "antd";

export default function SettingsPage() {
  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <Card bordered={false} className="section-card" style={{ marginBottom: 24 }}>
          <Space direction="vertical" size={6}>
            <h1 style={{ margin: 0 }}>Settings</h1>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              Update Jira, workflow, and branch behavior without touching source code.
            </p>
          </Space>
        </Card>
        <SettingsForm />
      </main>
    </div>
  );
}
