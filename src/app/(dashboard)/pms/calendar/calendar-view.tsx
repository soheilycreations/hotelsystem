"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  PartyPopper,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Booking, EventBooking, EventStatus } from "@/lib/types";
import { createEventBooking, deleteEventBooking, updateEventBooking } from "./actions";

const STATUS_BADGE: Record<EventStatus, "warning" | "success" | "danger"> = {
  tentative: "warning",
  confirmed: "success",
  cancelled: "danger",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface DayCell {
  date: string; // YYYY-MM-DD
  dayNum: number;
  inMonth: boolean;
  isToday: boolean;
}

function buildMonthGrid(monthKey: string, todayKey: string): DayCell[] {
  const parts = monthKey.split("-").map(Number);
  const y = parts[0] ?? new Date().getFullYear();
  const m = parts[1] ?? new Date().getMonth() + 1;
  const firstOfMonth = new Date(y, m - 1, 1);
  const startWeekday = firstOfMonth.getDay(); // 0 = Sun
  const gridStart = new Date(y, m - 1, 1 - startWeekday);

  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    cells.push({
      date: key,
      dayNum: d.getDate(),
      inMonth: d.getMonth() === m - 1,
      isToday: key === todayKey,
    });
  }
  return cells;
}

export function CalendarView({
  monthKey,
  events,
  bookings,
}: {
  monthKey: string;
  events: EventBooking[];
  bookings: Booking[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState<string | null>(null);
  const [editing, setEditing] = useState<EventBooking | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const grid = useMemo(() => buildMonthGrid(monthKey, todayKey), [monthKey, todayKey]);

  const monthLabel = new Date(`${monthKey}-01T00:00:00`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  function goToMonth(next: string) {
    startTransition(() => router.push(`/pms/calendar?month=${next}`));
  }
  function shiftMonth(delta: number) {
    const parts = monthKey.split("-").map(Number);
    const y = parts[0] ?? new Date().getFullYear();
    const m = parts[1] ?? new Date().getMonth() + 1;
    const d = new Date(y, m - 1 + delta, 1);
    goToMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventBooking[]>();
    for (const e of events) {
      if (e.status === "cancelled") continue;
      (map.get(e.event_date) ?? map.set(e.event_date, []).get(e.event_date)!).push(e);
    }
    return map;
  }, [events]);

  const arrivalsByDay = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of bookings) {
      const key = b.check_in_date.slice(0, 10);
      (map.get(key) ?? map.set(key, []).get(key)!).push(b);
    }
    return map;
  }, [bookings]);

  const inHouseByDay = useMemo(() => {
    // Bookings spanning a given day (already checked in, staying through it).
    const map = new Map<string, number>();
    for (const b of bookings) {
      if (b.status !== "checked_in") continue;
      const start = new Date(b.check_in_date.slice(0, 10));
      const end = new Date(b.check_out_date.slice(0, 10));
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
    return map;
  }, [bookings]);

  const upcomingEvents = useMemo(
    () =>
      events
        .filter((e) => e.status !== "cancelled" && e.event_date >= todayKey)
        .sort((a, b) => (a.event_date + (a.event_time ?? "")).localeCompare(b.event_date + (b.event_time ?? ""))),
    [events, todayKey]
  );

  return (
    <div className="space-y-6">
      {feedback && <p className="rounded-md bg-muted px-3 py-2 text-xs">{feedback}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => shiftMonth(-1)} disabled={pending}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[10rem] text-center text-sm font-medium">{monthLabel}</span>
          <Button size="icon" variant="outline" onClick={() => shiftMonth(1)} disabled={pending}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => goToMonth(todayKey.slice(0, 7))} disabled={pending}>
            Today
          </Button>
        </div>
        <Dialog
          open={addOpen}
          onOpenChange={(open) => {
            setAddOpen(open);
            if (!open) setAddDate(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setAddDate(todayKey)}>
              <Plus className="mr-2 h-4 w-4" />
              Add function
            </Button>
          </DialogTrigger>
          <EventDialog
            defaultDate={addDate ?? todayKey}
            onDone={(msg) => {
              setAddOpen(false);
              setFeedback(msg);
            }}
          />
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-2 sm:p-4">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((cell) => {
              const dayEvents = eventsByDay.get(cell.date) ?? [];
              const arrivals = arrivalsByDay.get(cell.date) ?? [];
              const inHouse = inHouseByDay.get(cell.date) ?? 0;
              const visibleEvents = dayEvents.slice(0, 2);
              const moreCount = dayEvents.length - visibleEvents.length;

              return (
                <button
                  key={cell.date}
                  onClick={() => {
                    setAddDate(cell.date);
                    setAddOpen(true);
                  }}
                  className={cn(
                    "flex min-h-[86px] flex-col items-start gap-0.5 rounded-md border p-1.5 text-left transition-colors hover:bg-accent",
                    !cell.inMonth && "opacity-40",
                    cell.isToday && "border-primary"
                  )}
                >
                  <span className={cn("text-xs font-medium", cell.isToday && "text-primary")}>
                    {cell.dayNum}
                  </span>
                  {visibleEvents.map((e) => (
                    <span
                      key={e.id}
                      className="w-full truncate rounded bg-purple-500/15 px-1 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-300"
                      title={e.event_name}
                    >
                      {e.event_time ? `${e.event_time.slice(0, 5)} ` : ""}
                      {e.event_name}
                    </span>
                  ))}
                  {moreCount > 0 && (
                    <span className="text-[10px] text-muted-foreground">+{moreCount} more</span>
                  )}
                  {arrivals.length > 0 && (
                    <span className="w-full truncate rounded bg-sky-500/15 px-1 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-300">
                      {arrivals.length} arrival{arrivals.length > 1 ? "s" : ""}
                    </span>
                  )}
                  {inHouse > 0 && arrivals.length === 0 && (
                    <span className="text-[10px] text-muted-foreground">{inHouse} in house</span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-purple-500" /> Function
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-500" /> Room arrivals
            </span>
            Click any day to add a function.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CalendarDays className="h-4 w-4" />
            Upcoming functions
          </p>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming functions booked yet.</p>
          ) : (
            <div className="space-y-2">
              {upcomingEvents.map((e) => (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{e.event_name}</p>
                      <Badge variant={STATUS_BADGE[e.status]} className="capitalize">
                        {e.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(`${e.event_date}T00:00:00`).toLocaleDateString("en-GB", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                      {e.event_time ? ` · ${e.event_time.slice(0, 5)}` : ""}
                      {e.pax ? ` · ${e.pax} pax` : ""}
                      {e.description ? ` · ${e.description}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(e)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && (
          <EventDialog
            key={editing.id}
            item={editing}
            defaultDate={editing.event_date}
            onDone={(msg) => {
              setEditing(null);
              setFeedback(msg);
            }}
            onDelete={(msg) => {
              setEditing(null);
              setFeedback(msg);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function EventDialog({
  item,
  defaultDate,
  onDone,
  onDelete,
}: {
  item?: EventBooking;
  defaultDate: string;
  onDone: (msg: string) => void;
  onDelete?: (msg: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(item);

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = editing
        ? await updateEventBooking(item!.id, formData)
        : await createEventBooking(formData);
      if (res.ok) onDone(editing ? "Function updated." : "Function added to the calendar.");
      else setError(res.error ?? "Could not save.");
    });
  }

  function remove() {
    if (!item) return;
    startTransition(async () => {
      const res = await deleteEventBooking(item.id);
      if (res.ok) onDelete?.(`"${item.event_name}" removed.`);
      else setError(res.error ?? "Could not delete.");
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <PartyPopper className="h-4 w-4" />
          {editing ? `Edit — ${item?.event_name}` : "Add a function"}
        </DialogTitle>
        <DialogDescription>
          Shows up on the calendar the moment you save — pax, time, and a short description keep
          the team on the same page.
        </DialogDescription>
      </DialogHeader>
      <form action={submit} className="grid gap-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="ev-name">Event name</Label>
          <Input
            id="ev-name"
            name="event_name"
            defaultValue={item?.event_name}
            placeholder="e.g. Perera Wedding"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ev-date">Date</Label>
            <Input id="ev-date" name="event_date" type="date" defaultValue={item?.event_date ?? defaultDate} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-time">Time (optional)</Label>
            <Input id="ev-time" name="event_time" type="time" defaultValue={item?.event_time?.slice(0, 5) ?? ""} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ev-pax" className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Pax
            </Label>
            <Input id="ev-pax" name="pax" type="number" min="1" step="1" defaultValue={item?.pax ?? ""} placeholder="e.g. 120" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-status">Status</Label>
            <Select id="ev-status" name="status" defaultValue={item?.status ?? "confirmed"}>
              <option value="tentative">Tentative</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-desc">Description</Label>
          <Textarea
            id="ev-desc"
            name="description"
            rows={2}
            defaultValue={item?.description ?? ""}
            placeholder="e.g. Full hall, projector needed, buffet for 120"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ev-contact-name">Contact name (optional)</Label>
            <Input id="ev-contact-name" name="contact_name" defaultValue={item?.contact_name ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-contact-number">Contact number</Label>
            <Input id="ev-contact-number" name="contact_number" defaultValue={item?.contact_number ?? ""} placeholder="07X XXX XXXX" />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="flex-row justify-between sm:justify-between">
          {editing ? (
            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={remove} disabled={pending}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Add function"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
