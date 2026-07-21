"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Pencil, Plus, Settings2, Trash2, UtensilsCrossed } from "lucide-react";
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
import { formatLKR } from "@/lib/utils";
import type { MenuCategoryRow } from "@/lib/types";
import type { MenuItemWithRecipeCount } from "./page";
import {
  createMenuCategory,
  createMenuItem,
  deleteMenuCategory,
  deleteMenuItem,
  renameMenuCategory,
  toggleMenuItemAvailability,
  updateMenuItem,
} from "./actions";

export function MenuManager({
  items,
  categories,
}: {
  items: MenuItemWithRecipeCount[];
  categories: MenuCategoryRow[];
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<MenuItemWithRecipeCount | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
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

  function handleDelete(item: MenuItemWithRecipeCount) {
    startTransition(async () => {
      const res = await deleteMenuItem(item.id);
      setFeedback(res.ok ? `${item.name} deleted.` : res.error ?? "Could not delete.");
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
          <Dialog open={categoriesOpen} onOpenChange={setCategoriesOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Settings2 className="mr-2 h-4 w-4" />
                Categories
              </Button>
            </DialogTrigger>
            <CategoriesDialog
              categories={categories}
              itemCountByCategory={Object.fromEntries(
                categories.map((c) => [
                  c.id,
                  items.filter((i) => i.category_id === c.id).length,
                ])
              )}
              onFeedback={setFeedback}
            />
          </Dialog>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={categories.length === 0}>
                <Plus className="mr-2 h-4 w-4" />
                New item
              </Button>
            </DialogTrigger>
            <MenuItemDialog
              mode="create"
              categories={categories}
              onDone={(msg) => {
                setAddOpen(false);
                setFeedback(msg);
              }}
            />
          </Dialog>
        </div>
      </div>

      {feedback && <p className="rounded-md bg-muted px-3 py-2 text-xs">{feedback}</p>}
      {categories.length === 0 && (
        <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No categories yet — add one under &ldquo;Categories&rdquo; before creating menu items.
        </p>
      )}

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
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id} className={item.is_available ? "" : "opacity-60"}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{item.menu_categories?.name ?? "—"}</Badge>
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
                      <a
                        href="/inventory/recipes"
                        className="text-sm text-amber-500 underline-offset-2 hover:underline"
                      >
                        No recipe — no stock deduction
                      </a>
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
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditing(item)}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={pending}
                        title="Delete — only possible if it was never ordered"
                        onClick={() => handleDelete(item)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
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
            categories={categories}
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
  categories,
  onDone,
}: {
  mode: "create" | "edit";
  item?: MenuItemWithRecipeCount;
  categories: MenuCategoryRow[];
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
            <Select
              id="menu-category"
              name="category_id"
              defaultValue={item?.category_id ?? categories[0]?.id}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
        <div className="space-y-1.5">
          <Label htmlFor="menu-other-cost">Other costs (LKR) — packaging, gas, etc.</Label>
          <Input
            id="menu-other-cost"
            name="other_cost"
            type="number"
            min="0"
            step="0.01"
            defaultValue={item ? Number(item.other_cost) : 0}
            placeholder="0.00"
          />
          <p className="text-xs text-muted-foreground">
            A flat amount added to this dish&apos;s food cost on the Recipe Costing page —
            doesn&apos;t touch inventory.
          </p>
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

function CategoriesDialog({
  categories,
  itemCountByCategory,
  onFeedback,
}: {
  categories: MenuCategoryRow[];
  itemCountByCategory: Record<string, number>;
  onFeedback: (msg: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newName, setNewName] = useState("");

  function addCategory() {
    if (!newName.trim()) return;
    const fd = new FormData();
    fd.set("name", newName.trim());
    startTransition(async () => {
      const res = await createMenuCategory(fd);
      if (res.ok) {
        setNewName("");
        onFeedback(`Category “${newName.trim()}” added.`);
      } else {
        setError(res.error ?? "Could not add the category.");
      }
    });
  }

  function saveRename(id: string) {
    if (!renameValue.trim()) return;
    const fd = new FormData();
    fd.set("name", renameValue.trim());
    startTransition(async () => {
      const res = await renameMenuCategory(id, fd);
      if (res.ok) {
        setRenamingId(null);
        onFeedback("Category renamed.");
      } else {
        setError(res.error ?? "Could not rename.");
      }
    });
  }

  function remove(c: MenuCategoryRow) {
    startTransition(async () => {
      const res = await deleteMenuCategory(c.id);
      onFeedback(res.ok ? `Category “${c.name}” deleted.` : res.error ?? "Could not delete.");
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Menu categories</DialogTitle>
        <DialogDescription>
          These group items on the Menu Items page and the POS terminal tabs.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2 py-2">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
            {renamingId === c.id ? (
              <>
                <Input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="h-8"
                />
                <Button size="sm" disabled={pending} onClick={() => saveRename(c.id)}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRenamingId(null)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  {itemCountByCategory[c.id] ?? 0} item(s)
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => {
                    setRenamingId(c.id);
                    setRenameValue(c.name);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  disabled={pending || (itemCountByCategory[c.id] ?? 0) > 0}
                  title={
                    (itemCountByCategory[c.id] ?? 0) > 0
                      ? "Move its items to another category first"
                      : "Delete category"
                  }
                  onClick={() => remove(c)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        ))}
        {categories.length === 0 && (
          <p className="text-sm text-muted-foreground">No categories yet.</p>
        )}

        <div className="flex items-center gap-2 pt-2">
          <Input
            placeholder="New category name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-8"
          />
          <Button size="sm" disabled={pending || !newName.trim()} onClick={addCategory}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Done</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  );
}
