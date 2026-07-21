"use client";

import { useMemo, useState, useTransition } from "react";
import { ChefHat, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatLKR } from "@/lib/utils";
import type { InventoryItem, MenuCategoryRow } from "@/lib/types";
import type { MenuItemWithRecipe } from "./page";
import { addRecipeIngredient, removeRecipeIngredient, updateOtherCost } from "../actions";

function ingredientCost(item: MenuItemWithRecipe): number {
  return item.menu_recipe_ingredients.reduce(
    (sum, ing) => sum + Number(ing.quantity_needed) * Number(ing.inventory_items?.unit_cost ?? 0),
    0
  );
}

function totalCost(item: MenuItemWithRecipe): number {
  return ingredientCost(item) + Number(item.other_cost ?? 0);
}

export function RecipeManager({
  menuItems,
  inventory,
  categories,
}: {
  menuItems: MenuItemWithRecipe[];
  inventory: InventoryItem[];
  categories: MenuCategoryRow[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(menuItems[0]?.id ?? null);
  const selected = useMemo(
    () => menuItems.find((m) => m.id === selectedId) ?? menuItems[0] ?? null,
    [menuItems, selectedId]
  );

  if (menuItems.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <ChefHat className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No menu items yet</p>
          <p className="text-sm text-muted-foreground">
            Seed the menu via the SQL script, then define recipes here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* Menu list with margins */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Menu costing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 px-3 pb-3">
          {categories.map((cat) => {
            const group = menuItems.filter((m) => m.category_id === cat.id);
            if (group.length === 0) return null;
            return (
              <div key={cat.id} className="pb-2">
                <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {cat.name}
                </p>
                {group.map((item) => {
                  const cost = totalCost(item);
                  const price = Number(item.selling_price);
                  const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
                  const active = selected?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={
                        "flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors " +
                        (active ? "bg-muted" : "hover:bg-muted/50")
                      }
                    >
                      <span className="font-medium">{item.name}</span>
                      <span
                        className={
                          "tabular-nums text-xs " +
                          (margin >= 60
                            ? "text-emerald-500"
                            : margin >= 30
                            ? "text-amber-500"
                            : "text-red-500")
                        }
                      >
                        {margin.toFixed(0)}%
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Recipe editor */}
      {selected && <RecipeEditor key={selected.id} item={selected} inventory={inventory} />}
    </div>
  );
}

function RecipeEditor({
  item,
  inventory,
}: {
  item: MenuItemWithRecipe;
  inventory: InventoryItem[];
}) {
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [otherCost, setOtherCost] = useState(String(item.other_cost ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [otherCostSaved, setOtherCostSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const ingCost = ingredientCost(item);
  const cost = ingCost + Number(otherCost || 0);
  const price = Number(item.selling_price);
  const profit = price - cost;
  const margin = price > 0 ? (profit / price) * 100 : 0;
  const healthy = margin >= 30;

  const available = inventory.filter(
    (inv) => !item.menu_recipe_ingredients.some((r) => r.inventory_item_id === inv.id)
  );
  const selectedIngredient = inventory.find((i) => i.id === ingredientId);

  function handleAdd() {
    const qty = Number(quantity);
    if (!ingredientId) {
      setError("Pick an ingredient first.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Quantity must be greater than zero.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await addRecipeIngredient(item.id, ingredientId, qty);
      if (res.ok) {
        setIngredientId("");
        setQuantity("");
      } else {
        setError(res.error ?? "Could not add the ingredient.");
      }
    });
  }

  function handleRemove(recipeId: string) {
    startTransition(async () => {
      await removeRecipeIngredient(recipeId);
    });
  }

  function saveOtherCost() {
    const value = Number(otherCost);
    if (!Number.isFinite(value) || value < 0) {
      setError("Other costs can't be negative.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateOtherCost(item.id, value);
      if (res.ok) {
        setOtherCostSaved(true);
        setTimeout(() => setOtherCostSaved(false), 2000);
      } else {
        setError(res.error ?? "Could not save.");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{item.name}</CardTitle>
            <p className="text-sm text-muted-foreground">{item.menu_categories?.name}</p>
          </div>
          <Badge variant={healthy ? "success" : "warning"}>
            {healthy ? (
              <TrendingUp className="mr-1 h-3 w-3" />
            ) : (
              <TrendingDown className="mr-1 h-3 w-3" />
            )}
            {margin.toFixed(1)}% margin
          </Badge>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Selling price</p>
            <p className="font-semibold tabular-nums">{formatLKR(price)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Food cost</p>
            <p className="font-semibold tabular-nums">{formatLKR(cost)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Profit / plate</p>
            <p
              className={
                "font-semibold tabular-nums " + (profit >= 0 ? "text-emerald-500" : "text-red-500")
              }
            >
              {formatLKR(profit)}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {item.menu_recipe_ingredients.map((ing) => {
            const inv = ing.inventory_items;
            const lineCost = Number(ing.quantity_needed) * Number(inv?.unit_cost ?? 0);
            return (
              <div
                key={ing.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{inv?.name ?? "Unknown ingredient"}</p>
                  <p className="text-xs text-muted-foreground">
                    {Number(ing.quantity_needed).toLocaleString()} {inv?.unit} ×{" "}
                    {formatLKR(Number(inv?.unit_cost ?? 0))}/{inv?.unit}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums">{formatLKR(lineCost)}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleRemove(ing.id)}
                    disabled={pending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
          {item.menu_recipe_ingredients.length === 0 && (
            <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              No ingredients yet — orders for this dish won&apos;t deduct any stock.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          <span>Ingredients subtotal</span>
          <span className="tabular-nums">{formatLKR(ingCost)}</span>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="mb-2 text-sm font-medium">Other costs — packaging, gas, misc.</p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={otherCost}
              onChange={(e) => setOtherCost(e.target.value)}
              className="max-w-[160px]"
            />
            <Button size="sm" variant="outline" onClick={saveOtherCost} disabled={pending}>
              Save
            </Button>
            {otherCostSaved && (
              <span className="text-xs text-emerald-500">Saved ✓</span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            A flat amount added on top of the ingredients subtotal — doesn&apos;t touch inventory
            stock. Use it for packaging, gas, or anything not worth tracking as a line ingredient.
          </p>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="mb-3 text-sm font-medium">Add ingredient</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
            <div className="space-y-1.5">
              <Label>Ingredient</Label>
              <Select value={ingredientId} onChange={(e) => setIngredientId(e.target.value)}>
                <option value="">Select…</option>
                {available.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.name} ({inv.unit})
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                Qty{selectedIngredient ? ` (${selectedIngredient.unit})` : ""}
              </Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleAdd} disabled={pending}>
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
          </div>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
