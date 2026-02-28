"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Radio,
  ChevronDown,
  ChevronUp,
  Send,
  ShieldCheck,
  Inbox,
  BarChart3,
  Wifi,
  WifiOff,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Tag,
  Activity,
  Filter,
  ArrowUpDown,
  Users,
  BookOpen,
  Zap,
  Timer,
  Square,
  CheckSquare,
  X,
  Mail,
  MailCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import clsx from "clsx";
import axios from "axios";
import {
  useRealtimeTickets,
  type Ticket,
  type ConnectionStatus,
} from "@/hooks/useRealtimeTickets";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/* ── Smart time formatting ───────────────────────────────── */
function formatElapsed(createdAt?: string | null): string {
  if (!createdAt) return "";
  const ms = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ── Urgency decay: older tickets → more urgent color ──── */
function getUrgencyClass(createdAt?: string | null): string {
  if (!createdAt) return "border-l-amber-500/60";
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000);
  if (mins > 120) return "border-l-red-500";
  if (mins > 60) return "border-l-red-500/80";
  if (mins > 30) return "border-l-orange-500/70";
  return "border-l-amber-500/60";
}

/* ── SLA timer ───────────────────────────────────────────── */
const SLA_TARGET_MINS = 60;
function SLATimer({ createdAt }: { createdAt?: string | null }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!createdAt) return null;

  const elapsed = Math.floor((now - new Date(createdAt).getTime()) / 60_000);
  const remaining = SLA_TARGET_MINS - elapsed;

  let cls = "sla-safe";
  let label = `${remaining}m left`;
  if (remaining <= 0) {
    cls = "";
    label = `BREACH ${Math.abs(remaining)}m`;
  } else if (remaining <= 15) {
    cls = "sla-warning";
  }

  return remaining <= 0 ? (
    <span className="badge-breach">
      <Timer className="w-3 h-3" />
      BREACH {Math.abs(remaining)}m
    </span>
  ) : (
    <span className={clsx("inline-flex items-center gap-1 text-[9px] font-mono", cls)}>
      <Timer className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

/* ── Count-up animation hook ─────────────────────────────── */
function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(target);

  useEffect(() => {
    const start = prevTarget.current;
    prevTarget.current = target;
    if (start === target) { setValue(target); return; }

    const startTime = performance.now();
    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setValue(Math.round(start + (target - start) * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [target, duration]);

  return value;
}

/* ── Build sparkline from real ticket timestamps ─────────── */
function useTicketSparkline(
  tickets: Ticket[],
  filter?: (t: Ticket) => boolean,
  buckets = 20
) {
  return useMemo(() => {
    const now = Date.now();
    const windowMs = 24 * 60 * 60 * 1000; // 24h window
    const bucketMs = windowMs / buckets;
    const data: { v: number; label: string }[] = Array.from({ length: buckets }, (_, i) => ({
      v: 0,
      label: `${Math.round(((buckets - i) * windowMs) / buckets / 3_600_000)}h ago`,
    }));

    const filtered = filter ? tickets.filter(filter) : tickets;
    for (const t of filtered) {
      if (!t.created_at) continue;
      const age = now - new Date(t.created_at).getTime();
      if (age > windowMs) continue;
      const idx = Math.min(Math.floor(age / bucketMs), buckets - 1);
      data[buckets - 1 - idx].v += 1;
    }
    // Cumulative so the line grows
    let cum = 0;
    for (const d of data) { cum += d.v; d.v = cum; }
    return data;
  }, [tickets, filter, buckets]);
}

/* ── Infer intent tag from query text ────────────────────── */
function inferIntent(query?: string | null): string {
  if (!query) return "General";
  const q = query.toLowerCase();
  if (q.includes("billing") || q.includes("charge") || q.includes("payment") || q.includes("invoice")) return "Billing";
  if (q.includes("refund") || q.includes("money back")) return "Refund";
  if (q.includes("password") || q.includes("reset") || q.includes("login") || q.includes("locked")) return "Account";
  if (q.includes("cancel") || q.includes("subscription")) return "Cancellation";
  if (q.includes("manager") || q.includes("speak to") || q.includes("human")) return "Escalation";
  if (q.includes("bug") || q.includes("error") || q.includes("broken")) return "Bug Report";
  return "General";
}

/* ── Status / Priority config ────────────────────────────── */
const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  open:            { label: "Open",           cls: "bg-zinc-500/10 text-zinc-400 border-white/[0.06]", icon: <Clock className="w-3 h-3" /> },
  in_progress:     { label: "In Progress",    cls: "bg-indigo-500/[0.08] text-indigo-400 border-indigo-500/[0.12]", icon: <Radio className="w-3 h-3" /> },
  awaiting_human:  { label: "Awaiting Human", cls: "bg-amber-500/[0.08] text-amber-400 border-amber-500/[0.12]", icon: <AlertTriangle className="w-3 h-3" /> },
  resolved:        { label: "Resolved",       cls: "bg-emerald-500/[0.08] text-emerald-400 border-emerald-500/[0.12]", icon: <CheckCircle2 className="w-3 h-3" /> },
  closed:          { label: "Closed",         cls: "bg-white/[0.03] text-zinc-500 border-white/[0.06]", icon: <CheckCircle2 className="w-3 h-3" /> },
};

const PRIORITY_BADGE: Record<string, string> = {
  low:      "bg-blue-500/[0.08] text-blue-400 border-blue-500/[0.12]",
  medium:   "bg-amber-500/[0.08] text-amber-400 border-amber-500/[0.12]",
  high:     "bg-red-500/[0.08] text-red-400 border-red-500/[0.12]",
  critical: "bg-rose-500/[0.08] text-rose-400 border-rose-500/[0.12]",
};

/* ── Tiny badges ─────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] ?? STATUS_CONFIG.open;
  return (
    <span className={clsx("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border", c.cls)}>
      {c.icon} {c.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const c = PRIORITY_BADGE[priority] ?? PRIORITY_BADGE.medium;
  return (
    <span className={clsx("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border capitalize", c)}>
      {priority}
    </span>
  );
}

function IntentTag({ query }: { query?: string | null }) {
  const intent = inferIntent(query);
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-white/[0.04]">
      <Tag className="w-2.5 h-2.5" />#{intent}
    </span>
  );
}

/* ── System Health badge (breathing animation) ───────────── */
function SystemHealth({ status }: { status: ConnectionStatus }) {
  const isConnected = status === "connected";
  return (
    <div
      className={clsx(
        "flex items-center gap-2 px-2.5 py-1 rounded-lg border transition-all duration-300",
        isConnected
          ? "bg-emerald-500/[0.06] border-emerald-500/[0.10]"
          : "bg-zinc-900 border-white/[0.05]"
      )}
    >
      {isConnected ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="animate-breathing absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <Activity className="w-3 h-3 text-emerald-500" />
          <span className="text-[10px] font-medium text-emerald-400">System Healthy</span>
        </>
      ) : (
        <>
          <span className="h-2 w-2 rounded-full bg-zinc-600" />
          <WifiOff className="w-3 h-3 text-zinc-500" />
          <span className="text-[10px] font-medium text-zinc-500">
            {status === "connecting" ? "Connecting…" : "Offline"}
          </span>
        </>
      )}
    </div>
  );
}

/* ── Sparkline custom tooltip ────────────────────────────── */
function SparkTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  return (
    <div className="bg-zinc-800 border border-white/[0.08] rounded px-2 py-1 shadow-elevation-2">
      <p className="text-[10px] font-mono text-white tabular-nums">{payload[0].value}</p>
    </div>
  );
}

