"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { type ReactElement, useEffect, useState } from "react";

import { cn } from "../../lib/cn";

type Theme = "light" | "dark" | "system";
const STORAGE_KEY = "remi-theme";

/**
 * The tokens in globals.css follow the system color scheme by default (CSS light-dark()),
 * so no blocking script is needed; an explicit choice adds a `light` or `dark` class.
 */
function apply(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark", theme === "dark");
}

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor }
];

export function ThemeToggle(): ReactElement {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    let saved: Theme = "system";
    try {
      saved = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
    } catch {
      // Storage can be unavailable (private mode); fall back to the system scheme.
    }
    setTheme(saved);
    apply(saved);
  }, []);

  const choose = (value: Theme): void => {
    setTheme(value);
    apply(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // The choice still applies for this visit.
    }
  };

  return (
    <fieldset className="flex rounded-lg border border-border bg-surface p-0.5">
      <legend className="sr-only">Theme</legend>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          aria-label={label}
          title={label}
          onClick={() => choose(value)}
          className={cn(
            "grid h-6 flex-1 place-items-center rounded-md transition-colors",
            theme === value ? "bg-raised text-fg shadow-card ring-1 ring-border" : "text-faint hover:text-fg"
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </fieldset>
  );
}
