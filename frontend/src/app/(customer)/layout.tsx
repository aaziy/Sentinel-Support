import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sentinel Support · Help Center",
  description: "Get instant AI-powered support",
};

/**
 * Customer layout — lightweight shell.
 * No realtime subscriptions, no admin chrome, no command palette.
 * Just the chat widget centered on a dark canvas.
 */
export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 safe-top safe-bottom">
      {children}
    </div>
  );
}
