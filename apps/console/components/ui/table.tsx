import type { HTMLAttributes, ReactElement, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

/** Tables scroll horizontally inside their card on narrow screens instead of breaking the page. */
export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>): ReactElement {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>): ReactElement {
  return (
    <th
      className={cn(
        "h-9 border-b border-border px-3 text-left text-[11px] font-medium uppercase tracking-wide whitespace-nowrap text-muted first:pl-4 last:pr-4",
        className
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>): ReactElement {
  return (
    <td
      className={cn("border-b border-border px-3 py-2.5 align-middle text-fg first:pl-4 last:pr-4", className)}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>): ReactElement {
  return <tr className={cn("transition-colors last:[&>td]:border-0 hover:bg-surface", className)} {...props} />;
}
