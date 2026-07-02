"use client";

import type { ReactNode } from "react";
import { ConfigProvider, theme } from "antd";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#7c93ff",
          colorInfo: "#7c93ff",
          colorSuccess: "#30c48d",
          colorWarning: "#f5b94f",
          colorError: "#ff6b6b",
          borderRadius: 12,
          fontFamily: `"Inter", "Segoe UI", sans-serif`
        }
      }}
    >
      {children}
    </ConfigProvider>
  );
}
