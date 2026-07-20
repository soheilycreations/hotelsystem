import { redirect } from "next/navigation";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import type { HotelSettings } from "@/lib/types";
import { AppSidebar } from "@/components/app-sidebar";
import { RouteGuard } from "@/components/route-guard";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: hotel } = await supabase
    .from("hotel_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  const settings = (hotel as HotelSettings | null) ?? null;

  return (
    <div className="min-h-dvh">
      <AppSidebar
        profile={profile}
        hotelName={settings?.hotel_name ?? "Soheily PMS"}
        logoUrl={settings?.logo_url ?? null}
      />
      <div className="md:pl-60">
        <RouteGuard role={profile.role}>
          <main className="mx-auto w-full max-w-7xl p-4 md:p-6">{children}</main>
        </RouteGuard>
      </div>
    </div>
  );
}