/* ── Stat card with BIG numbers & sparklines ─────────────── */
function StatCard({
  label,
  value,
  suffix,
  icon,
  sparkColor,
  sparkData,
  trend,
  tintClass,
  isCrisis,
  isBroken,
  delay = 0,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: React.ReactNode;
  sparkColor: string;
  sparkData: { v: number; label: string }[];
  trend?: number;
  tintClass?: string;
  isCrisis?: boolean;
  isBroken?: boolean;
  delay?: number;
}) {
  const displayValue = useCountUp(value);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.08, type: "spring", stiffness: 400, damping: 30 }}
      whileHover={{ scale: 1.02 }}
      className={clsx(
        "backdrop-blur-xl border rounded-lg shadow-elevation-1 p-3 flex flex-col gap-2 relative overflow-hidden cursor-default transition-all duration-300",
        isCrisis
          ? "card-crisis animate-crisis-pulse"
          : "border-white/[0.05]",
        isBroken && "warning-stripes border-red-500/30",
        tintClass ?? "stat-card-default"
      )}
    >
      {/* Broken overlay for crisis state */}
      {isBroken && (
        <div className="absolute top-0 right-0 bg-red-500/10 text-red-400 text-[8px] font-mono font-bold tracking-widest uppercase px-2 py-0.5 rounded-bl-lg border-b border-l border-red-500/20">
          CRITICAL
        </div>
      )}

      {/* Top row: icon + trend */}
      <div className="flex items-center justify-between">
        <div className={clsx(
          "w-7 h-7 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0",
          isBroken
            ? "bg-red-500/[0.08] border border-red-500/[0.12]"
            : "bg-white/[0.03] border border-white/[0.04]"
        )}>
          {icon}
        </div>
        {trend != null && (
          <span className={clsx(
            "inline-flex items-center gap-0.5 text-[10px] font-mono font-medium",
            trend >= 0 ? "text-emerald-400" : "text-red-400"
          )}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend >= 0 ? "+" : ""}{trend}%
          </span>
        )}
      </div>

      {/* DRAMATIC number — 48-64px presentation-ready */}
      <div>
        <p className={clsx(
          "font-display font-extrabold text-white leading-none tabular-nums tracking-tight",
          isBroken ? "text-[32px] sm:text-[40px] lg:text-[56px] text-red-400" : "text-[28px] sm:text-[36px] lg:text-[48px]"
        )}>
          {displayValue}
          {suffix && <span className="text-[14px] sm:text-[16px] lg:text-[20px] font-semibold text-zinc-500 ml-0.5">{suffix}</span>}
        </p>
        <p className="text-[9px] sm:text-[11px] text-zinc-500 mt-1 sm:mt-1.5 truncate font-mono uppercase tracking-wider">{label}</p>
      </div>

      {/* Sparkline — 48px */}
      <div className="w-full h-8 sm:h-12">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sparkData}>
            <defs>
              <linearGradient id={`g-${label.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={sparkColor} stopOpacity={0.3} />
                <stop offset="100%" stopColor={sparkColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip content={<SparkTooltip />} cursor={false} />
            <Area
              type="monotone"
              dataKey="v"
              stroke={sparkColor}
              strokeWidth={1.5}
              fill={`url(#g-${label.replace(/\s/g, "")})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

/* ── Crisis Alert Banner ─────────────────────────────────── */
function CrisisAlertBanner({ rate, count }: { rate: number; count: number }) {
  if (rate < 75) return null;
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="crisis-banner px-4 py-2.5 flex items-center gap-3"
    >
      <AlertTriangle className="w-5 h-5 text-rose-400 animate-pulse shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-display font-bold text-rose-400 tracking-wide">
          CRITICAL: {rate}% Escalation Rate
        </p>
        <p className="text-[10px] text-rose-400/60">
          {count} ticket{count !== 1 ? "s" : ""} require immediate human attention
        </p>
      </div>
      <span className="badge-breach">BREACH</span>
    </motion.div>
  );
}

/* ── Time Range Selector ─────────────────────────────────── */
function TimeRangeSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ranges = ["1h", "6h", "24h", "7d"];
  return (
    <div className="flex items-center gap-0.5 bg-zinc-900/60 border border-white/[0.04] rounded-lg p-0.5">
      {ranges.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={clsx(
            "px-2 py-0.5 rounded-md text-[10px] font-mono transition-all duration-200",
            value === r
              ? "bg-accent-500/10 text-accent-400 border border-accent-500/[0.15]"
              : "text-zinc-600 hover:text-zinc-400 border border-transparent"
          )}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

/* ── Escalation card with expanded details ───────────────── */
function EscalationCard({
  ticket,
  onResolved,
  selected,
  onSelect,
}: {
  ticket: Ticket;
  onResolved: () => void;
  selected: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [savingToKB, setSavingToKB] = useState(false);
  const [savedToKB, setSavedToKB] = useState(false);
  const [kbError, setKBError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const customerEmail = ticket.metadata && typeof ticket.metadata === "object" && !Array.isArray(ticket.metadata)
    ? String((ticket.metadata as Record<string, unknown>).customer_email ?? "")
    : "";

  const handleResume = async () => {
    if (!ticket.id) return;
    setResuming(true);
    setResumeError(null);
    try {
      await axios.post(`${API_URL}/api/v1/query/resume`, {
        ticket_id: ticket.id,
        feedback: feedback.trim() || "Approved by admin",
      });
      // If customer provided email, mark as emailed
      if (customerEmail) setEmailSent(true);
      setDone(true);
      setTimeout(onResolved, 400);
    } catch {
      setResumeError("Resume failed — is the backend running?");
    } finally {
      setResuming(false);
    }
  };

  const handleResendEmail = async () => {
    if (!customerEmail || resendingEmail) return;
    setResendingEmail(true);
    setEmailError(null);
    try {
      const { data } = await axios.post(`${API_URL}/api/v1/query/resend-email`, {
        ticket_id: ticket.id,
        feedback: feedback.trim() || undefined,
      });
      if (data.ok) {
        setEmailSent(true);
      } else {
        setEmailError(data.error || "Failed to send email");
      }
    } catch {
      setEmailError("Failed to send email — check RESEND_API_KEY");
    } finally {
      setResendingEmail(false);
    }
  };

  const priority = ticket.priority ?? "medium";
  const urgencyBorder = getUrgencyClass(ticket.created_at);
  const elapsed = formatElapsed(ticket.created_at);

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 1, x: 0 }}
        animate={{ opacity: 0, x: 60 }}
        transition={{ duration: 0.35, ease: [0.36, 0.07, 0.19, 0.97] }}
        className="card-surface-dense px-4 py-3 flex items-center gap-2"
      >
        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        <span className="text-xs text-emerald-400 font-medium">Resolved</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 60 }}
      whileHover={{ backgroundColor: "rgba(255,255,255,0.02)" }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={clsx("card-surface-dense border-l-4 overflow-hidden", urgencyBorder)}
    >
      {/* Header row */}
      <div className="flex items-center">
        {/* Checkbox for bulk actions */}
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          className="px-2 py-3 text-zinc-600 hover:text-zinc-400 transition-colors shrink-0"
        >
          {selected ? (
            <CheckSquare className="w-3.5 h-3.5 text-accent-400" />
          ) : (
            <Square className="w-3.5 h-3.5" />
          )}
        </button>

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center justify-between pr-4 py-2.5 hover:bg-white/[0.02] transition-all duration-300"
        >
          <div className="flex items-center gap-3 min-w-0">
            <AlertTriangle className={clsx(
              "w-3.5 h-3.5 shrink-0",
              priority === "critical" || priority === "high" ? "text-red-400" : "text-amber-400"
            )} />
            <div className="min-w-0 text-left">
              <p className="text-[12px] font-medium text-zinc-200 truncate">
                {ticket.query ?? "No query recorded"}
              </p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={priority} />
                <IntentTag query={ticket.query} />
                {elapsed && (
                  <span className={clsx(
                    "text-[9px] font-mono",
                    elapsed.includes("h") || elapsed.includes("d") ? "text-red-400" : "text-zinc-600"
                  )}>{elapsed}</span>
                )}
                <SLATimer createdAt={ticket.created_at} />
              </div>
            </div>
          </div>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          )}
        </button>
      </div>

      {/* Expanded body */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 border-t border-white/[0.04] space-y-3">
              {/* AI response preview */}
              {ticket.response && (
                <div className="bg-zinc-950/80 rounded-md p-3 border border-white/[0.04]">
                  <p className="text-[9px] font-mono font-medium text-zinc-500 mb-1.5">AI Response</p>
                  <p className="text-[12px] text-zinc-300 leading-relaxed">{ticket.response}</p>
                </div>
              )}

              {/* AI Summary + Suggested Response (mock) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="bg-zinc-950/60 rounded-md p-2.5 border border-white/[0.04]">
                  <p className="text-[9px] font-mono font-medium text-accent-400/60 mb-1">AI Summary</p>
                  <p className="text-[11px] text-zinc-400">
                    Customer needs assistance with {inferIntent(ticket.query).toLowerCase()} issue. Priority: {priority}.
                  </p>
                </div>
                <div className="bg-zinc-950/60 rounded-md p-2.5 border border-white/[0.04]">
                  <p className="text-[9px] font-mono font-medium text-emerald-400/60 mb-1">Suggested Action</p>
                  <p className="text-[11px] text-zinc-400">
                    Review AI response, add context if needed, then approve to resume the agent workflow.
                  </p>
                </div>
              </div>

              {/* Agent assignment */}
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-accent-500/10 border border-accent-500/10 flex items-center justify-center">
                  <Users className="w-2.5 h-2.5 text-accent-400" />
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">Assigned: Admin (you)</span>
              </div>

              {/* Feedback */}
              <div>
                <label className="text-[9px] font-mono font-medium text-zinc-500 mb-1 block">
                  Admin Feedback (optional)
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Notes for resolution…"
                  rows={2}
                  className="w-full rounded-md bg-zinc-950/60 border border-white/[0.05] px-3 py-2 text-[12px] text-zinc-300 placeholder-zinc-700 outline-none focus:border-accent-500/20 focus:shadow-glow-accent resize-none transition-all duration-300"
                />
              </div>

              {resumeError && (
                <p className="text-[10px] text-rose-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {resumeError}
                </p>
              )}

              <button
                onClick={handleResume}
                disabled={resuming}
                className={clsx(
                  "w-full flex items-center justify-center gap-2 rounded-md py-2 text-[12px] font-semibold transition-all duration-300",
                  resuming
                    ? "bg-white/[0.04] text-zinc-500 cursor-wait"
                    : "bg-accent-500 text-zinc-950 hover:bg-accent-400 shadow-glow-accent"
                )}
              >
                {resuming ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                {resuming ? "Approving…" : "Approve & Resume"}
              </button>

              {/* Save to KB button — curated KB expansion */}
              {feedback.trim() && (
                <button
                  onClick={async () => {
                    setSavingToKB(true);
                    setKBError(null);
                    try {
                      await axios.post(`${API_URL}/api/v1/query/save-to-kb`, {
                        ticket_id: ticket.id,
                        content: feedback.trim(),
                      });
                      setSavedToKB(true);
                    } catch {
                      setKBError("Failed to save to knowledge base.");
                    } finally {
                      setSavingToKB(false);
                    }
                  }}
                  disabled={savingToKB || savedToKB}
                  className={clsx(
                    "w-full flex items-center justify-center gap-2 rounded-md py-2 text-[12px] font-medium transition-all duration-300 border",
                    savedToKB
                      ? "bg-emerald-500/[0.06] text-emerald-400 border-emerald-500/[0.12] cursor-default"
                      : savingToKB
                      ? "bg-white/[0.02] text-zinc-500 border-white/[0.06] cursor-wait"
                      : "bg-white/[0.02] text-zinc-300 border-white/[0.06] hover:border-accent-500/20 hover:bg-accent-500/[0.04]"
                  )}
                >
                  {savedToKB ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Saved to Knowledge Base
                    </>
                  ) : savingToKB ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <BookOpen className="w-3.5 h-3.5" />
                      Save to Knowledge Base
                    </>
                  )}
                </button>
              )}

              {kbError && (
                <p className="text-[10px] text-rose-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {kbError}
                </p>
              )}

              {/* Customer email row — always shown if present */}
              {customerEmail ? (
                <div className="flex items-center justify-between bg-zinc-950/50 rounded-lg px-3 py-2.5 border border-white/[0.05]">
                  <div className="flex items-center gap-2 min-w-0">
                    <Mail className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span className="text-[11px] font-mono text-zinc-300 truncate">{customerEmail}</span>
                  </div>
                  <button
                    onClick={handleResendEmail}
                    disabled={resendingEmail}
                    className={clsx(
                      "shrink-0 flex items-center gap-1.5 ml-2 text-[10px] font-medium px-2.5 py-1 rounded-md transition-all duration-200 border",
                      emailSent
                        ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/[0.06] cursor-default"
                        : resendingEmail
                        ? "text-zinc-500 border-white/[0.06] cursor-wait"
                        : "text-zinc-400 border-white/[0.08] hover:text-white hover:border-accent-500/30 hover:bg-accent-500/[0.06]"
                    )}
                    title={emailSent ? "Email sent" : "Send resolution email"}
                  >
                    {emailSent ? (
                      <><MailCheck className="w-3 h-3" /> Emailed</>
                    ) : resendingEmail ? (
                      <><RefreshCw className="w-3 h-3 animate-spin" /> Sending…</>
                    ) : (
                      <><Send className="w-3 h-3" /> Email customer</>
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.04] bg-zinc-950/30">
                  <Mail className="w-3 h-3 text-zinc-700 shrink-0" />
                  <span className="text-[10px] font-mono text-zinc-600">No customer email — customer was anonymous</span>
                </div>
              )}

              {emailError && (
                <p className="text-[10px] text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {emailError}
                </p>
              )}

              <p className="text-[9px] text-zinc-700 font-mono text-center">
                {ticket.id.slice(0, 8)}…{ticket.id.slice(-4)}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Resolved card ───────────────────────────────────────── */
function ResolvedCard({ ticket }: { ticket: Ticket }) {
  const priority = ticket.priority ?? "medium";
  const urgencyBorder = getUrgencyClass(ticket.created_at);

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      whileHover={{ backgroundColor: "rgba(255,255,255,0.02)" }}
      className={clsx(
        "card-surface-dense border-l-4 px-4 py-2 flex items-center justify-between transition-all duration-300",
        urgencyBorder
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-zinc-400 truncate">{ticket.query ?? "—"}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <StatusBadge status="resolved" />
          <IntentTag query={ticket.query} />
          <span className="text-[9px] font-mono text-zinc-600">{formatElapsed(ticket.created_at)}</span>
        </div>
      </div>
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/25 shrink-0 ml-2" />
    </motion.div>
  );
}

/* ── Activity Feed Item ──────────────────────────────────── */
function ActivityItem({ action, detail, time, icon }: { action: string; detail: string; time: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      <div className="w-6 h-6 rounded-md bg-white/[0.03] border border-white/[0.04] flex items-center justify-center shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-zinc-400 truncate">
          <span className="font-medium text-zinc-300">{action}</span> {detail}
        </p>
        <p className="text-[9px] font-mono text-zinc-600">{time}</p>
      </div>
    </div>
  );
}



/* ── KB Health Panel (live) ───────────────────────────────── */
function KBHealthPanel() {
  const [stats, setStats] = useState({ docs: 0, lastIndexed: "—" });

  useEffect(() => {
    (async () => {
      try {
        // Use the Supabase REST API directly to avoid type issues
        // since 'documents' table may not be in generated types
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const res = await fetch(
          `${url}/rest/v1/documents?select=created_at&order=created_at.desc&limit=1`,
          {
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              Prefer: "count=exact",
            },
          }
        );
        const countHeader = res.headers.get("content-range");
        const total = countHeader ? parseInt(countHeader.split("/")[1] ?? "0", 10) : 0;
        const rows: { created_at: string }[] = await res.json();
        setStats({
          docs: total,
          lastIndexed: rows?.[0]?.created_at
            ? formatElapsed(rows[0].created_at)
            : "—",
        });
      } catch {
        // silently fail — show 0
      }
    })();
  }, []);

  return (
    <div className="card-surface-dense p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <BookOpen className="w-3 h-3 text-emerald-400" />
        <h4 className="text-[10px] font-display font-bold text-zinc-400 uppercase tracking-widest">Knowledge Base</h4>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-500 font-mono">Documents</span>
          <span className="text-[11px] text-white font-semibold tabular-nums">{stats.docs}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-500 font-mono">Last Indexed</span>
          <span className="text-[11px] text-zinc-400 font-mono">{stats.lastIndexed}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-500 font-mono">Status</span>
          <span className={clsx(
            "text-[11px] font-semibold tabular-nums",
            stats.docs > 0 ? "text-emerald-400" : "text-amber-400"
          )}>
            {stats.docs > 0 ? "● Active" : "○ Empty"}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── MAIN ────────────────────────────────────────────────── */
export default function AdminDashboard() {
  const {
    pending,
    resolved,
    all,
    loading,
    error,
    connectionStatus,
    refetch,
    markResolved,
  } = useRealtimeTickets();

  const [timeRange, setTimeRange] = useState("24h");
  const [sortBy, setSortBy] = useState<"time" | "priority">("time");
  const [filterIntent, setFilterIntent] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Last updated counter
  useEffect(() => {
    setLastUpdated(new Date());
  }, [all.length, pending.length, resolved.length]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const handleResolved = useCallback(
    (ticketId: string) => markResolved(ticketId),
    [markResolved]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const bulkResolve = useCallback(() => {
    Promise.all(Array.from(selectedIds).map((id) => markResolved(id)));
    setSelectedIds(new Set());
  }, [selectedIds, markResolved]);

  const escalated = useMemo(() => {
    let list = pending.filter(
      (t) => t.status === "awaiting_human" || t.status === "open"
    );

    // Filter by intent
    if (filterIntent) {
      list = list.filter((t) => inferIntent(t.query) === filterIntent);
    }

    // Sort
    if (sortBy === "priority") {
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      list = [...list].sort((a, b) => (order[a.priority ?? "medium"] ?? 2) - (order[b.priority ?? "medium"] ?? 2));
    } else {
      list = [...list].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
    }

    return list;
  }, [pending, filterIntent, sortBy]);

  const escalationRate = all.length ? Math.round((pending.length / all.length) * 100) : 0;
  const isCrisis = escalationRate >= 75;

  const sparkTotal    = useTicketSparkline(all);
  const sparkPending  = useTicketSparkline(all, (t) => t.status === "awaiting_human" || t.status === "open");
  const sparkResolved = useTicketSparkline(all, (t) => t.status === "resolved" || t.status === "closed");
  const sparkRate     = useMemo(() => {
    // Build escalation rate over 20 buckets
    const now = Date.now();
    const windowMs = 24 * 60 * 60 * 1000;
    const bucketMs = windowMs / 20;
    return Array.from({ length: 20 }, (_, i) => {
      const cutoff = now - (20 - i) * bucketMs;
      const total = all.filter((t) => t.created_at && new Date(t.created_at).getTime() <= cutoff).length;
      const esc = all.filter(
        (t) =>
          t.created_at &&
          new Date(t.created_at).getTime() <= cutoff &&
          (t.status === "awaiting_human" || t.status === "open")
      ).length;
      return { v: total ? Math.round((esc / total) * 100) : 0, label: `${Math.round((20 - i) * windowMs / 20 / 3_600_000)}h ago` };
    });
  }, [all]);

  // Collect unique intents for filter
  const uniqueIntents = useMemo(() => {
    const intents = new Set(pending.map((t) => inferIntent(t.query)));
    return Array.from(intents);
  }, [pending]);

  return (
    <div className={clsx("flex flex-col h-full overflow-hidden relative", isCrisis && "crisis-overlay")}>
      {/* ── Header ── */}
      <div className="shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 border-b border-white/[0.05] z-10 relative gap-2 sm:gap-0">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-accent-500/[0.06] border border-accent-500/[0.08] flex items-center justify-center">
            <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent-400" />
          </div>
          <div>
            <h2 className="text-[13px] sm:text-[15px] font-display font-bold text-white tracking-tight">Command Center</h2>
            <p className="text-[9px] sm:text-[10px] text-zinc-500 leading-none font-mono">realtime · ticket-oversight</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-2.5 w-full sm:w-auto justify-end">
          {/* Last updated indicator */}
          <div className="flex items-center gap-1.5 text-[9px] font-mono text-zinc-600">
            <RefreshCw className={clsx("w-3 h-3", secondsAgo < 3 && "animate-spin-slow")} />
            {secondsAgo < 5 ? "just now" : `${secondsAgo}s ago`}
          </div>
          <SystemHealth status={connectionStatus} />
          <button
            onClick={() => { refetch(); setLastUpdated(new Date()); }}
            className="p-1.5 rounded-md hover:bg-white/[0.04] transition-all duration-300 text-zinc-500 hover:text-zinc-300"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Crisis Banner ── */}
      <CrisisAlertBanner rate={escalationRate} count={escalated.length} />

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-2 sm:py-3 space-y-2 sm:space-y-3 relative z-10">
        {/* Time range + Stats header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
          <h3 className="text-[11px] sm:text-[12px] font-display font-bold text-zinc-400 uppercase tracking-widest">
            Overview
          </h3>
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
        </div>

        {/* Stats row — staggered */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          <StatCard
            label="Total Tickets"
            value={all.length}
            icon={<BarChart3 className="w-4 h-4 text-accent-400" />}
            sparkColor="#7C5CFC"
            sparkData={sparkTotal}
            tintClass="stat-card-info"
            delay={1}
          />
          <StatCard
            label="Pending"
            value={pending.length}
            icon={<Clock className="w-4 h-4 text-amber-400" />}
            sparkColor="#fbbf24"
            sparkData={sparkPending}
            tintClass="stat-card-warning"
            delay={2}
          />
          <StatCard
            label="Resolved"
            value={resolved.length}
            icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            sparkColor="#34d399"
            sparkData={sparkResolved}
            tintClass="stat-card-success"
            delay={3}
          />
          <StatCard
            label="Escalation Rate"
            value={escalationRate}
            suffix="%"
            icon={<AlertTriangle className="w-4 h-4 text-rose-400" />}
            sparkColor="#f43f5e"
            sparkData={sparkRate}
            isCrisis={isCrisis}
            isBroken={escalationRate >= 75}
            tintClass={isCrisis ? "stat-card-danger" : "stat-card-default"}
            delay={4}
          />
        </div>

        {/* Loading / error */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-4 h-4 text-zinc-600 animate-spin" />
          </div>
        )}
        {error && (
          <div className="card-surface-dense px-4 py-3 text-[11px] text-rose-400 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </div>
        )}

        {/* ── Escalation Queue ── */}
        {!loading && escalated.length > 0 && (
          <section>
            {/* Queue header with sort/filter */}
            <div className={clsx(
              "flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 pb-2 border-b border-white/[0.04] gap-2 sm:gap-0",
              isCrisis && "border-b-red-500/20"
            )}>
              <div className="flex items-center gap-2">
                <Inbox className={clsx("w-3.5 h-3.5", isCrisis ? "text-red-400 animate-pulse" : "text-amber-400")} />
                <h3 className={clsx(
                  "text-[12px] font-display font-bold uppercase tracking-widest",
                  isCrisis ? "text-rose-400" : "text-zinc-300"
                )}>
                  Escalation Queue
                </h3>
                <span className={clsx(
                  "text-[9px] font-mono font-medium rounded-md px-1.5 py-0.5 tabular-nums border",
                  isCrisis
                    ? "bg-red-500/[0.08] text-red-400 border-red-500/[0.12]"
                    : "bg-amber-500/[0.08] text-amber-400 border-amber-500/[0.12]"
                )}>
                  {escalated.length}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {selectedIds.size > 0 && (
                  <button
                    onClick={bulkResolve}
                    className="text-[10px] font-medium text-accent-400 hover:text-accent-300 bg-accent-500/[0.08] border border-accent-500/[0.12] rounded-md px-2 py-0.5 transition-colors"
                  >
                    Resolve {selectedIds.size}
                  </button>
                )}

                {/* Sort toggle */}
                <button
                  onClick={() => setSortBy(sortBy === "time" ? "priority" : "time")}
                  className="flex items-center gap-1 text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
                  title={`Sort by ${sortBy === "time" ? "priority" : "time"}`}
                >
                  <ArrowUpDown className="w-3 h-3" />
                  {sortBy === "time" ? "Newest" : "Priority"}
                </button>

                {/* Intent filter */}
                <div className="flex items-center gap-1">
                  <Filter className="w-3 h-3 text-zinc-600" />
                  {filterIntent ? (
                    <button
                      onClick={() => setFilterIntent(null)}
                      className="flex items-center gap-0.5 text-[10px] font-mono text-accent-400 bg-accent-500/[0.06] rounded px-1.5 py-0.5 border border-accent-500/[0.10]"
                    >
                      #{filterIntent} <X className="w-2.5 h-2.5" />
                    </button>
                  ) : (
                    <select
                      onChange={(e) => setFilterIntent(e.target.value || null)}
                      value=""
                      className="bg-transparent text-[10px] font-mono text-zinc-600 outline-none cursor-pointer"
                    >
                      <option value="">All</option>
                      {uniqueIntents.map((i) => (
                        <option key={i} value={i}>{i}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <AnimatePresence mode="popLayout">
                {escalated.map((t) => (
                  <EscalationCard
                    key={t.id}
                    ticket={t}
                    onResolved={() => handleResolved(t.id)}
                    selected={selectedIds.has(t.id)}
                    onSelect={() => toggleSelect(t.id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </section>
        )}

        {!loading && escalated.length === 0 && !error && (
          <div className="card-surface-dense border-dashed py-6 flex flex-col items-center gap-2 text-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-500/20" />
            <p className="text-[11px] text-zinc-500 font-mono">No pending escalations</p>
          </div>
        )}

        {/* ── Resolved ── */}
        {!loading && resolved.length > 0 && (
          <section>
            <h3 className="text-[12px] font-display font-bold text-zinc-500 uppercase tracking-widest mb-2">
              Recently Resolved ({resolved.length})
            </h3>
            <div className="space-y-1">
              <AnimatePresence mode="popLayout">
                {resolved.slice(0, 10).map((t) => (
                  <ResolvedCard key={t.id} ticket={t} />
                ))}
              </AnimatePresence>
            </div>
          </section>
        )}

        {/* ── Bottom panels: Activity Feed + KB Health + Leaderboard ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2">
          {/* Activity Feed — built from real tickets */}
          <div className="card-surface-dense p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-3 h-3 text-accent-400" />
              <h4 className="text-[10px] font-display font-bold text-zinc-400 uppercase tracking-widest">Live Activity</h4>
            </div>
            <div className="space-y-0 divide-y divide-white/[0.03]">
              {all.length === 0 && (
                <p className="text-[10px] text-zinc-600 font-mono py-2">No activity yet</p>
              )}
              {all
                .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
                .slice(0, 8)
                .map((t) => {
                  const isEsc = t.status === "awaiting_human" || t.status === "open";
                  const isResolved = t.status === "resolved" || t.status === "closed";
                  return (
                    <ActivityItem
                      key={t.id}
                      action={isEsc ? "Escalated" : isResolved ? "Resolved" : "New ticket"}
                      detail={t.query ? (t.query.length > 35 ? t.query.slice(0, 35) + "…" : t.query) : `#${t.id.slice(0, 8)}`}
                      time={formatElapsed(t.created_at)}
                      icon={
                        isEsc ? <AlertTriangle className="w-3 h-3 text-amber-400" /> :
                        isResolved ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> :
                        <Inbox className="w-3 h-3 text-accent-400" />
                      }
                    />
                  );
                })}
            </div>
          </div>

          {/* KB Health — live from Supabase */}
          <KBHealthPanel />

          {/* Agent Performance — live stats */}
          <div className="card-surface-dense p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Users className="w-3 h-3 text-amber-400" />
              <h4 className="text-[10px] font-display font-bold text-zinc-400 uppercase tracking-widest">Agent Performance</h4>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 font-mono">AI Auto-resolved</span>
                <span className="text-[11px] text-emerald-400 font-semibold tabular-nums">{resolved.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 font-mono">Human Escalated</span>
                <span className="text-[11px] text-amber-400 font-semibold tabular-nums">{pending.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 font-mono">Total Handled</span>
                <span className="text-[11px] text-white font-semibold tabular-nums">{all.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 font-mono">Resolution Rate</span>
                <span className={clsx(
                  "text-[11px] font-semibold tabular-nums",
                  all.length && (resolved.length / all.length) >= 0.5 ? "text-emerald-400" : "text-amber-400"
                )}>
                  {all.length ? Math.round((resolved.length / all.length) * 100) : 0}%
                </span>
              </div>
              {/* Resolution bar */}
              <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-1">
                <div
                  className="bg-emerald-400/60 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${all.length ? Math.round((resolved.length / all.length) * 100) : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
