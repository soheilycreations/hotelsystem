import { createClient } from "@/lib/supabase/server";
import { colomboToday } from "@/lib/colombo-date";
import type { Booking, EventBooking } from "@/lib/types";
import { CalendarView } from "./calendar-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar" };

function monthBounds(monthKey: string): { start: string; end: string } {
  const parts = monthKey.split("-").map(Number);
  const y = parts[0] ?? new Date().getFullYear();
  const m = parts[1] ?? new Date().getMonth() + 1;
  const start = `${monthKey}-01`;
  const lastDay = new Date(y, m, 0).getDate(); // day 0 of next month = last day of this month
  const end = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const isValidMonth = (m?: string) => !!m && /^\d{4}-\d{2}$/.test(m);
  const monthKey = isValidMonth(month) ? (month as string) : colomboToday().slice(0, 7);
  const { start, end } = monthBounds(monthKey);

  const supabase = await createClient();

  const [{ data: events }, { data: bookings }] = await Promise.all([
    supabase
      .from("event_bookings")
      .select("*")
      .gte("event_date", start)
      .lte("event_date", end)
      .order("event_date")
      .order("event_time"),
    // Room bookings that touch this month at all — arriving, departing, or
    // spanning through it — so a long stay still shows on every day of it.
    supabase
      .from("bookings")
      .select("id, guest_name, room_id, check_in_date, check_out_date, status, rooms(room_number)")
      .in("status", ["pending", "checked_in"])
      .lte("check_in_date", `${end}T23:59:59`)
      .gte("check_out_date", `${start}T00:00:00`),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted-foreground">
          Upcoming functions and room bookings, at a glance — add a function as soon as it&apos;s
          confirmed and it shows up right away.
        </p>
      </div>
      <CalendarView
        monthKey={monthKey}
        events={(events as EventBooking[] | null) ?? []}
        bookings={(bookings as Booking[] | null) ?? []}
      />
    </div>
  );
}
