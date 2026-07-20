import { createClient } from "@/lib/supabase/server";
import type { HotelSettings } from "@/lib/types";
import { HotelProfileForm } from "./hotel-profile-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hotel Profile" };

export default async function HotelSettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("hotel_settings").select("*").eq("id", 1).maybeSingle();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hotel profile</h1>
        <p className="text-sm text-muted-foreground">
          The name, address and contact numbers print on every bill. The logo appears across the
          app.
        </p>
      </div>
      <HotelProfileForm settings={(data as HotelSettings | null) ?? null} />
    </div>
  );
}
