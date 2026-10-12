export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

/** "edited_and_accepted" -> "Edited and accepted" */
export function humanize(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const spaced = value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b(noi|irr|dscr|ltv|om|uw|ic)\b/gi, (word) => word.toUpperCase());
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatRelative(value: string | null | undefined, now = Date.now()): string {
  if (!value) {
    return "—";
  }
  const seconds = Math.round((now - new Date(value).getTime()) / 1000);
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return formatDateTime(value);
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Render any candidate value compactly for tables. */
export function formatCandidateValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const record = value as Record<string, unknown>;
  if (typeof record.display === "string") {
    return record.display;
  }
  if (typeof record.amountUsd === "number") {
    return `$${record.amountUsd.toLocaleString("en-US")}`;
  }
  if (typeof record.assetName === "string") {
    const organization = record.organizationName ?? record.organizationDomain;
    return organization ? `${record.assetName} ↔ ${organization}` : record.assetName;
  }
  return JSON.stringify(value);
}
