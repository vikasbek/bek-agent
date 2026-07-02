"use client";

import { Button, Drawer, Layout, Menu, Grid } from "antd";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DashboardOutlined,
  SettingOutlined,
  UngroupOutlined,
  ProfileOutlined,
  DeploymentUnitOutlined,
  HistoryOutlined,
  ApartmentOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MenuOutlined
} from "@ant-design/icons";
import { useState } from "react";

const links = [
  { href: "/", label: "Overview", icon: <DashboardOutlined /> },
  { href: "/settings", label: "Settings", icon: <SettingOutlined /> },
  { href: "/queue", label: "Queue", icon: <DeploymentUnitOutlined /> },
  { href: "/developers", label: "Developers", icon: <ProfileOutlined /> },
  { href: "/issues", label: "Issues", icon: <UngroupOutlined /> },
  { href: "/runs", label: "Runs", icon: <HistoryOutlined /> },
  { href: "/executions", label: "Executions", icon: <ApartmentOutlined /> }
];

export function Sidebar() {
  const pathname = usePathname();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <Button
        className="mobile-menu-button"
        icon={<MenuOutlined />}
        onClick={() => setMobileOpen(true)}
      />
      {isMobile ? (
        <Drawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          placement="left"
          width={300}
          closable={false}
          className="sidebar-drawer"
          bodyStyle={{ padding: 0 }}
        >
          <SidebarContent pathname={pathname} collapsed={false} />
        </Drawer>
      ) : (
        <Layout.Sider
          width={280}
          collapsedWidth={84}
          className="sidebar"
          collapsed={collapsed}
          trigger={null}
          collapsible
        >
          <div className="sidebar-toggle">
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((value) => !value)}
            >
              {!collapsed ? "Collapse" : null}
            </Button>
          </div>
          <SidebarContent pathname={pathname} collapsed={collapsed} />
        </Layout.Sider>
      )}
    </>
  );
}

function SidebarContent({ pathname, collapsed }: { pathname: string; collapsed: boolean }) {
  return (
    <>
      {!collapsed ? null : <div className="brand brand-collapsed"><div className="brand-badge">E</div></div>}

      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[pathname]}
        items={links.map((link) => ({
          key: link.href,
          icon: link.icon,
          label: <Link href={link.href}>{link.label}</Link>
        }))}
      />
    </>
  );
}
