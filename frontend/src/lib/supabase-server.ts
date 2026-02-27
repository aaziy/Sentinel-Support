import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/**
 * Create a Supabase client for Server Components / Route Handlers.
 * Reads auth tokens from Next.js request cookies.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // `setAll` can fail in Server Components — that's OK.
            // The cookies will be refreshed by the middleware instead.
          }
        },
      },
    }
  );
}

/**
 * Get the currently authenticated user, or null.
 */
export async function getUser() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Determine user role from Supabase user metadata.
 * Falls back to "customer" if no role is set.
 *
 * In production, you'd store roles in a `profiles` table and join on auth.uid().
 * For now we read from `user_metadata.role` set at sign-up or by an admin.
 */
export async function getUserRole(): Promise<"admin" | "customer"> {
  const user = await getUser();
  if (!user) return "customer";
  return (user.user_metadata?.role as "admin" | "customer") ?? "customer";
}
