"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactElement, useTransition } from "react";

import { cn } from "../../lib/cn";
import { Button } from "../ui/button";

/** Re-runs the server render so readiness reflects decisions made in other tabs. */
export function RefreshButton(): ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button size="sm" onClick={() => startTransition(() => router.refresh())} disabled={pending}>
      <RefreshCw className={cn("size-3.5", pending && "animate-spin")} />
      {pending ? "Refreshing" : "Refresh"}
    </Button>
  );
}
