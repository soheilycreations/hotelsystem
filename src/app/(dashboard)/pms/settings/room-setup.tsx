"use client";

import { useMemo, useState, useTransition } from "react";
import { BedDouble, Pencil, Plus, Tags, Trash2 } from "lucide-react";
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
import type { Room, RoomStatus, RoomType } from "@/lib/types";
import {
  createRoom,
  createRoomType,
  deleteRoom,
  deleteRoomType,
  updateRoom,
  updateRoomType,
} from "./actions";

const STATUS_BADGE: Record<RoomStatus, "success" | "info" | "warning" | "danger"> = {
  vacant: "success",
  occupied: "info",
  dirty: "warning",
  maintenance: "danger",
};

export function RoomSetup({ roomTypes, rooms }: { roomTypes: RoomType[]; rooms: Room[] }) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [typeDialog, setTypeDialog] = useState<{ mode: "create" } | { mode: "edit"; item: RoomType } | null>(null);
  const [roomDialog, setRoomDialog] = useState<{ mode: "create" } | { mode: "edit"; item: Room } | null>(null);

  const roomCountByType = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rooms) map.set(r.type_id, (map.get(r.type_id) ?? 0) + 1);
    return map;
  }, [rooms]);

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

  return (
    <div className="space-y-6">
      {feedback && <p className="rounded-md bg-muted px-3 py-2 text-xs">{feedback}</p>}

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        {/* Room categories */}
        <Card className="h-fit">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Tags className="h-4 w-4" />
              Categories & rates
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
                    {formatLKR(Number(t.base_price))} / night · sleeps {t.max_occupancy} ·{" "}
                    {roomCountByType.get(t.id) ?? 0} room(s)
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
              Changing a rate only affects new bookings — existing folios keep their totals.
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
                  <TableHead className="text-right">Rate</TableHead>
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
                    <TableCell className="text-right text-sm tabular-nums">
                      {r.room_types ? formatLKR(Number(r.room_types.base_price)) : "—"}
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
            ? "Rate changes only apply to bookings made from now on."
            : "e.g. Standard Double, Deluxe Sea View, Family Suite."}
        </DialogDescription>
      </DialogHeader>
      <form action={submit} className="grid gap-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="rt-name">Category name</Label>
          <Input id="rt-name" name="name" defaultValue={item?.name} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rt-price">Nightly rate (LKR)</Label>
            <Input
              id="rt-price"
              name="base_price"
              type="number"
              min="0"
              step="0.01"
              defaultValue={item ? Number(item.base_price) : undefined}
              required
            />
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
