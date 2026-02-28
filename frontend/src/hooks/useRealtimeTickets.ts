"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { Database, TicketStatus } from "@/lib/database.types";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type Ticket = Database["public"]["Tables"]["tickets"]["Row"];

/** Status values that represent an active escalation the admin needs to act on. */
const ESCALATED_STATUSES: TicketStatus[] = ["awaiting_human"];

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface UseRealtimeTicketsReturn {
  /** Tickets that are awaiting human intervention. */
  pending: Ticket[];
  /** Tickets that have been resolved / closed. */
  resolved: Ticket[];
  /** All tickets (pending + resolved). */
  all: Ticket[];
  /** Whether the initial fetch is in progress. */
  loading: boolean;
  /** Error message if the initial fetch or subscription failed. */
  error: string | null;
  /** Supabase Realtime channel connection status. */
  connectionStatus: ConnectionStatus;
  /** Force a re-fetch from the database. */
  refetch: () => Promise<void>;
  /** Mark a ticket as resolved — writes to Supabase and syncs all browsers. */
  markResolved: (ticketId: string) => Promise<void>;
}

/**
 * Custom hook that subscribes to Supabase Realtime on the `tickets` table.
 *
 * - Fetches initial `awaiting_human` tickets on mount.
 * - Listens for INSERT / UPDATE events to keep the list in sync.
 * - Exposes a `markResolved` helper for optimistic UI updates.
 */
export function useRealtimeTickets(): UseRealtimeTicketsReturn {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");

  const channelRef = useRef<RealtimeChannel | null>(null);

  // ── Initial fetch ──────────────────────────────────────
  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("tickets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (err) {
      setError(err.message);
      setTickets([]);
    } else {
      setTickets(data ?? []);
    }

    setLoading(false);
  }, []);

  // ── Realtime subscription ──────────────────────────────
  useEffect(() => {
    fetchTickets();

    const channel = supabase
      .channel("admin-tickets-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tickets",
        },
        (payload) => {
          const newTicket = payload.new as Ticket;
          setTickets((prev) => {
            // Avoid duplicates
            if (prev.some((t) => t.id === newTicket.id)) return prev;
            return [newTicket, ...prev];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tickets",
        },
        (payload) => {
          const updated = payload.new as Ticket;
          setTickets((prev) =>
            prev.map((t) => (t.id === updated.id ? updated : t))
          );
        }
      )
      .subscribe((status) => {
        console.log("[Realtime] channel status:", status);
        switch (status) {
          case "SUBSCRIBED":
            setConnectionStatus("connected");
            break;
          case "CHANNEL_ERROR":
            setConnectionStatus("error");
            break;
          case "CLOSED":
            setConnectionStatus("disconnected");
            break;
          default:
            setConnectionStatus("connecting");
        }
      });

    channelRef.current = channel;

    // Fallback polling: if Realtime doesn't connect within 8s, poll every 15s
    // Skip polling while a resolve is in-flight to avoid overwriting optimistic updates
    const pollTimer = setInterval(() => {
      if (channelRef.current?.state !== "joined" && !resolvingRef.current) {
        fetchTickets();
      }
    }, 15_000);

    const connectTimeout = setTimeout(() => {
      if (channelRef.current?.state !== "joined") {
        console.warn("[Realtime] Still not connected after 8s — falling back to polling");
        setConnectionStatus("error");
      }
    }, 8_000);

    return () => {
      clearInterval(pollTimer);
      clearTimeout(connectTimeout);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [fetchTickets]);

  const resolvingRef = useRef(false);

  // ── Resolve: optimistic update + Supabase write ────────
  const markResolved = useCallback(async (ticketId: string) => {
    resolvingRef.current = true;
    const now = new Date().toISOString();
    // Optimistic update first for instant UI feedback
    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId
          ? { ...t, status: "resolved" as TicketStatus, updated_at: now }
          : t
      )
    );
    // Write to Supabase so all browsers sync via realtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("tickets")
      .update({ status: "resolved", updated_at: now })
      .eq("id", ticketId);
    // If DB write failed, revert optimistic update
    if (error) {
      console.error("[markResolved] Supabase write failed:", error);
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticketId
            ? { ...t, status: "awaiting_human" as TicketStatus }
            : t
        )
      );
    }
    resolvingRef.current = false;
  }, []);

  // ── Derived lists ──────────────────────────────────────
  const pending = tickets.filter((t) => ESCALATED_STATUSES.includes(t.status));
  const resolved = tickets.filter((t) => t.status === "resolved" || t.status === "closed");

  return {
    pending,
    resolved,
    all: tickets,
    loading,
    error,
    connectionStatus,
    refetch: fetchTickets,
    markResolved,
  };
}
