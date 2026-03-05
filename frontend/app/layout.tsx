import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import { AuthGuard } from "@/components/auth-guard";
import { DashboardShell } from "@/components/dashboard-shell";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Invoica — Financial OS for AI Agents",
  description: "Manage your invoices, track agent spending, and monitor business metrics",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased bg-slate-50`}>
        <AuthProvider>
          <AuthGuard>
            <DashboardShell>{children}</DashboardShell>
          </AuthGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
