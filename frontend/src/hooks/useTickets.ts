"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Database, TicketStatus } from "@/lib/database.types";

type Ticket = Database["public"]["Tables"]["tickets"]["Row"];

export function useTickets(statusFilter?: TicketStatus) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase
      .from("tickets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data, error: err } = await query;
    if (err) setError(err.message);
    else setTickets(data ?? []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchTickets();

    // Real-time subscription
    const channel = supabase
      .channel("tickets-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets" },
        () => fetchTickets()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTickets]);

  return { tickets, loading, error, refetch: fetchTickets };
}
