"use client";

import { Avatar, Breadcrumb, Button, Dropdown, Space } from "antd";
import { BellOutlined, SettingOutlined, UserOutlined } from "@ant-design/icons";
import { usePathname } from "next/navigation";
import Link from "next/link";

const routeMap: Record<string, string> = {
  "/": "Overview",
  "/settings": "Settings",
  "/queue": "Queue",
  "/developers": "Developers",
  "/issues": "Issues",
  "/runs": "Runs",
  "/executions": "Executions"
};

export function TopBar() {
  const pathname = usePathname();
  const label = routeMap[pathname] ?? "Dashboard";

  return (
    <div className="topbar">
      <div className="topbar-brand">
        <div className="brand-badge">E</div>
        <div>
          <div className="brand-title">etbek</div>
          <div className="brand-subtitle">Administrator control plane</div>
        </div>
      </div>

      <Breadcrumb items={[{ title: <Link href="/">{label}</Link> }]} />

      <Space wrap>
        <Button icon={<BellOutlined />}>Notifications</Button>
        <Button icon={<SettingOutlined />}>Admin</Button>
        <Dropdown
          menu={{
            items: [
              { key: "profile", label: "Profile" },
              { key: "signout", label: "Sign out" }
            ]
          }}
        >
          <Button type="text" className="user-chip">
            <Avatar size="small" icon={<UserOutlined />} />
            <span>Administrator</span>
          </Button>
        </Dropdown>
      </Space>
    </div>
  );
}
