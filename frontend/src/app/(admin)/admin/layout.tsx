import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sentinel Admin · Command Center",
  description: "Admin command center for Sentinel Support",
};

/**
 * Admin layout — data-dense shell.
 * This layout wraps all /admin/* routes.
 * Auth is enforced by middleware.ts (edge RBAC guard).
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      {children}
    </div>
  );
}
