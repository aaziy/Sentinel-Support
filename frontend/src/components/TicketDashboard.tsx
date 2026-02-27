"use client";

import { AlertCircle, CheckCircle2, Clock, UserCheck, XCircle, RefreshCw } from "lucide-react";
import type { Database, TicketStatus, TicketPriority } from "@/lib/database.types";
import { useTickets } from "@/hooks/useTickets";
import clsx from "clsx";

type Ticket = Database["public"]["Tables"]["tickets"]["Row"];

// ── Badge helpers ────────────────────────────────────────
const STATUS_CONFIG: Record<TicketStatus, { label: string; icon: React.ReactNode; className: string }> = {
  open:            { label: "Open",            icon: <Clock className="w-3 h-3" />,        className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  in_progress:     { label: "In Progress",     icon: <RefreshCw className="w-3 h-3" />,    className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  awaiting_human:  { label: "Awaiting Human",  icon: <UserCheck className="w-3 h-3" />,    className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  resolved:        { label: "Resolved",        icon: <CheckCircle2 className="w-3 h-3" />, className: "bg-green-500/15 text-green-400 border-green-500/30" },
  closed:          { label: "Closed",          icon: <XCircle className="w-3 h-3" />,      className: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
};

const PRIORITY_CONFIG: Record<TicketPriority, { className: string }> = {
  low:      { className: "bg-gray-700 text-gray-300" },
  medium:   { className: "bg-blue-900/60 text-blue-300" },
  high:     { className: "bg-orange-900/60 text-orange-300" },
  critical: { className: "bg-red-900/60 text-red-300" },
};

function StatusBadge({ status }: { status: TicketStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={clsx("inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border", cfg.className)}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span className={clsx("text-xs font-medium px-2 py-0.5 rounded-full capitalize", cfg.className)}>
      {priority}
    </span>
  );
}

function TicketRow({ ticket }: { ticket: Ticket }) {
  const date = new Date(ticket.created_at).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="rounded-xl bg-gray-800/70 border border-gray-700 p-4 space-y-2 hover:border-gray-600 transition">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-gray-100 leading-snug line-clamp-2 flex-1">{ticket.query}</p>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <PriorityBadge priority={ticket.priority} />
          <StatusBadge status={ticket.status} />
        </div>
      </div>

      {ticket.response && (
        <p className="text-xs text-gray-400 leading-relaxed line-clamp-3 border-l-2 border-gray-600 pl-3">
          {ticket.response}
        </p>
      )}

      {ticket.escalation_reason && (
        <div className="flex items-center gap-1.5 text-xs text-orange-400">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>{ticket.escalation_reason}</span>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
        <code className="text-gray-600">{ticket.id.slice(0, 8)}…</code>
        <span>{date}</span>
      </div>
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────
function StatCard({ label, count, className }: { label: string; count: number; className?: string }) {
  return (
    <div className={clsx("rounded-xl border p-4 text-center", className)}>
      <p className="text-2xl font-bold">{count}</p>
      <p className="text-xs mt-1 opacity-70">{label}</p>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────
export default function TicketDashboard() {
  const { tickets, loading, error, refetch } = useTickets();

  const counts = {
    total:          tickets.length,
    open:           tickets.filter(t => t.status === "open").length,
    awaiting_human: tickets.filter(t => t.status === "awaiting_human").length,
    resolved:       tickets.filter(t => t.status === "resolved").length,
  };

  return (
    <section className="w-full max-w-4xl mt-16 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-100">Live Ticket Dashboard</h2>
        <button
          onClick={refetch}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total"          count={counts.total}          className="border-gray-700 text-gray-100" />
        <StatCard label="Open"           count={counts.open}           className="border-yellow-700/50 text-yellow-400" />
        <StatCard label="Needs Human"    count={counts.awaiting_human} className="border-orange-700/50 text-orange-400" />
        <StatCard label="Resolved"       count={counts.resolved}       className="border-green-700/50 text-green-400" />
      </div>

      {/* Ticket list */}
      {loading && (
        <div className="text-center py-12 text-gray-500 text-sm animate-pulse">Loading tickets…</div>
      )}
      {error && (
        <div className="text-center py-12 text-red-400 text-sm">Error: {error}</div>
      )}
      {!loading && !error && tickets.length === 0 && (
        <div className="text-center py-12 text-gray-600 text-sm">No tickets yet. Submit a query above.</div>
      )}
      {!loading && tickets.length > 0 && (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <TicketRow key={ticket.id} ticket={ticket} />
          ))}
        </div>
      )}
    </section>
  );
}
