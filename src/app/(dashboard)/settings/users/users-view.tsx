"use client";

import { useState, useTransition } from "react";
import {
  Check,
  Copy,
  KeyRound,
  Pencil,
  Plus,
  ShieldAlert,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
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
import type { StaffRole } from "@/lib/types";
import type { StaffWithEmail } from "./page";
import {
  createStaffAccount,
  resetStaffPassword,
  toggleStaffActive,
  updateStaffAccount,
} from "./actions";

const ROLE_LABEL: Record<StaffRole, string> = {
  admin: "Admin",
  manager: "Manager",
  receptionist: "Receptionist",
  cashier: "Cashier",
  kitchen_staff: "Kitchen Staff",
};

const ROLE_BADGE: Record<StaffRole, "danger" | "warning" | "info" | "success" | "secondary"> = {
  admin: "danger",
  manager: "warning",
  receptionist: "info",
  cashier: "success",
  kitchen_staff: "secondary",
};

export function UsersView({ staff }: { staff: StaffWithEmail[] }) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<StaffWithEmail | null>(null);
  const [revealedPassword, setRevealedPassword] = useState<{ name: string; password: string } | null>(
    null
  );

  function handleToggleActive(s: StaffWithEmail) {
    startTransition(async () => {
      const res = await toggleStaffActive(s.id, !s.is_active);
      setFeedback(
        res.ok
          ? `${s.full_name} is now ${s.is_active ? "deactivated" : "active"}.`
          : res.error ?? "Could not update."
      );
    });
  }

  function handleResetPassword(s: StaffWithEmail) {
    startTransition(async () => {
      const res = await resetStaffPassword(s.id);
      if (res.ok && res.password) {
        setRevealedPassword({ name: s.full_name, password: res.password });
      } else {
        setFeedback(res.error ?? "Could not reset the password.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {feedback && <p className="rounded-md bg-muted px-3 py-2 text-xs">{feedback}</p>}

      <div className="flex justify-end">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="mr-2 h-4 w-4" />
              New staff
            </Button>
          </DialogTrigger>
          <CreateStaffDialog
            onDone={(password, name) => {
              setAddOpen(false);
              if (password) setRevealedPassword({ name, password });
            }}
          />
        </Dialog>
      </div>

      <Card>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((s) => (
                <TableRow key={s.id} className={s.is_active ? "" : "opacity-60"}>
                  <TableCell className="font-medium">{s.full_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.email}</TableCell>
                  <TableCell>
                    <Badge variant={ROLE_BADGE[s.role]}>{ROLE_LABEL[s.role]}</Badge>
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => handleToggleActive(s)}
                      disabled={pending}
                      className={
                        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors " +
                        (s.is_active ? "bg-emerald-500" : "bg-muted-foreground/30")
                      }
                      aria-label={`Toggle ${s.full_name}`}
                    >
                      <span
                        className={
                          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform " +
                          (s.is_active ? "translate-x-[18px]" : "translate-x-0.5")
                        }
                      />
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title="Reset password"
                        onClick={() => handleResetPassword(s)}
                        disabled={pending}
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title="Edit"
                        onClick={() => setEditing(s)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {staff.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No staff accounts yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && (
          <EditStaffDialog
            key={editing.id}
            staff={editing}
            onDone={(msg) => {
              setEditing(null);
              setFeedback(msg);
            }}
          />
        )}
      </Dialog>

      {/* One-time password reveal */}
      <Dialog
        open={revealedPassword !== null}
        onOpenChange={(open) => !open && setRevealedPassword(null)}
      >
        {revealedPassword && (
          <PasswordRevealDialog
            name={revealedPassword.name}
            password={revealedPassword.password}
            onClose={() => setRevealedPassword(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function CreateStaffDialog({
  onDone,
}: {
  onDone: (password: string | undefined, name: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    const name = String(formData.get("full_name") ?? "");
    startTransition(async () => {
      const res = await createStaffAccount(formData);
      if (res.ok) onDone(res.password, name);
      else setError(res.error ?? "Could not create the account.");
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New staff account</DialogTitle>
        <DialogDescription>
          A temporary password is generated automatically — you&apos;ll see it once, right after
          creating the account.
        </DialogDescription>
      </DialogHeader>
      <form action={submit} className="grid gap-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="us-name">Full name</Label>
          <Input id="us-name" name="full_name" placeholder="e.g. Kamal Perera" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="us-email">Email</Label>
          <Input id="us-email" name="email" type="email" placeholder="e.g. kamal@rawanahotel.lk" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="us-role">Role</Label>
          <Select id="us-role" name="role" defaultValue="receptionist">
            {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            <Plus className="mr-2 h-4 w-4" />
            {pending ? "Creating…" : "Create account"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function EditStaffDialog({
  staff,
  onDone,
}: {
  staff: StaffWithEmail;
  onDone: (msg: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = await updateStaffAccount(staff.id, formData);
      if (res.ok) onDone(`${staff.full_name}'s account updated.`);
      else setError(res.error ?? "Could not save.");
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Edit — {staff.full_name}</DialogTitle>
        <DialogDescription>{staff.email}</DialogDescription>
      </DialogHeader>
      <form action={submit} className="grid gap-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-us-name">Full name</Label>
          <Input id="edit-us-name" name="full_name" defaultValue={staff.full_name} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-us-role">Role</Label>
          <Select id="edit-us-role" name="role" defaultValue={staff.role}>
            {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function PasswordRevealDialog({
  name,
  password,
  onClose,
}: {
  name: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-500" />
          Temporary password — {name}
        </DialogTitle>
        <DialogDescription>
          Shown once. Copy it now and share it with {name} — it won&apos;t be shown again.
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-3">
        <code className="flex-1 select-all font-mono text-base tracking-wide">{password}</code>
        <Button size="icon" variant="outline" onClick={copy} title="Copy">
          {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button onClick={onClose}>Done</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  );
}
