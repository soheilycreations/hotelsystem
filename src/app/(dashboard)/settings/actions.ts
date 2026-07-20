"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionProfile } from "@/lib/supabase/server";

interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function updateHotelSettings(formData: FormData): Promise<ActionResult> {
  try {
    const profile = await getSessionProfile();
    if (!profile || !["admin", "manager"].includes(profile.role)) {
      throw new Error("Not authorized to change the hotel profile.");
    }

    const hotelName = String(formData.get("hotel_name") ?? "").trim();
    const address = String(formData.get("address") ?? "").trim();
    const phonePrimary = String(formData.get("phone_primary") ?? "").trim();
    const phoneSecondary = String(formData.get("phone_secondary") ?? "").trim();
    const logoUrl = String(formData.get("logo_url") ?? "").trim();

    if (!hotelName) return { ok: false, error: "Hotel name is required." };
    if (logoUrl && !/^https?:\/\//.test(logoUrl))
      return { ok: false, error: "Logo URL must start with http:// or https://" };

    const supabase = await createClient();
    const { error } = await supabase
      .from("hotel_settings")
      .update({
        hotel_name: hotelName,
        address: address || null,
        phone_primary: phonePrimary || null,
        phone_secondary: phoneSecondary || null,
        logo_url: logoUrl || null,
      })
      .eq("id", 1);
    if (error) return { ok: false, error: error.message };

    // Header data flows into every screen and printed bill
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
