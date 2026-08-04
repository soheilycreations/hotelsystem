import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StaffProfile } from "@/lib/types";
import { UsersView } from "./users-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staff Accounts" };

export interface StaffWithEmail extends StaffProfile {
  email: string;
}

export default async function UsersPage() {
  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("staff_profiles")
    .select("*")
    .order("created_at", { ascending: true });

  // staff_profiles has no email column (it lives on auth.users) — resolve it
  // via the Admin API. A small hotel's staff list comfortably fits one page.
  let emailById = new Map<string, string>();
  let adminError: string | null = null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    emailById = new Map(data.users.map((u) => [u.id, u.email ?? "—"]));
  } catch (e) {
    adminError = e instanceof Error ? e.message : "Could not load staff emails.";
  }

  const staffWithEmail: StaffWithEmail[] = ((staff as StaffProfile[] | null) ?? []).map((s) => ({
    ...s,
    email: emailById.get(s.id) ?? "—",
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff accounts</h1>
        <p className="text-sm text-muted-foreground">
          Create logins, change roles, and deactivate access — admin only.
        </p>
      </div>
      {adminError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {adminError} — check that <code>SUPABASE_SERVICE_ROLE_KEY</code> is set in your
          environment variables.
        </p>
      )}
      <UsersView staff={staffWithEmail} />
    </div>
  );
}
