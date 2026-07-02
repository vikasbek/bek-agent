import type { ReactNode } from "react";
import "antd/dist/reset.css";
import "./globals.css";
import { Providers } from "./providers";
import { TopBar } from "../components/TopBar";

export const metadata = {
  title: "etbek",
  description: "Dashboard-driven Jira to branch to PR agent"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <TopBar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
