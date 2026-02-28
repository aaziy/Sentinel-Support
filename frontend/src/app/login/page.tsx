"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { Eye, EyeOff, AlertTriangle, Loader2 } from "lucide-react";
import { SentinelMark, SentinelWordmark } from "@/components/SentinelLogo";
import { AgentMark } from "@/components/SentinelLogo";
import { supabase } from "@/lib/supabase";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

/* ── Login form inner (needs useSearchParams, so must be in Suspense) ── */
function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/admin/dashboard";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Small delay to ensure Supabase auth cookie is written before navigating
    setTimeout(() => {
      window.location.href = redirect;
    }, 300);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Email */}
      <div>
        <label className="block text-[11px] font-mono font-medium text-zinc-500 mb-1.5 uppercase tracking-wider">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@sentinel.ai"
          autoComplete="email"
          autoFocus
          className="w-full rounded-lg bg-zinc-900/80 border border-white/[0.06] px-4 py-2.5 text-[13px] text-white placeholder-zinc-600 outline-none focus:border-accent-500/30 focus:shadow-glow-accent transition-all duration-300"
        />
      </div>

      {/* Password */}
      <div>
        <label className="block text-[11px] font-mono font-medium text-zinc-500 mb-1.5 uppercase tracking-wider">
          Password
        </label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="w-full rounded-lg bg-zinc-900/80 border border-white/[0.06] px-4 py-2.5 pr-10 text-[13px] text-white placeholder-zinc-600 outline-none focus:border-accent-500/30 focus:shadow-glow-accent transition-all duration-300"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-lg bg-rose-500/[0.08] border border-rose-500/[0.12] px-3 py-2 text-[11px] text-rose-400 flex items-center gap-2"
          >
            <AlertTriangle className="w-3 h-3 shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || !email.trim() || !password.trim()}
        className={clsx(
          "w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold transition-all duration-300",
          loading || !email.trim() || !password.trim()
            ? "bg-white/[0.04] text-zinc-600 cursor-not-allowed"
            : "bg-accent-500 text-zinc-950 hover:bg-accent-400 shadow-glow-accent"
        )}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Signing in…
          </>
        ) : (
          "Sign in to Admin Portal"
        )}
      </button>
    </form>
  );
}

/* ── Login Page ───────────────────────────────────────────── */
export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 sm:p-6 safe-top safe-bottom">
      {/* Background accents */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-500/[0.03] rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent-500/[0.02] rounded-full blur-3xl" />
      </div>

      {/* Login card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.21, 1.02, 0.73, 1] }}
        className="relative w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-2xl bg-accent-500/[0.06] border border-accent-500/[0.08] flex items-center justify-center">
            <SentinelMark size={40} glow />
          </div>
          <div className="text-center">
            <SentinelWordmark className="justify-center" />
            <p className="text-[11px] text-zinc-600 mt-2 font-mono">
              Admin Command Center
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-zinc-900/60 backdrop-blur-2xl border border-white/[0.06] rounded-2xl shadow-elevation-3 p-6">
          <Suspense fallback={
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
            </div>
          }>
            <LoginForm />
          </Suspense>
        </div>

        {/* Footer links */}
        <div className="flex items-center justify-between mt-4 px-1">
          <a href="/" className="text-[10px] font-mono text-zinc-600 hover:text-accent-400 transition-colors">
            ← Customer Portal
          </a>
          <p className="text-[9px] font-mono text-zinc-700">
            Sentinel v1.0
          </p>
        </div>
      </motion.div>
    </div>
  );
}
