"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setBackfillEnabled } from "./actions";

/** Admin on/off switch for Backfill (backdated sales). */
export function BackfillSwitch({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
      <div className="flex-1 text-sm">
        <p className="font-medium">Backfill is {enabled ? "ON" : "OFF"}</p>
        <p className="text-muted-foreground">
          {enabled
            ? "Backdated sales and stays can be entered. Switch it off again when you are done."
            : "Backdated sales and stays are blocked. The system went live fresh — keep this off unless you are correcting old records."}
        </p>
        {error ? <p className="mt-1 text-destructive">{error}</p> : null}
      </div>
      <Button
        variant={enabled ? "default" : "outline"}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await setBackfillEnabled(!enabled);
            setError(res.ok ? null : res.error ?? "Could not change the setting.");
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : null}
        {enabled ? "Switch off" : "Switch on"}
      </Button>
    </div>
  );
}
