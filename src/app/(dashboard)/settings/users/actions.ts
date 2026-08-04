"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { createAdminClient, generateTempPassword } from "@/lib/supabase/admin";
import type { StaffRole } from "@/lib/types";

interface ActionResult {
  ok: boolean;
  error?: string;
  password?: string; // returned once, on create or reset — never stored/logged
}

const VALID_ROLES: StaffRole[] = ["admin", "manager", "receptionist", "cashier", "kitchen_staff"];

/** Only admins manage accounts — this controls who can log in at all. */
async function assertAdmin() {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "admin") {
    throw new Error("Only an admin can manage staff accounts.");
  }
  return profile;
}

function revalidateStaff(): void {
  revalidatePath("/settings/users");
}

export async function createStaffAccount(formData: FormData): Promise<ActionResult> {
  try {
    await assertAdmin();

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const fullName = String(formData.get("full_name") ?? "").trim();
    const role = String(formData.get("role") ?? "") as StaffRole;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return { ok: false, error: "Enter a valid email address." };
    if (!fullName) return { ok: false, error: "Full name is required." };
    if (!VALID_ROLES.includes(role)) return { ok: false, error: "Pick a valid role." };

    const admin = createAdminClient();
    const password = generateTempPassword();

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // no email service configured — skip the confirmation step
    });
    if (createError || !created.user)
      return { ok: false, error: createError?.message ?? "Could not create the login." };

    const { error: profileError } = await admin.from("staff_profiles").insert({
      id: created.user.id,
      full_name: fullName,
      role,
      is_active: true,
    });
    if (profileError) {
      // Roll back the orphaned auth user so a failed attempt doesn't leave a
      // dangling login with no staff profile.
      await admin.auth.admin.deleteUser(created.user.id);
      return { ok: false, error: profileError.message };
    }

    revalidateStaff();
    return { ok: true, password };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateStaffAccount(
  staffId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const profile = await assertAdmin();

    const fullName = String(formData.get("full_name") ?? "").trim();
    const role = String(formData.get("role") ?? "") as StaffRole;

    if (!fullName) return { ok: false, error: "Full name is required." };
    if (!VALID_ROLES.includes(role)) return { ok: false, error: "Pick a valid role." };

    if (staffId === profile.id && role !== "admin")
      return { ok: false, error: "You can't remove your own admin role." };

    const supabase = await createClient();

    if (role !== "admin") {
      const { count } = await supabase
        .from("staff_profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("is_active", true)
        .neq("id", staffId);
      if ((count ?? 0) === 0)
        return { ok: false, error: "Cannot remove the last active admin." };
    }

    const { error } = await supabase
      .from("staff_profiles")
      .update({ full_name: fullName, role })
      .eq("id", staffId);
    if (error) return { ok: false, error: error.message };

    revalidateStaff();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function toggleStaffActive(staffId: string, isActive: boolean): Promise<ActionResult> {
  try {
    const profile = await assertAdmin();
    const supabase = await createClient();

    if (staffId === profile.id && !isActive)
      return { ok: false, error: "You can't deactivate your own account." };

    if (!isActive) {
      const { data: target } = await supabase
        .from("staff_profiles")
        .select("role")
        .eq("id", staffId)
        .single();
      if (target?.role === "admin") {
        const { count } = await supabase
          .from("staff_profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin")
          .eq("is_active", true)
          .neq("id", staffId);
        if ((count ?? 0) === 0)
          return { ok: false, error: "Cannot deactivate the last active admin." };
      }
    }

    const { error } = await supabase
      .from("staff_profiles")
      .update({ is_active: isActive })
      .eq("id", staffId);
    if (error) return { ok: false, error: error.message };

    revalidateStaff();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function resetStaffPassword(staffId: string): Promise<ActionResult> {
  try {
    await assertAdmin();
    const admin = createAdminClient();
    const password = generateTempPassword();

    const { error } = await admin.auth.admin.updateUserById(staffId, { password });
    if (error) return { ok: false, error: error.message };

    return { ok: true, password };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
