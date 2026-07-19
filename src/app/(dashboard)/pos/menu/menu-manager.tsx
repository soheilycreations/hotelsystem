"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Pencil, Plus, UtensilsCrossed } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatLKR } from "@/lib/utils";
import type { MenuCategory } from "@/lib/types";
import type { MenuItemWithRecipeCount } from "./page";
import { createMenuItem, toggleMenuItemAvailability, updateMenuItem } from "./actions";

const CATEGORY_LABEL: Record<MenuCategory, string> = {
  appetizers: "Appetizers",
  mains: "Mains",
  drinks: "Drinks",
  desserts: "Desserts",
};

export function MenuManager({ items }: { items: MenuItemWithRecipeCount[] }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<MenuItemWithRecipeCount | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, query]);

  const missingRecipes = useMemo(
    () => items.filter((i) => i.menu_recipe_ingredients.length === 0).length,
    [items]
  );

  function handleToggle(item: MenuItemWithRecipeCount) {
    startTransition(async () => {
      const res = await toggleMenuItemAvailability(item.id, !item.is_available);
      setFeedback(
        res.ok
          ? `${item.name} is now ${item.is_available ? "hidden from" : "visible on"} the POS.`
          : res.error ?? "Could not update availability."
      );
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search menu…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <div className="ml-auto flex items-center gap-3">
          {missingRecipes > 0 && (
            <Badge variant="warning">
              <AlertTriangle className="mr-1 h-3 w-3" />
              {missingRecipes} without a recipe
            </Badge>
          )}
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                New item
              </Button>
            </DialogTrigger>
            <MenuItemDialog
              mode="create"
              onDone={(msg) => {
                setAddOpen(false);
                setFeedback(msg);
              }}
            />
          </Dialog>
        </div>
      </div>

      {feedback && <p className="rounded-md bg-muted px-3 py-2 text-xs">{feedback}</p>}

      <Card>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Recipe</TableHead>
                <TableHead>On POS</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id} className={item.is_available ? "" : "opacity-60"}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{CATEGORY_LABEL[item.category]}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatLKR(Number(item.selling_price))}
                  </TableCell>
                  <TableCell>
                    {item.menu_recipe_ingredients.length > 0 ? (
                      <span className="text-sm text-muted-foreground">
                        {item.menu_recipe_ingredients.length} ingredients
                      </span>
                    ) : (
                      <Link
                        href="/inventory/recipes"
                        className="text-sm text-amber-500 underline-offset-2 hover:underline"
                      >
                        No recipe — no stock deduction
                      </Link>
                    )}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => handleToggle(item)}
                      disabled={pending}
                      className={
                        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors " +
                        (item.is_available ? "bg-emerald-500" : "bg-muted-foreground/30")
                      }
                      aria-label={`Toggle ${item.name}`}
                    >
                      <span
                        className={
                          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform " +
                          (item.is_available ? "translate-x-[18px]" : "translate-x-0.5")
                        }
                      />
                    </button>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => setEditing(item)}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    <UtensilsCrossed className="mx-auto mb-2 h-6 w-6" />
                    No menu items match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && (
          <MenuItemDialog
            key={editing.id}
            mode="edit"
            item={editing}
            onDone={(msg) => {
              setEditing(null);
              setFeedback(msg);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function MenuItemDialog({
  mode,
  item,
  onDone,
}: {
  mode: "create" | "edit";
  item?: MenuItemWithRecipeCount;
  onDone: (msg: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createMenuItem(formData)
          : await updateMenuItem(item?.id ?? "", formData);
      if (res.ok) {
        onDone(mode === "create" ? "Menu item added — set its recipe next." : "Menu item updated.");
      } else {
        setError(res.error ?? "Could not save the item.");
      }
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{mode === "create" ? "New menu item" : `Edit — ${item?.name}`}</DialogTitle>
        <DialogDescription>
          {mode === "create"
            ? "New items go live immediately. Add a recipe afterwards so stock deducts on sale."
            : "Price changes only affect items added to bills from now on — existing bill lines keep their price."}
        </DialogDescription>
      </DialogHeader>
      <form action={submit} className="grid gap-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="menu-name">Name</Label>
          <Input
            id="menu-name"
            name="name"
            defaultValue={item?.name}
            placeholder="e.g. Kottu Roti — Chicken"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="menu-category">Category</Label>
            <Select id="menu-category" name="category" defaultValue={item?.category ?? "mains"}>
              {(Object.keys(CATEGORY_LABEL) as MenuCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="menu-price">Selling price (LKR)</Label>
            <Input
              id="menu-price"
              name="selling_price"
              type="number"
              min="0"
              step="0.01"
              defaultValue={item ? Number(item.selling_price) : undefined}
              placeholder="0.00"
              required
            />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : mode === "create" ? "Add item" : "Save changes"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
