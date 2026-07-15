"use client";

import { useState, useTransition } from "react";
import { BedDouble, Brush, Loader2, Wrench } from "lucide-react";
import type { Room, RoomStatus } from "@/lib/types";
import { cn, formatLKR } from "@/lib/utils";
import { setRoomStatus } from "../actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STATUS_STYLES: Record<RoomStatus, string> = {
  vacant: "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20",
  occupied: "border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20",
  dirty: "border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20",
  maintenance: "border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20",
};

const STATUS_BADGE: Record<RoomStatus, "success" | "info" | "warning" | "danger"> = {
  vacant: "success",
  occupied: "info",
  dirty: "warning",
  maintenance: "danger",
};

export function RoomGrid({ rooms, zones }: { rooms: Room[]; zones: string[] }) {
  const [selected, setSelected] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const changeStatus = (status: RoomStatus) => {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const result = await setRoomStatus(selected.id, status);
      if (!result.ok) setError(result.error ?? "Update failed");
      else setSelected(null);
    });
  };

  return (
    <>
      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STATUS_BADGE) as RoomStatus[]).map((s) => (
          <Badge key={s} variant={STATUS_BADGE[s]} className="capitalize">
            {s}
          </Badge>
        ))}
      </div>

      {zones.map((zone) => (
        <section key={zone} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {zone}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {rooms
              .filter((r) => (r.floor_zone ?? "Unzoned") === zone)
              .map((room) => (
                <button
                  key={room.id}
                  onClick={() => setSelected(room)}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    STATUS_STYLES[room.status]
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold">{room.room_number}</span>
                    <BedDouble className="h-4 w-4 opacity-70" />
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {room.room_types?.name ?? "—"}
                  </p>
                  <Badge variant={STATUS_BADGE[room.status]} className="mt-2 capitalize">
                    {room.status}
                  </Badge>
                </button>
              ))}
          </div>
        </section>
      ))}

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Room {selected?.room_number}</DialogTitle>
            <DialogDescription>
              {selected?.room_types?.name} · {formatLKR(Number(selected?.room_types?.base_price ?? 0))}
              /night · sleeps {selected?.room_types?.max_occupancy}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              disabled={pending || selected?.status === "vacant"}
              onClick={() => changeStatus("vacant")}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Brush />} Mark cleaned
            </Button>
            <Button
              variant="outline"
              disabled={pending || selected?.status === "maintenance"}
              onClick={() => changeStatus("maintenance")}
            >
              <Wrench /> Maintenance
            </Button>
            <Button
              variant="outline"
              className="col-span-2"
              disabled={pending || selected?.status === "dirty"}
              onClick={() => changeStatus("dirty")}
            >
              Flag for housekeeping
            </Button>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <p className="text-xs text-muted-foreground">
            Check-ins and check-outs are done from the Bookings screen — occupied status flips
            automatically.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
