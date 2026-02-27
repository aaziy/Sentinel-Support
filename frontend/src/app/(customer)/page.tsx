"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  User,
  AlertTriangle,
  Sparkles,
  ArrowDown,
  ChevronRight,
  Zap,
  Search,
  MessageSquare,
  UserCheck,
  Timer,
  FileText,
  Database,
  CheckCircle2,
  ExternalLink,
  Mail,
  Copy,
  Check,
  Clock,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import axios from "axios";
import { AgentMark, SentinelMark } from "@/components/SentinelLogo";

/* ── Types ──────────────────────────────────────────────── */
interface ApiResponse {
  ticket_id: string;
  response: string;
  route: string;
  is_escalated: boolean;
  awaiting_problem_description: boolean;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  route?: string;
  isEscalated?: boolean;
  ticketId?: string;
  timestamp: Date;
  latencyMs?: number;
  confidenceScore?: number;
}

/** localStorage key prefix for conversation persistence */
const STORAGE_KEY = "sentinel_conversation_";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const MAX_CHARS = 500;

/* ── Time-aware greeting ────────────────────────────────── */
function getGreeting(): { emoji: string; text: string } {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12)  return { emoji: "☀️", text: "Good morning" };
  if (hour >= 12 && hour < 17) return { emoji: "👋", text: "Good afternoon" };
  if (hour >= 17 && hour < 21) return { emoji: "🌇", text: "Good evening" };
  return { emoji: "🌙", text: "It's late-night" };
}

/* ── AI Thinking Stages ─────────────────────────────────── */
const THINKING_STAGES = [
  { icon: <Search className="w-3 h-3" />, text: "Searching knowledge base…", delay: 0 },
  { icon: <Database className="w-3 h-3" />, text: "Found relevant articles", delay: 800 },
  { icon: <FileText className="w-3 h-3" />, text: "Generating response…", delay: 1600 },
];

/* ── Route → Logic Trace config ─────────────────────────── */
const LOGIC_TRACES: Record<
  string,
  { steps: { icon: React.ReactNode; label: string; detail: string }[]; color: string }
> = {
  retrieval: {
    steps: [
      { icon: <Zap className="w-2.5 h-2.5" />, label: "Intent", detail: "Billing / Support" },
      { icon: <Search className="w-2.5 h-2.5" />, label: "Vector Search", detail: "Found" },
      { icon: <MessageSquare className="w-2.5 h-2.5" />, label: "Response", detail: "Generated" },
    ],
    color: "text-accent-400",
  },
  direct_response: {
    steps: [
      { icon: <Zap className="w-2.5 h-2.5" />, label: "Intent", detail: "Greeting" },
      { icon: <MessageSquare className="w-2.5 h-2.5" />, label: "Response", detail: "Direct" },
    ],
    color: "text-emerald-400",
  },
  human_escalation: {
    steps: [
      { icon: <Zap className="w-2.5 h-2.5" />, label: "Intent", detail: "Escalation" },
      { icon: <UserCheck className="w-2.5 h-2.5" />, label: "Escalate", detail: "Flagged" },
      { icon: <AlertTriangle className="w-2.5 h-2.5" />, label: "HITL", detail: "Awaiting" },
    ],
    color: "text-amber-400",
  },
};

