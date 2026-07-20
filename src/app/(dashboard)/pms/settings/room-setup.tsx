"use client";

import { useMemo, useState, useTransition } from "react";
import { BedDouble, Clock, Moon, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatLKR } from "@/lib/utils";
import type { RatePlanKind, Room, RoomRatePlan, RoomStatus, RoomType } from "@/lib/types";
import {
  createRatePlan,
  createRoom,
  createRoomType,
  deleteRatePlan,
  deleteRoom,
  deleteRoomType,
  toggleRatePlan,
  updateRatePlan,
  updateRoom,
  updateRoomType,
} from "./actions";

const STATUS_BADGE: Record<RoomStatus, "success" | "info" | "warning" | "danger"> = {
  vacant: "success",
  occupied: "info",
  dirty: "warning",
  maintenance: "danger",
};

export function RoomSetup({
  roomTypes,
  rooms,
  ratePlans,
}: {
  roomTypes: RoomType[];
  rooms: Room[];
  ratePlans: RoomRatePlan[];
}) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [typeDialog, setTypeDialog] = useState<{ mode: "create" } | { mode: "edit"; item: RoomType } | null>(null);
  const [roomDialog, setRoomDialog] = useState<{ mode: "create" } | { mode: "edit"; item: Room } | null>(null);
  const [planDialog, setPlanDialog] = useState<{ mode: "create" } | { mode: "edit"; item: RoomRatePlan } | null>(null);

  const roomCountByType = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rooms) map.set(r.type_id, (map.get(r.type_id) ?? 0) + 1);
    return map;
  }, [rooms]);

  const planCountByType = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of ratePlans) map.set(p.room_type_id, (map.get(p.room_type_id) ?? 0) + 1);
    return map;
  }, [ratePlans]);

  function handleDeleteType(t: RoomType) {
    startTransition(async () => {
      const res = await deleteRoomType(t.id);
      setFeedback(res.ok ? `Category “${t.name}” deleted.` : res.error ?? "Could not delete.");
    });
  }

  function handleDeleteRoom(r: Room) {
    startTransition(async () => {
      const res = await deleteRoom(r.id);
      setFeedback(res.ok ? `Room ${r.room_number} removed.` : res.error ?? "Could not delete.");
    });
  }

  function handleTogglePlan(p: RoomRatePlan) {
    startTransition(async () => {
      const res = await toggleRatePlan(p.id, !p.is_active);
      setFeedback(
        res.ok
          ? `“${p.name}” is now ${p.is_active ? "hidden from" : "available on"} the booking form.`
          : res.error ?? "Could not update the plan."
      );
    });
  }

  function handleDeletePlan(p: RoomRatePlan) {
    startTransition(async () => {
      const res = await deleteRatePlan(p.id);
      setFeedback(
        res.ok
          ? `Plan “${p.name}” deleted — past bookings keep their snapshot.`
          : res.error ?? "Could not delete."
      );
    });
  }

  return (
    <div className="space-y-6">
      {feedback && <p className="rounded-md bg-muted px-3 py-2 text-xs">{feedback}</p>}

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        {/* Room categories */}
        <Card className="h-fit">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Tags className="h-4 w-4" />
              Room categories
            </CardTitle>
            <Button size="sm" onClick={() => setTypeDialog({ mode: "create" })}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {roomTypes.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-md border px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    sleeps {t.max_occupancy} · {roomCountByType.get(t.id) ?? 0} room(s) ·{" "}
                    {planCountByType.get(t.id) ?? 0} plan(s)
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setTypeDialog({ mode: "edit", item: t })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    disabled={pending || (roomCountByType.get(t.id) ?? 0) > 0}
                    title={
                      (roomCountByType.get(t.id) ?? 0) > 0
                        ? "Reassign its rooms first"
                        : "Delete category"
                    }
                    onClick={() => handleDeleteType(t)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            {roomTypes.length === 0 && (
              <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                No categories yet — add one to start creating rooms.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              A category is just the physical room type — all pricing lives in the rate plans
              below. One room can be sold under any of its category&apos;s plans.
            </p>
          </CardContent>
        </Card>

        {/* Rooms */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <BedDouble className="h-4 w-4" />
              Rooms ({rooms.length})
            </CardTitle>
            <Button
              size="sm"
              onClick={() => setRoomDialog({ mode: "create" })}
              disabled={roomTypes.length === 0}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New room
            </Button>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Room</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Plans</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rooms.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.room_number}</TableCell>
                    <TableCell className="text-sm">{r.room_types?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {planCountByType.get(r.type_id) ?? 0} plan(s)
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.floor_zone ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[r.status]} className="capitalize">
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => setRoomDialog({ mode: "edit", item: r })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          disabled={pending || r.status === "occupied"}
                          title={
                            r.status === "occupied"
                              ? "Check the guest out first"
                              : "Delete room"
                          }
                          onClick={() => handleDeleteRoom(r)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {rooms.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      No rooms yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Rate plans */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Rate plans — AC / Non-AC / hourly blocks
          </CardTitle>
          <Button
            size="sm"
            onClick={() => setPlanDialog({ mode: "create" })}
            disabled={roomTypes.length === 0}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New plan
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {roomTypes.map((t) => {
            const plans = ratePlans.filter((p) => p.room_type_id === t.id);
            if (plans.length === 0) return null;
            return (
              <div key={t.id}>
                <p className="pb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t.name}
                </p>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {plans.map((p) => (
                    <div
                      key={p.id}
                      className={
                        "flex items-center justify-between rounded-md border px-3 py-2.5 " +
                        (p.is_active ? "" : "opacity-60")
                      }
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          {p.kind === "block" ? (
                            <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <Moon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                          {p.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatLKR(Number(p.price))}
                          {p.kind === "per_night" ? " / night" : ` flat · ${p.duration_hours}h`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => handleTogglePlan(p)}
                          disabled={pending}
                          className={
                            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors " +
                            (p.is_active ? "bg-emerald-500" : "bg-muted-foreground/30")
                          }
                          aria-label={`Toggle ${p.name}`}
                        >
                          <span
                            className={
                              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform " +
                              (p.is_active ? "translate-x-[18px]" : "translate-x-0.5")
                            }
                          />
                        </button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => setPlanDialog({ mode: "edit", item: p })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          disabled={pending}
                          onClick={() => handleDeletePlan(p)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {ratePlans.length === 0 && (
            <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              No rate plans yet — add plans like “AC — Full Night”, “Non-AC — Full Night” or
              “Short Stay — 3h” so they appear on the booking form.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Per-night plans multiply by the number of nights. Time-block plans are a flat price
            with a countdown that starts at check-in.
          </p>
        </CardContent>
      </Card>

      {/* Category dialog */}
      <Dialog open={typeDialog !== null} onOpenChange={(open) => !open && setTypeDialog(null)}>
        {typeDialog && (
          <RoomTypeDialog
            key={typeDialog.mode === "edit" ? typeDialog.item.id : "create"}
            item={typeDialog.mode === "edit" ? typeDialog.item : undefined}
            onDone={(msg) => {
              setTypeDialog(null);
              setFeedback(msg);
            }}
          />
        )}
      </Dialog>

      {/* Room dialog */}
      <Dialog open={roomDialog !== null} onOpenChange={(open) => !open && setRoomDialog(null)}>
        {roomDialog && (
          <RoomDialog
            key={roomDialog.mode === "edit" ? roomDialog.item.id : "create"}
            item={roomDialog.mode === "edit" ? roomDialog.item : undefined}
            roomTypes={roomTypes}
            onDone={(msg) => {
              setRoomDialog(null);
              setFeedback(msg);
            }}
          />
        )}
      </Dialog>

      {/* Rate plan dialog */}
      <Dialog open={planDialog !== null} onOpenChange={(open) => !open && setPlanDialog(null)}>
        {planDialog && (
          <RatePlanDialog
            key={planDialog.mode === "edit" ? planDialog.item.id : "create"}
            item={planDialog.mode === "edit" ? planDialog.item : undefined}
            roomTypes={roomTypes}
            onDone={(msg) => {
              setPlanDialog(null);
              setFeedback(msg);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function RoomTypeDialog({ item, onDone }: { item?: RoomType; onDone: (msg: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(item);

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = editing
        ? await updateRoomType(item?.id ?? "", formData)
        : await createRoomType(formData);
      if (res.ok) onDone(editing ? "Category updated." : "Category added.");
      else setError(res.error ?? "Could not save.");
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? `Edit — ${item?.name}` : "New room category"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Renaming keeps all rooms and rate plans attached."
            : "The physical room type only — e.g. Deluxe, Family Suite. Set prices in Rate Plans."}
        </DialogDescription>
      </DialogHeader>
      <form action={submit} className="grid gap-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="rt-name">Category name</Label>
          <Input id="rt-name" name="name" defaultValue={item?.name} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rt-occ">Max occupancy</Label>
          <Input
            id="rt-occ"
            name="max_occupancy"
            type="number"
            min="1"
            step="1"
            defaultValue={item?.max_occupancy ?? 2}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Add category"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function RoomDialog({
  item,
  roomTypes,
  onDone,
}: {
  item?: Room;
  roomTypes: RoomType[];
  onDone: (msg: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(item);

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = editing ? await updateRoom(item?.id ?? "", formData) : await createRoom(formData);
      if (res.ok) onDone(editing ? "Room updated." : "Room added.");
      else setError(res.error ?? "Could not save.");
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? `Edit — Room ${item?.room_number}` : "New room"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Renumber or recategorize this room — its booking history stays intact."
            : "The room starts as vacant and appears on the grid immediately."}
        </DialogDescription>
      </DialogHeader>
      <form action={submit} className="grid gap-4 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="room-number">Room number</Label>
            <Input id="room-number" name="room_number" defaultValue={item?.room_number} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="room-zone">Floor / zone</Label>
            <Input
              id="room-zone"
              name="floor_zone"
              defaultValue={item?.floor_zone ?? ""}
              placeholder="e.g. Ground Wing"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="room-type">Category</Label>
          <Select id="room-type" name="type_id" defaultValue={item?.type_id ?? roomTypes[0]?.id}>
            {roomTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {formatLKR(Number(t.base_price))}/night
              </option>
            ))}
          </Select>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Add room"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function RatePlanDialog({
  item,
  roomTypes,
  onDone,
}: {
  item?: RoomRatePlan;
  roomTypes: RoomType[];
  onDone: (msg: string) => void;
}) {
  const [kind, setKind] = useState<RatePlanKind>(item?.kind ?? "per_night");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(item);

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = editing
        ? await updateRatePlan(item?.id ?? "", formData)
        : await createRatePlan(formData);
      if (res.ok) onDone(editing ? "Rate plan updated." : "Rate plan added.");
      else setError(res.error ?? "Could not save.");
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? `Edit — ${item?.name}` : "New rate plan"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Changes only apply to bookings made from now on — existing bookings keep their price."
            : "e.g. AC — Full Night (per night), Day Use — 12h or Short Stay — 3h (time blocks)."}
        </DialogDescription>
      </DialogHeader>
      <form action={submit} className="grid gap-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="rp-type">Room category</Label>
          <Select
            id="rp-type"
            name="room_type_id"
            defaultValue={item?.room_type_id ?? roomTypes[0]?.id}
          >
            {roomTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rp-name">Plan name</Label>
          <Input
            id="rp-name"
            name="name"
            defaultValue={item?.name}
            placeholder="e.g. AC — Full Night"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rp-kind">Plan type</Label>
            <Select
              id="rp-kind"
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as RatePlanKind)}
            >
              <option value="per_night">Per night</option>
              <option value="block">Time block (hours)</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-price">
              Price (LKR{kind === "per_night" ? " / night" : " flat"})
            </Label>
            <Input
              id="rp-price"
              name="price"
              type="number"
              min="0"
              step="0.01"
              defaultValue={item ? Number(item.price) : undefined}
              required
            />
          </div>
        </div>
        {kind === "block" && (
          <div className="space-y-1.5">
            <Label htmlFor="rp-hours">Duration (hours)</Label>
            <Input
              id="rp-hours"
              name="duration_hours"
              type="number"
              min="1"
              step="1"
              defaultValue={item?.duration_hours ?? 3}
              required
            />
            <p className="text-xs text-muted-foreground">
              The countdown starts when the guest checks in.
            </p>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Add plan"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
