import { BedDouble, Scale, UtensilsCrossed } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatLKR } from "@/lib/utils";

function DivisionCard({
  title,
  icon: Icon,
  revenue,
  expenses,
  balance,
  hint,
}: {
  title: string;
  icon: typeof BedDouble;
  revenue: number;
  expenses: number;
  balance: number;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Revenue</span>
          <span className="tabular-nums">{formatLKR(revenue)}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-red-500">
          <span>Expenses</span>
          <span className="tabular-nums">−{formatLKR(expenses)}</span>
        </div>
        <div className="flex items-center justify-between border-t pt-2 text-base font-bold">
          <span>Balance</span>
          <span className={`tabular-nums ${balance >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {formatLKR(balance)}
          </span>
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/** The whole answer to "how are we doing" — Room, Restaurant, and Overall,
 * each as Revenue / Expenses / Balance. Everything else on the report page
 * (daily trend, channel mix, expense breakdown) is optional detail. */
export function DivisionalPnl({
  roomRevenue,
  roomExpenses,
  roomBalance,
  restaurantRevenue,
  restaurantExpenses,
  restaurantBalance,
  ownerFundedTotal,
}: {
  roomRevenue: number;
  roomExpenses: number;
  roomBalance: number;
  restaurantRevenue: number;
  restaurantExpenses: number;
  restaurantBalance: number;
  ownerFundedTotal: number;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Room vs Restaurant</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <DivisionCard title="Room" icon={BedDouble} revenue={roomRevenue} expenses={roomExpenses} balance={roomBalance} />
        <DivisionCard
          title="Restaurant"
          icon={UtensilsCrossed}
          revenue={restaurantRevenue}
          expenses={restaurantExpenses}
          balance={restaurantBalance}
        />
        <DivisionCard
          title="Overall"
          icon={Scale}
          revenue={roomRevenue + restaurantRevenue}
          expenses={roomExpenses + restaurantExpenses}
          balance={roomBalance + restaurantBalance}
          hint={ownerFundedTotal > 0 ? `+${formatLKR(ownerFundedTotal)} owner-funded, excluded` : undefined}
        />
      </div>
    </div>
  );
}