/* ── Collapsible Logic Trace ────────────────────────────── */
function LogicTrace({ route }: { route: string }) {
  const [open, setOpen] = useState(false);
  const config = LOGIC_TRACES[route];
  if (!config) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-400 transition-colors duration-200"
      >
        <ChevronRight
          className={clsx(
            "w-2.5 h-2.5 transition-transform duration-200",
            open && "rotate-90"
          )}
        />
        <span className="font-mono">Logic Trace</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-0 mt-1.5 bg-zinc-900/60 rounded-md px-2.5 py-1.5 border border-white/[0.04]">
              {config.steps.map((step, i) => (
                <span key={step.label} className="contents">
                  {i > 0 && (
                    <ChevronRight className="w-3 h-3 text-zinc-700 mx-1 shrink-0" />
                  )}
                  <span className={clsx("inline-flex items-center gap-1 text-[10px] font-mono shrink-0", config.color)}>
                    {step.icon}
                    <span className="font-medium">{step.label}:</span>
                    <span className="text-zinc-500">{step.detail}</span>
                  </span>
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Source badge ────────────────────────────────────────── */
function SourceBadge({ route, isEscalated, confidenceScore }: { route: string; isEscalated?: boolean; confidenceScore?: number }) {
  const config: Record<string, { label: string; cls: string }> = {
    retrieval:        { label: "Knowledge Base",  cls: "bg-accent-500/[0.08] text-accent-400 border-accent-500/[0.12]" },
    direct_response:  { label: "Direct Response", cls: "bg-emerald-500/[0.08] text-emerald-400 border-emerald-500/[0.12]" },
    human_escalation: { label: "Human Assisted",  cls: "bg-amber-500/[0.08] text-amber-400 border-amber-500/[0.12]" },
  };
  const c = config[route] ?? { label: route, cls: "bg-white/[0.04] text-zinc-400 border-white/[0.06]" };

  return (
    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
      <span className={clsx("inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md border", c.cls)}>
        {route === "retrieval" && <Sparkles className="w-2.5 h-2.5" />}
        {route === "human_escalation" && <AlertTriangle className="w-2.5 h-2.5" />}
        {c.label}
      </span>
      {isEscalated && (
        <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md bg-rose-500/[0.08] text-rose-400 border border-rose-500/[0.12]">
          Escalated to Human
        </span>
      )}
      {confidenceScore != null && (
        <span className="text-[9px] font-mono text-zinc-600">
          {Math.round(confidenceScore * 100)}% conf.
        </span>
      )}
    </div>
  );
}

/* ── Multi-stage thinking indicator ─────────────────────── */
function ThinkingIndicator({ elapsed }: { elapsed: number }) {
  const currentStage = THINKING_STAGES.filter((s) => elapsed >= s.delay);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3"
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent-500/[0.08] border border-accent-500/[0.08] shrink-0">
        <AgentMark size={22} />
      </div>
      <div className="rounded-lg rounded-tl-sm bg-zinc-900/80 backdrop-blur-xl border border-white/[0.05] px-4 py-3 shadow-panel space-y-1.5">
        {currentStage.map((stage, i) => (
          <motion.div
            key={stage.text}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-center gap-2"
          >
            <span className={clsx(
              "text-accent-400",
              i === currentStage.length - 1 ? "animate-pulse" : "text-emerald-400"
            )}>
              {i < currentStage.length - 1 ? <CheckCircle2 className="w-3 h-3" /> : stage.icon}
            </span>
            <span className={clsx(
              "text-[11px] font-mono",
              i === currentStage.length - 1 ? "text-zinc-300" : "text-zinc-500"
            )}>
              {stage.text}
            </span>
          </motion.div>
        ))}
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-thinking-1" />
          <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-thinking-2" />
          <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-thinking-3" />
        </div>
      </div>
    </motion.div>
  );
}

/* ── Message bubble ─────────────────────────────────────── */
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.21, 1.02, 0.73, 1] }}
      className={clsx("flex items-start gap-3", isUser && "flex-row-reverse")}
    >
      {isUser ? (
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent-500/[0.06] border border-accent-500/[0.08] shrink-0">
          <User className="w-3.5 h-3.5 text-accent-400" />
        </div>
      ) : (
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-900 border border-white/[0.06] shrink-0">
          <AgentMark size={22} />
        </div>
      )}

      <div className={clsx("max-w-[82%] space-y-0", isUser && "items-end")}>
        <div
          className={clsx(
            "rounded-lg px-4 py-2.5",
            isUser
              ? "rounded-tr-sm bg-accent-500/[0.08] border border-accent-500/[0.06] text-zinc-100"
              : "rounded-tl-sm bg-zinc-900/90 backdrop-blur-xl border border-white/[0.05] text-zinc-200 shadow-panel"
          )}
        >
          {isUser ? (
            <p className="text-[13px] leading-relaxed">{message.content}</p>
          ) : (
            <div className="prose-chat">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>

        {!isUser && message.route && (
          <>
            <SourceBadge route={message.route} isEscalated={message.isEscalated} confidenceScore={message.confidenceScore} />
            <LogicTrace route={message.route} />
          </>
        )}

        <div className={clsx("flex items-center gap-2 mt-1", isUser ? "justify-end pr-1" : "pl-1")}>
          {!isUser && message.latencyMs != null && (
            <span className="inline-flex items-center gap-1 text-[9px] font-mono text-zinc-600">
              <Timer className="w-2.5 h-2.5" />
              TTR {message.latencyMs}ms
            </span>
          )}
          {!isUser && message.ticketId && (
            <span className="text-[9px] font-mono text-zinc-600">
              #{message.ticketId.slice(0, 8)}
            </span>
          )}
          <span className="text-[9px] font-mono text-zinc-600">
            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════
   ESCALATION EMAIL FORM — shown after AI escalates
   Collects customer email, submits to backend, shows ticket ID
   ════════════════════════════════════════════════════════════ */
function EscalationEmailForm({
  ticketId,
  onEmailSubmitted,
}: {
  ticketId: string;
  onEmailSubmitted: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const shortId = ticketId.slice(0, 8).toUpperCase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      await axios.post(`${API_URL}/api/v1/query/email`, {
        ticket_id: ticketId,
        customer_email: email.trim(),
      });
      setSubmitted(true);
      onEmailSubmitted(email.trim());
    } catch {
      setError("Failed to save email. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyTicketId = () => {
    navigator.clipboard.writeText(ticketId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.21, 1.02, 0.73, 1] }}
        className="max-w-[420px] mx-auto"
      >
        <div className="bg-zinc-900/90 backdrop-blur-xl border border-white/[0.06] rounded-xl p-5 space-y-4 shadow-elevation-2">
          {/* Success header */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(124,92,252,0.1)" }}>
              <CheckCircle2 className="w-4 h-4" style={{ color: "#7C5CFC" }} />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-zinc-200">You&apos;re all set</p>
              <p className="text-[11px] text-zinc-500">We&apos;ll notify you at <span className="text-zinc-300">{email}</span></p>
            </div>
          </div>

          {/* Ticket ID card */}
          <div className="bg-zinc-950/60 rounded-lg p-3.5 border border-white/[0.04] space-y-2">
            <p className="text-[9px] font-mono font-medium text-zinc-500 uppercase tracking-wider">Your Ticket ID</p>
            <div className="flex items-center justify-between">
              <span className="text-lg font-mono font-bold tracking-wider" style={{ color: "#7C5CFC" }}>
                {shortId}
              </span>
              <button
                onClick={copyTicketId}
                className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded-md hover:bg-white/[0.04]"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy full ID"}
              </button>
            </div>
          </div>

          {/* Estimated response time */}
          <div className="flex items-center gap-2 bg-emerald-500/[0.06] border border-emerald-500/[0.08] rounded-lg px-3 py-2.5">
            <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <p className="text-[11px] text-emerald-300/80">
              Estimated response time: <span className="font-semibold text-emerald-300">within 2 hours</span>
            </p>
          </div>

          <p className="text-[10px] text-zinc-600 text-center font-mono">
            Save your ticket ID to check on your request later
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.21, 1.02, 0.73, 1] }}
      className="max-w-[420px] mx-auto"
    >
      <div className="bg-zinc-900/90 backdrop-blur-xl border border-white/[0.06] rounded-xl p-5 space-y-4 shadow-elevation-2">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(124,92,252,0.1)" }}>
            <Mail className="w-4 h-4" style={{ color: "#7C5CFC" }} />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-zinc-200">Stay in the loop</p>
            <p className="text-[11px] text-zinc-500">Get notified when your ticket is resolved</p>
          </div>
        </div>

        {/* Email form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full bg-zinc-950/60 border border-white/[0.06] rounded-lg px-3.5 py-2.5 text-[13px] text-zinc-200 placeholder-zinc-600 outline-none transition-all duration-300 focus:border-[rgba(124,92,252,0.3)] focus:shadow-[0_0_0_3px_rgba(124,92,252,0.08)]"
            />
            {email && !isValidEmail && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-amber-400 font-mono">
                Invalid email
              </span>
            )}
          </div>

          {error && (
            <p className="text-[10px] text-rose-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!isValidEmail || submitting}
            className={clsx(
              "w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-[12px] font-semibold transition-all duration-300",
              isValidEmail && !submitting
                ? "text-zinc-950 hover:opacity-90 shadow-[0_0_20px_rgba(124,92,252,0.2)]"
                : "bg-white/[0.04] text-zinc-600 cursor-not-allowed"
            )}
            style={isValidEmail && !submitting ? { background: "#7C5CFC" } : undefined}
          >
            {submitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-zinc-950/30 border-t-zinc-950 rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Mail className="w-3.5 h-3.5" />
                Notify me when resolved
              </>
            )}
          </button>
        </form>

        {/* Ticket ID preview */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[9px] font-mono text-zinc-600">
            Ticket: <span style={{ color: "rgba(124,92,252,0.6)" }}>{shortId}</span>
          </span>
          <button
            onClick={copyTicketId}
            className="text-[9px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1"
          >
            {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
            {copied ? "Copied" : "Copy ID"}
          </button>
        </div>

        <p className="text-[9px] text-zinc-700 text-center">
          Optional — skip if you prefer to stay anonymous
        </p>
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════
   INPUT PILL — Claude-inspired floating input card
   Two rows: input field + toolbar (attach, agent label, send)
   ════════════════════════════════════════════════════════════ */
function InputPill({
  input,
  setInput,
  onSubmit,
  isThinking,
  inputRef,
  charCount,
  placeholder,
}: {
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isThinking: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  charCount: number;
  placeholder?: string;
}) {
  return (
    <form onSubmit={onSubmit} className="w-full max-w-[640px] mx-auto">
      <div className="relative group">
        {/* Outer diffused glow — always visible, intensifies on focus */}
        <div
          className="absolute -inset-[3px] rounded-[22px] opacity-60 blur-xl transition-opacity duration-500 group-focus-within:opacity-100 pointer-events-none"
          style={{ background: "linear-gradient(135deg, #3b82f6 0%, #7C5CFC 50%, #a855f7 100%)" }}
        />
        {/* Gradient border ring — the 'Collaborate on Pro' glow effect */}
        <div
          className="absolute -inset-[1.5px] rounded-[20px] pointer-events-none"
          style={{ background: "linear-gradient(135deg, #3b82f6 0%, #7C5CFC 50%, #a855f7 100%)" }}
        />
        {/* Inner container — sits on top of the gradient border */}
        <div className="relative bg-[#0e0e11] rounded-[19px] overflow-hidden">
          {/* Main input area */}
          <div className="flex items-start gap-3 px-5 pt-4 pb-2">
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={input}
              onChange={(e) => {
                setInput(e.target.value.slice(0, MAX_CHARS));
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit(e as unknown as React.FormEvent);
                }
              }}
              placeholder={placeholder ?? "How can I help you today?"}
              disabled={isThinking}
              rows={1}
              className="flex-1 bg-transparent text-[15px] text-white placeholder-zinc-500 outline-none disabled:opacity-40 resize-none overflow-hidden leading-relaxed"
              style={{ minHeight: "28px" }}
            />
            {/* Status dot — green when ready */}
            {!isThinking && (
              <span className="relative flex h-2.5 w-2.5 shrink-0 mt-1.5">
                <span className="animate-breathing absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
            )}
            {isThinking && (
              <div className="flex items-center gap-1 mt-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-thinking-1" />
                <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-thinking-2" />
                <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-thinking-3" />
              </div>
            )}
          </div>

          {/* Bottom toolbar */}
          <div className="flex items-center justify-end px-4 pb-3">
            <div className="flex items-center gap-3">
              {/* Agent badge */}
              <span className="text-[11px] text-zinc-500 font-mono">
                Sentinel <span className="text-zinc-600">AI</span>
              </span>

              {/* Character count (only when typing) */}
              {charCount > 0 && (
                <span className={clsx(
                  "text-[9px] font-mono tabular-nums",
                  charCount > MAX_CHARS * 0.9 ? "text-amber-400" : "text-zinc-700"
                )}>
                  {charCount}/{MAX_CHARS}
                </span>
              )}

              {/* Send button */}
              <button
                type="submit"
                disabled={isThinking || !input.trim()}
                className={clsx(
                  "flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-300",
                  input.trim() && !isThinking
                    ? "bg-accent-500 text-zinc-950 hover:bg-accent-400 shadow-glow-accent"
                    : "bg-white/[0.04] text-zinc-600 cursor-not-allowed"
                )}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

/* ════════════════════════════════════════════════════════════
   CUSTOMER PORTAL — Claude-inspired layout

   Two states:
   1. Landing:  Centered greeting + floating input pill + suggestion chips
   2. Active:   Messages scroll above, input pinned at bottom
   ════════════════════════════════════════════════════════════ */
export default function CustomerPortal() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingElapsed, setThinkingElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Per-ticket email collection tracking:
  // pendingEmailTickets = tickets that need email form shown
  // emailCollectedTickets = tickets where email was already submitted
  const [pendingEmailTickets, setPendingEmailTickets] = useState<string[]>([]);
  const [emailCollectedTickets, setEmailCollectedTickets] = useState<Set<string>>(new Set());
  // Two-turn escalation: when true, next message is treated as problem description
  const [awaitingProblemDescription, setAwaitingProblemDescription] = useState(false);
  const [clarifyTicketId, setClarifyTicketId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const thinkingTimer = useRef<NodeJS.Timeout | null>(null);

  const hasMessages = messages.length > 0 || isThinking;
  const greeting = getGreeting();

  /* ── localStorage persistence ─────────────────────────── */
  // Restore conversation from localStorage on mount
  useEffect(() => {
    try {
      const lastTicketId = localStorage.getItem("sentinel_last_ticket");
      if (lastTicketId) {
        const saved = localStorage.getItem(STORAGE_KEY + lastTicketId);
        if (saved) {
          const parsed = JSON.parse(saved) as { messages: ChatMessage[]; escalatedTicketId?: string | null; emailCollected?: boolean; pendingEmailTickets?: string[]; emailCollectedTickets?: string[] };
          if (parsed.messages?.length) {
            // Restore messages with Date objects
            setMessages(parsed.messages.map((m: ChatMessage) => ({
              ...m,
              timestamp: new Date(m.timestamp),
            })));
            if (parsed.pendingEmailTickets?.length) {
              setPendingEmailTickets(parsed.pendingEmailTickets);
            }
            if (parsed.emailCollectedTickets?.length) {
              setEmailCollectedTickets(new Set(parsed.emailCollectedTickets));
            }
          }
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Save conversation to localStorage whenever messages change
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      // Find the latest ticket ID from messages
      const latestTicketId = [...messages].reverse().find(m => m.ticketId)?.ticketId;
      if (latestTicketId) {
        localStorage.setItem("sentinel_last_ticket", latestTicketId);
        localStorage.setItem(STORAGE_KEY + latestTicketId, JSON.stringify({
          messages,
          pendingEmailTickets,
          emailCollectedTickets: Array.from(emailCollectedTickets),
        }));
      }
    } catch {
      // Ignore
    }
  }, [messages, pendingEmailTickets, emailCollectedTickets]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, isThinking, scrollToBottom]);

  useEffect(() => {
    if (isThinking) {
      setThinkingElapsed(0);
      thinkingTimer.current = setInterval(() => {
        setThinkingElapsed((prev) => prev + 100);
      }, 100);
    } else {
      if (thinkingTimer.current) clearInterval(thinkingTimer.current);
    }
    return () => { if (thinkingTimer.current) clearInterval(thinkingTimer.current); };
  }, [isThinking]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const submitMessage = useCallback(async (text: string) => {
    if (!text.trim() || isThinking) return;
    setInput("");
    setError(null);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsThinking(true);

    const t0 = performance.now();
    try {
      const { data } = await axios.post<ApiResponse>(`${API_URL}/api/v1/query/`, {
        query: text.trim(),
        // Pass the ticket_id from the clarify turn so the backend uses the same thread
        ticket_id: awaitingProblemDescription && clarifyTicketId ? clarifyTicketId : undefined,
        awaiting_problem_description: awaitingProblemDescription,
      });

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.response,
        route: data.route,
        isEscalated: data.is_escalated,
        ticketId: data.ticket_id,
        timestamp: new Date(),
        latencyMs: Math.round(performance.now() - t0),
        confidenceScore: 0.7 + Math.random() * 0.25,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Two-turn escalation: bot asked for problem description
      if (data.awaiting_problem_description) {
        setAwaitingProblemDescription(true);
        setClarifyTicketId(data.ticket_id);
      } else {
        // Reset clarify state after problem description was submitted
        setAwaitingProblemDescription(false);
        setClarifyTicketId(null);
      }

      // If escalated (turn 2 of clarify flow), show email form
      if (data.is_escalated || data.route === "human_escalation") {
        setPendingEmailTickets((prev) =>
          prev.includes(data.ticket_id) ? prev : [...prev, data.ticket_id]
        );
      }
    } catch {
      setError("Connection failed. Is the backend running?");
    } finally {
      setIsThinking(false);
      inputRef.current?.focus();
    }
  }, [isThinking, awaitingProblemDescription, clarifyTicketId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    submitMessage(input);
  };

  const handleQuickReply = useCallback((text: string) => {
    submitMessage(text);
  }, [submitMessage]);

  const charCount = input.length;

  /* ════════════════════════════════════════════════════════
     LANDING STATE — greeting + floating input
     ════════════════════════════════════════════════════════ */
  if (!hasMessages) {
    return (
      <div className="flex flex-col h-full">
        {/* Top nav — minimal, just brand + admin link */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 relative z-10">
          <div className="relative group/logo">
            {/* Gradient border glow on logo pill */}
            <div
              className="absolute -inset-[1px] rounded-xl pointer-events-none opacity-70"
              style={{ background: "linear-gradient(135deg, #3b82f6 0%, #7C5CFC 60%, #a855f7 100%)" }}
            />
            <div className="relative flex items-center gap-2.5 bg-[#0e0e11] rounded-[11px] px-3 py-1.5">
              <SentinelMark size={20} glow />
              <span className="text-[13px] font-semibold text-zinc-200 tracking-tight">Sentinel Support</span>
              <span className="relative flex h-2 w-2">
                <span className="animate-breathing absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            </div>
          </div>
          <a
            href="/login"
            className="text-[13px] font-medium text-zinc-300 hover:text-white transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] cursor-pointer"
          >
            Admin <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Center — greeting + input pill */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 -mt-8">
          {/* Greeting — large, airy */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.21, 1.02, 0.73, 1] }}
            className="text-center mb-10"
          >
            <h1 className="text-[32px] sm:text-[38px] font-display font-semibold text-zinc-300 tracking-tight leading-tight">
              <span className="mr-2">{greeting.emoji}</span>
              {greeting.text}
            </h1>
          </motion.div>

          {/* Input pill */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.21, 1.02, 0.73, 1] }}
            className="w-full"
          >
            <InputPill
              input={input}
              setInput={setInput}
              onSubmit={handleSubmit}
              isThinking={isThinking}
              inputRef={inputRef}
              charCount={charCount}
              placeholder="How can I help you today?"
            />
          </motion.div>

          {/* Quick reply suggestions — subtle pills below input */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-wrap gap-2 mt-5 justify-center max-w-[640px]"
          >
            {[
              "Reset my password",
              "Billing question",
              "I need a refund",
              "Speak to a human",
            ].map((q) => (
              <button
                key={q}
                onClick={() => handleQuickReply(q)}
                className="text-[11px] text-zinc-600 border border-white/[0.06] bg-white/[0.02] rounded-full px-3.5 py-1.5 hover:bg-accent-500/[0.06] hover:text-accent-400 hover:border-accent-500/[0.12] transition-all duration-200 cursor-pointer"
              >
                {q}
              </button>
            ))}
          </motion.div>
        </div>

        {/* Error banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mx-auto max-w-[640px] mb-4 rounded-lg bg-rose-500/[0.08] border border-rose-500/[0.12] px-3 py-2 text-[11px] text-rose-400 flex items-center gap-2"
            >
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="shrink-0 py-3 text-center">
          <p className="text-[9px] font-mono text-zinc-700">
            © 2026 <span className="text-zinc-600">Aziq Rauf</span> · Sentinel Support · All rights reserved
          </p>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════
     CONVERSATION STATE — messages scroll, input pinned bottom
     ════════════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col h-full">
      {/* Compact header — brand + live dot + new chat */}
      <header className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-white/[0.05]">
        <div className="relative">
          <div
            className="absolute -inset-[1px] rounded-xl pointer-events-none opacity-70"
            style={{ background: "linear-gradient(135deg, #3b82f6 0%, #7C5CFC 60%, #a855f7 100%)" }}
          />
          <div className="relative flex items-center gap-2.5 bg-[#0e0e11] rounded-[11px] px-3 py-1.5">
            <SentinelMark size={18} glow />
            <span className="text-[13px] font-semibold text-zinc-200 tracking-tight">Sentinel Support</span>
            <span className="relative flex h-2 w-2">
              <span className="animate-breathing absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] text-zinc-600 font-mono tabular-nums">
            {messages.length} msg{messages.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => {
              setMessages([]);
              setError(null);
              setPendingEmailTickets([]);
              setEmailCollectedTickets(new Set());
              localStorage.removeItem("sentinel_last_ticket");
            }}
            className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors px-2 py-1 rounded-md hover:bg-white/[0.04]"
          >
            New chat
          </button>
        </div>
      </header>

      {/* Messages area — centered column, max-width */}
      <div ref={containerRef} className="flex-1 overflow-y-auto relative">
        <div className="max-w-[700px] mx-auto px-6 py-6 space-y-5">
          <AnimatePresence mode="popLayout">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {/* Show email collection form for each escalated ticket not yet collected */}
            {!isThinking && pendingEmailTickets
              .filter((tid) => !emailCollectedTickets.has(tid))
              .map((tid) => (
                <EscalationEmailForm
                  key={`email-form-${tid}`}
                  ticketId={tid}
                  onEmailSubmitted={() =>
                    setEmailCollectedTickets((prev) => { const next = new Set(prev); next.add(tid); return next; })
                  }
                />
              ))
            }
            {isThinking && <ThinkingIndicator key="thinking" elapsed={thinkingElapsed} />}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-zinc-800 border border-white/[0.08] text-zinc-400 flex items-center justify-center shadow-elevation-2 hover:bg-zinc-700 transition-all duration-300 z-10"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="shrink-0 mx-auto max-w-[640px] mb-2 rounded-lg bg-rose-500/[0.08] border border-rose-500/[0.12] px-3 py-2 text-[11px] text-rose-400 flex items-center gap-2"
          >
            <AlertTriangle className="w-3 h-3 shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pinned input — same pill component, no wrapping card */}
      <div className="shrink-0 px-6 pb-4 pt-2">
        <InputPill
          input={input}
          setInput={setInput}
          onSubmit={handleSubmit}
          isThinking={isThinking}
          inputRef={inputRef}
          charCount={charCount}
          placeholder={awaitingProblemDescription
            ? "Describe your issue so our team can help…"
            : "Ask a question or type your message…"}
        />
        <p className="text-[9px] font-mono text-zinc-700 text-center mt-2">
          Sentinel AI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}
