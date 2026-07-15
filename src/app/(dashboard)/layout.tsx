import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import { RouteGuard } from "@/components/route-guard";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");

  return (
    <div className="min-h-dvh">
      <AppSidebar profile={profile} />
      <div className="md:pl-60">
        <RouteGuard role={profile.role}>
          <main className="mx-auto w-full max-w-7xl p-4 md:p-6">{children}</main>
        </RouteGuard>
      </div>
    </div>
  );
}
