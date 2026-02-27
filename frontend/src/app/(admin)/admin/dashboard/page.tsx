"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search,
  Bell,
  Settings,
  Command,
  Download,
  User,
  X,
  LogOut,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import AdminDashboard from "@/components/admin/AdminDashboard";
import { SentinelMark, SentinelWordmark } from "@/components/SentinelLogo";
import { supabase } from "@/lib/supabase";
import { useRealtimeTickets, type Ticket } from "@/hooks/useRealtimeTickets";

/* ── Smart time formatting ───────────────────────────────── */
function formatElapsed(createdAt?: string | null): string {
  if (!createdAt) return "";
  const ms = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ── Command Palette (⌘K) ────────────────────────────────── */
function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const commands = [
    { label: "Search tickets…", shortcut: "⌘K", section: "Navigation" },
    { label: "Export to CSV", shortcut: "⌘E", section: "Actions" },
    { label: "Toggle dark mode", shortcut: "⌘D", section: "Settings" },
    { label: "Open settings", shortcut: "⌘,", section: "Settings" },
    { label: "Refresh data", shortcut: "⌘R", section: "Actions" },
    { label: "View customer portal", shortcut: "⌘P", section: "Navigation" },
  ];

  const filtered = query
    ? commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands;

  const grouped = filtered.reduce<Record<string, typeof commands>>((acc, cmd) => {
    (acc[cmd.section] ??= []).push(cmd);
    return acc;
  }, {});

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.15 }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 w-[520px] max-w-[90vw] bg-zinc-900/95 backdrop-blur-2xl border border-white/[0.08] rounded-xl shadow-elevation-3 z-50 overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05]">
              <Search className="w-4 h-4 text-zinc-500" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command or search…"
                className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 outline-none"
              />
              <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono text-zinc-600 bg-zinc-800 border border-white/[0.06] rounded px-1.5 py-0.5">
                ESC
              </kbd>
            </div>
            <div className="max-h-[320px] overflow-y-auto py-2">
              {Object.entries(grouped).map(([section, cmds]) => (
                <div key={section}>
                  <p className="px-4 py-1 text-[10px] font-mono font-medium text-zinc-600 uppercase tracking-wider">
                    {section}
                  </p>
                  {cmds.map((cmd) => (
                    <button
                      key={cmd.label}
                      onClick={onClose}
                      className="w-full flex items-center justify-between px-4 py-2 hover:bg-white/[0.04] transition-colors text-left"
                    >
                      <span className="text-[13px] text-zinc-300">{cmd.label}</span>
                      <kbd className="text-[10px] font-mono text-zinc-600 bg-zinc-800/80 border border-white/[0.05] rounded px-1.5 py-0.5">
                        {cmd.shortcut}
                      </kbd>
                    </button>
                  ))}
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="text-center text-[12px] text-zinc-600 py-6">No results found</p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Notification Bell — live from tickets ────────────────── */
function NotificationBell({ tickets }: { tickets: Ticket[] }) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const notifications = useMemo(() => {
    const notifs: { id: string; title: string; desc: string; time: string; accent: string; icon: React.ReactNode }[] = [];

    // Sort tickets newest-first
    const sorted = [...tickets].sort(
      (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
    );

    for (const t of sorted.slice(0, 10)) {
      const query = t.query ? (t.query.length > 30 ? t.query.slice(0, 30) + "…" : t.query) : `#${t.id.slice(0, 8)}`;
      const elapsed = formatElapsed(t.created_at);

      if (t.status === "awaiting_human" || t.status === "open") {
        // Check SLA — if older than 60 min, it's an SLA warning
        const ageMs = t.created_at ? Date.now() - new Date(t.created_at).getTime() : 0;
        if (ageMs > 60 * 60_000) {
          notifs.push({
            id: `sla-${t.id}`,
            title: "SLA Warning",
            desc: query,
            time: elapsed,
            accent: "text-red-400",
            icon: <Clock className="w-3 h-3 text-red-400" />,
          });
        } else {
          notifs.push({
            id: `esc-${t.id}`,
            title: "New escalation",
            desc: query,
            time: elapsed,
            accent: "text-amber-400",
            icon: <AlertTriangle className="w-3 h-3 text-amber-400" />,
          });
        }
      } else if (t.status === "resolved" || t.status === "closed") {
        notifs.push({
          id: `res-${t.id}`,
          title: "Resolved",
          desc: query,
          time: elapsed,
          accent: "text-emerald-400",
          icon: <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
        });
      }
    }
    return notifs.slice(0, 8);
  }, [tickets]);

  const unread = notifications.filter((n) => !dismissed.has(n.id)).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 rounded-lg hover:bg-white/[0.04] transition-all duration-200 text-zinc-500 hover:text-zinc-300"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-accent-500 text-[9px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute right-0 top-full mt-2 w-72 bg-zinc-900/95 backdrop-blur-2xl border border-white/[0.08] rounded-xl shadow-elevation-3 z-40 overflow-hidden"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.05]">
              <span className="text-[11px] font-semibold text-zinc-300">Notifications</span>
              <button onClick={() => setOpen(false)} className="text-zinc-600 hover:text-zinc-400">
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="divide-y divide-white/[0.04] max-h-64 overflow-y-auto">
              {notifications.length === 0 && (
                <p className="px-3 py-4 text-[10px] text-zinc-600 font-mono text-center">No notifications</p>
              )}
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="px-3 py-2.5 hover:bg-white/[0.02] cursor-pointer transition-colors"
                  onClick={() => setDismissed((s) => new Set(s).add(n.id))}
                >
                  <div className="flex items-center gap-1.5">
                    {n.icon}
                    <p className="text-[11px] font-medium text-zinc-200">{n.title}</p>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{n.desc}</p>
                  <span className={clsx("text-[9px] font-mono mt-1 block", n.accent)}>{n.time}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── ADMIN DASHBOARD PAGE ─────────────────────────────────── */
export default function AdminDashboardPage() {
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const { all } = useRealtimeTickets();

  // Fetch logged-in user email
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data?.user?.email ?? null);
    });
  }, []);

  // ⌘K keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") setCmdPaletteOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleExportCSV = useCallback(() => {
    const header = "id,query,status,priority,created_at\n";
    const rows = all.map((t) =>
      [t.id, `"${(t.query ?? "").replace(/"/g, '""')}"`, t.status, t.priority ?? "", t.created_at ?? ""].join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sentinel-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [all]);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, []);

  return (
    <>
      {/* ── Command Palette Overlay ── */}
      <CommandPalette open={cmdPaletteOpen} onClose={() => setCmdPaletteOpen(false)} />

      {/* ── Top bar ── */}
      <header className="shrink-0 h-14 flex items-center justify-between px-5 bg-zinc-900/60 backdrop-blur-2xl border-b border-white/[0.06] z-20">
        {/* Left: Logo */}
        <div className="flex items-center gap-4">
          <SentinelMark size={28} glow />
          <SentinelWordmark />
          <span className="hidden md:inline-flex text-[10px] font-mono text-accent-400/60 bg-accent-500/[0.06] border border-accent-500/[0.08] rounded px-2 py-0.5">
            v1.0 · admin
          </span>
        </div>

        {/* Center: Search trigger */}
        <button
          onClick={() => setCmdPaletteOpen(true)}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-zinc-800/40 border border-white/[0.06] rounded-lg hover:bg-zinc-800/60 hover:border-white/[0.10] transition-all duration-200 group"
        >
          <Search className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400" />
          <span className="text-[12px] text-zinc-600 group-hover:text-zinc-400">Search…</span>
          <kbd className="text-[10px] font-mono text-zinc-700 bg-zinc-900/60 border border-white/[0.05] rounded px-1 py-px ml-4">
            ⌘K
          </kbd>
        </button>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          <NotificationBell tickets={all} />

          <button
            onClick={handleExportCSV}
            className="p-1.5 rounded-lg hover:bg-white/[0.04] transition-all duration-200 text-zinc-500 hover:text-zinc-300"
            title="Export CSV"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            className="p-1.5 rounded-lg hover:bg-white/[0.04] transition-all duration-200 text-zinc-500 hover:text-zinc-300"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* User avatar + sign out */}
          <div className="ml-2 flex items-center gap-2 pl-2 border-l border-white/[0.06]">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-500/20 to-accent-700/20 border border-accent-500/20 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-accent-400" />
            </div>
            <div className="hidden lg:block">
              <p className="text-[11px] font-medium text-zinc-300 leading-none">Admin</p>
              <p className="text-[9px] text-zinc-600 leading-none mt-0.5 font-mono">{userEmail ?? "…"}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="p-1 rounded-md hover:bg-white/[0.04] text-zinc-600 hover:text-zinc-400 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Full-width dashboard body ── */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <AdminDashboard />
      </main>
    </>
  );
}
