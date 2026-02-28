/**
 * Auto-generated Supabase type definitions.
 * Regenerate with: npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
 */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type TicketStatus = "open" | "in_progress" | "awaiting_human" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "critical";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { name: string; is_active: boolean };
        Insert: { name: string; is_active?: boolean };
        Update: { name?: string; is_active?: boolean };
      };
      documents: {
        Row: {
          id: string;
          content: string;
          metadata: Json;
          embedding: number[] | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          content: string;
          metadata?: Json;
          embedding?: number[] | null;
        };
        Update: {
          content?: string;
          metadata?: Json;
          embedding?: number[] | null;
        };
      };
      tickets: {
        Row: {
          id: string;
          query: string;
          response: string | null;
          status: TicketStatus;
          priority: TicketPriority;
          assigned_to: string | null;
          escalation_reason: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          query: string;
          response?: string | null;
          status?: TicketStatus;
          priority?: TicketPriority;
          assigned_to?: string | null;
          escalation_reason?: string | null;
          metadata?: Json;
        };
        Update: {
          query?: string;
          response?: string | null;
          status?: TicketStatus;
          priority?: TicketPriority;
          assigned_to?: string | null;
          escalation_reason?: string | null;
          metadata?: Json;
          updated_at?: string;
        };
      };
    };
    Functions: {
      match_documents: {
        Args: {
          query_embedding: number[];
          match_threshold?: number;
          match_count?: number;
        };
        Returns: {
          id: string;
          content: string;
          metadata: Json;
          similarity: number;
        }[];
      };
    };
  };
}
