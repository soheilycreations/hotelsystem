import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS and can call the Supabase Admin API
 * (create/update/delete auth users, reset passwords). NEVER import this
 * outside a "use server" action file, and never send this key to the
 * browser. Requires SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_ prefix) to be
 * set in the environment — see README for where to find it.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it in your environment variables (Project Settings → API → service_role key in Supabase) to manage staff accounts."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Generates a strong, easy-to-read temporary password (avoids ambiguous chars). */
export function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}
