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
  /** Optimistically mark a ticket as resolved in local state. */
  markResolved: (ticketId: string) => void;
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

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [fetchTickets]);

  // ── Optimistic resolve ─────────────────────────────────
  const markResolved = useCallback((ticketId: string) => {
    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId
          ? { ...t, status: "resolved" as TicketStatus, updated_at: new Date().toISOString() }
          : t
      )
    );
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
