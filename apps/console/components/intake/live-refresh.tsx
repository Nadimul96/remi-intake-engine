"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactElement, useEffect, useTransition } from "react";

import { Button } from "../ui/button";

/**
 * Re-renders the server page on an interval, but only while something is still in the pipeline.
 * When everything has settled it falls back to a manual refresh button.
 */
export function LiveRefresh({ inFlight, intervalMs = 3000 }: { inFlight: number; intervalMs?: number }): ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = inFlight > 0;

  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = window.setInterval(() => router.refresh(), intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs, router]);

  if (active) {
    return (
      <span className="inline-flex h-7 items-center gap-2 rounded-md bg-info-soft px-2.5 text-xs font-medium text-info-text">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-info-text opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-info-text" />
        </span>
        {inFlight} processing · live
      </span>
    );
  }

  return (
    <Button size="sm" onClick={() => startTransition(() => router.refresh())} disabled={pending}>
      <RefreshCw className={pending ? "size-3.5 animate-spin" : "size-3.5"} />
      Refresh
    </Button>
  );
}
