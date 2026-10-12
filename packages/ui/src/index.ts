export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function statusTone(status: string): string {
  switch (status) {
    case "completed":
    case "accepted":
    case "edited_and_accepted":
      return "tone-success";
    case "processing":
    case "running":
    case "completed_with_warnings":
      return "tone-active";
    case "queued":
    case "registered":
    case "staged":
    case "pending_review":
    case "deferred":
    case "skipped":
      return "tone-muted";
    case "failed":
    case "rejected":
      return "tone-danger";
    default:
      return "tone-muted";
  }
}
