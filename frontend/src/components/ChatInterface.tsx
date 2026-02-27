"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Bot,
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
  Paperclip,
  Minimize2,
  FileText,
  Database,
  CheckCircle2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import axios from "axios";
import { AgentMark } from "@/components/SentinelLogo";

/* ── Types ──────────────────────────────────────────────── */
interface ApiResponse {
  ticket_id: string;
  response: string;
  route: string;
  is_escalated: boolean;
}

export interface ChatMessage {
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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const MAX_CHARS = 500;

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
          HITL Interrupt
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
        {/* Pulsing dots for active state */}
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
      {/* Avatar */}
      {isUser ? (
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent-500/[0.06] border border-accent-500/[0.08] shrink-0">
          <User className="w-3.5 h-3.5 text-accent-400" />
        </div>
      ) : (
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-900 border border-white/[0.06] shrink-0">
          <AgentMark size={22} />
        </div>
      )}

      {/* Bubble */}
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

        {/* Source badge + logic trace for assistant */}
        {!isUser && message.route && (
          <>
            <SourceBadge route={message.route} isEscalated={message.isEscalated} confidenceScore={message.confidenceScore} />
            <LogicTrace route={message.route} />
          </>
        )}

        {/* Footer: TTR + ticket + time */}
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

/* ── Empty state with sample conversation ───────────────── */
function EmptyState({ onQuickReply }: { onQuickReply: (text: string) => void }) {
  const quickReplies = [
    "How do I reset my password?",
    "My account is locked",
    "I need a refund",
    "Billing question",
    "Speak to a human",
    "Hello!",
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-accent-500/[0.06] border border-accent-500/[0.08] flex items-center justify-center">
        <AgentMark size={40} />
      </div>
      <div>
        <h3 className="text-base font-display font-bold text-white tracking-tight">
          <span className="text-accent-400">Sentinel</span> Support Agent
        </h3>
        <p className="text-[12px] text-zinc-500 mt-1.5 max-w-[280px] leading-relaxed">
          AI-powered support with RAG retrieval, intent routing, and human-in-the-loop escalation.
        </p>
      </div>

      {/* Sample conversation preview */}
      <div className="w-full max-w-[280px] space-y-2 opacity-40">
        <div className="flex justify-end">
          <div className="bg-accent-500/[0.08] border border-accent-500/[0.06] rounded-lg rounded-tr-sm px-3 py-1.5">
            <p className="text-[11px] text-zinc-300">How do I reset my password?</p>
          </div>
        </div>
        <div className="flex justify-start">
          <div className="bg-zinc-900/90 border border-white/[0.05] rounded-lg rounded-tl-sm px-3 py-1.5">
            <p className="text-[11px] text-zinc-400">To reset your password, visit Settings → Security…</p>
          </div>
        </div>
      </div>

      {/* Quick reply chips */}
      <div className="flex flex-wrap gap-1.5 mt-1 justify-center max-w-[320px]">
        {quickReplies.map((q) => (
          <button
            key={q}
            onClick={() => onQuickReply(q)}
            className="text-[10px] text-zinc-500 border border-white/[0.06] bg-white/[0.02] rounded-lg px-2.5 py-1.5 hover:bg-accent-500/[0.06] hover:text-accent-400 hover:border-accent-500/[0.12] transition-all duration-200 cursor-pointer font-mono"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────── */
export default function ChatInterface({ onCollapse }: { onCollapse?: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingElapsed, setThinkingElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const thinkingTimer = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, isThinking, scrollToBottom]);

  // Thinking elapsed timer
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
      const { data } = await axios.post<ApiResponse>(`${API_URL}/api/v1/query/`, { query: text.trim() });

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.response,
        route: data.route,
        isEscalated: data.is_escalated,
        ticketId: data.ticket_id,
        timestamp: new Date(),
        latencyMs: Math.round(performance.now() - t0),
        confidenceScore: 0.7 + Math.random() * 0.25, // Mock confidence
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setError("Connection failed. Is the backend running?");
    } finally {
      setIsThinking(false);
      inputRef.current?.focus();
    }
  }, [isThinking]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    submitMessage(input);
  };

  const handleQuickReply = useCallback((text: string) => {
    submitMessage(text);
  }, [submitMessage]);

  const messageCount = messages.length;
  const charCount = input.length;
  const handledCount = messages.filter((m) => m.role === "assistant").length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent-500/[0.06] border border-accent-500/[0.08] flex items-center justify-center">
            <AgentMark size={24} />
          </div>
          <div>
            <h2 className="text-[14px] font-display font-bold text-white tracking-tight">Support Agent</h2>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-breathing absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <p className="text-[9px] text-emerald-400 leading-none font-mono">
                Active · {handledCount} handled
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {messageCount > 0 && (
            <span className="text-[9px] text-zinc-600 font-mono tabular-nums">
              {messageCount} msg{messageCount !== 1 ? "s" : ""}
            </span>
          )}
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="p-1 rounded-md hover:bg-white/[0.04] text-zinc-600 hover:text-zinc-400 transition-colors"
              title="Collapse chat"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Messages ── */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 relative">
        {messages.length === 0 && !isThinking ? (
          <EmptyState onQuickReply={handleQuickReply} />
        ) : (
          <AnimatePresence mode="popLayout">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isThinking && <ThinkingIndicator key="thinking" elapsed={thinkingElapsed} />}
          </AnimatePresence>
        )}
        <div ref={messagesEndRef} />

        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            className="sticky bottom-2 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-accent-500/80 text-zinc-950 flex items-center justify-center shadow-elevation-2 hover:bg-accent-400 transition-all duration-300 z-10"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ── Error banner ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="shrink-0 mx-3 mb-2 rounded-lg bg-rose-500/[0.08] border border-rose-500/[0.12] px-3 py-2 text-[11px] text-rose-400 flex items-center gap-2"
          >
            <AlertTriangle className="w-3 h-3 shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Input bar ── */}
      <form onSubmit={handleSubmit} className="shrink-0 p-3 border-t border-white/[0.05]">
        <div className="flex items-center gap-2 bg-zinc-900/80 backdrop-blur-xl border border-white/[0.05] rounded-lg px-3 py-2 focus-within:border-accent-500/20 focus-within:shadow-glow-accent transition-all duration-300">
          {/* Attachment button */}
          <button
            type="button"
            className="p-1 rounded-md hover:bg-white/[0.04] text-zinc-600 hover:text-zinc-400 transition-colors"
            title="Attach file"
          >
            <Paperclip className="w-3.5 h-3.5" />
          </button>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
            placeholder="Describe your issue…"
            disabled={isThinking}
            className="flex-1 bg-transparent text-[13px] text-white placeholder-zinc-600 outline-none disabled:opacity-40"
          />

          {/* Character count */}
          {charCount > 0 && (
            <span className={clsx(
              "text-[9px] font-mono tabular-nums",
              charCount > MAX_CHARS * 0.9 ? "text-amber-400" : "text-zinc-700"
            )}>
              {charCount}/{MAX_CHARS}
            </span>
          )}

          <button
            type="submit"
            disabled={isThinking || !input.trim()}
            className={clsx(
              "flex items-center justify-center w-7 h-7 rounded-md transition-all duration-300",
              input.trim() && !isThinking
                ? "bg-accent-500 text-zinc-950 hover:bg-accent-400 shadow-glow-accent"
                : "bg-white/[0.04] text-zinc-600 cursor-not-allowed"
            )}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
