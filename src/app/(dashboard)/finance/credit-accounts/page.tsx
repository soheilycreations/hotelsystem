import { createClient } from "@/lib/supabase/server";
import type { CreditAccount } from "@/lib/types";
import { LiveRefresher } from "../../live-refresher";
import { CreditAccountsView } from "./credit-accounts-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Credit Accounts" };

export interface CreditAccountWithBalance extends CreditAccount {
  balance: number;
  lastActivity: string | null;
}

export default async function CreditAccountsPage() {
  const supabase = await createClient();

  const [{ data: accounts }, { data: bookings }, { data: orders }, { data: repayments }] =
    await Promise.all([
      supabase.from("credit_accounts").select("*").order("name"),
      supabase
        .from("bookings")
        .select("credit_account_id, total_folio_amount, actual_check_out")
        .eq("payment_method", "credit")
        .not("credit_account_id", "is", null),
      supabase
        .from("restaurant_orders")
        .select("credit_account_id, total_amount, business_date")
        .eq("payment_method", "credit")
        .not("credit_account_id", "is", null),
      supabase
        .from("credit_repayments")
        .select("credit_account_id, amount, date")
        .order("date", { ascending: false }),
    ]);

  const owedByAccount = new Map<string, number>();
  const lastActivityByAccount = new Map<string, string>();

  const bump = (id: string | null, delta: number, when: string | null) => {
    if (!id) return;
    owedByAccount.set(id, (owedByAccount.get(id) ?? 0) + delta);
    if (when) {
      const prev = lastActivityByAccount.get(id);
      if (!prev || when > prev) lastActivityByAccount.set(id, when);
    }
  };

  for (const b of bookings ?? []) {
    bump(b.credit_account_id, Number(b.total_folio_amount), b.actual_check_out?.slice(0, 10) ?? null);
  }
  for (const o of orders ?? []) {
    bump(o.credit_account_id, Number(o.total_amount), o.business_date);
  }
  for (const r of repayments ?? []) {
    bump(r.credit_account_id, -Number(r.amount), r.date);
  }

  const accountsWithBalance: CreditAccountWithBalance[] = ((accounts as CreditAccount[] | null) ?? []).map(
    (a) => ({
      ...a,
      balance: owedByAccount.get(a.id) ?? 0,
      lastActivity: lastActivityByAccount.get(a.id) ?? null,
    })
  );

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["credit_accounts", "credit_repayments", "restaurant_orders", "bookings"]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Credit Accounts</h1>
        <p className="text-sm text-muted-foreground">
          Bills and bookings settled "on credit" against a named account — track what each one
          owes, and record repayments as they come in.
        </p>
      </div>
      <CreditAccountsView accounts={accountsWithBalance} />
    </div>
  );
}
