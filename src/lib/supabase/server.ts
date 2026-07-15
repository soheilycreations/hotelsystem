import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { StaffProfile } from "@/lib/types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
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
            // Called from a Server Component — middleware refreshes sessions.
          }
        },
      },
    }
  );
}

/** Returns the signed-in staff profile, or null when unauthenticated/inactive. */
export async function getSessionProfile(): Promise<StaffProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("staff_profiles")
    .select("*")
    .eq("id", user.id)
    .eq("is_active", true)
    .single();

  return (data as StaffProfile | null) ?? null;
}
