"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactElement, type ReactNode, useState } from "react";

import { cn } from "../../lib/cn";
import { NAV_SECTIONS } from "./nav-items";
import { ThemeToggle } from "./theme";

function Logo(): ReactElement {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
        <rect width="24" height="24" rx="6" className="fill-accent" />
        <path
          d="M7 17V7h5.2a3.2 3.2 0 0 1 0 6.4H7m5 0 5 3.6"
          className="stroke-accent-fg"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-sm font-semibold tracking-tight text-fg">REMI</span>
      <span className="rounded border border-border px-1 text-[10px] font-medium text-faint">intake</span>
    </Link>
  );
}

function Navigation({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }): ReactElement {
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {NAV_SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">{section.title}</p>
          <ul className="space-y-0.5">
            {section.items.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    className={cn(
                      "flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors",
                      active ? "bg-subtle font-medium text-fg" : "text-muted hover:bg-subtle/60 hover:text-fg"
                    )}
                  >
                    <Icon className={cn("size-4", active ? "text-accent" : "text-faint")} strokeWidth={1.75} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }): ReactElement {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const sidebar = (
    <>
      <div className="flex h-14 items-center border-b border-border px-3">
        <Logo />
      </div>
      <Navigation pathname={pathname} onNavigate={() => setOpen(false)} />
      <div className="space-y-3 border-t border-border p-3">
        <ThemeToggle />
        <p className="px-1 text-[11px] leading-relaxed text-faint">Synthetic demo data. Single operator, stub auth.</p>
      </div>
    </>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface lg:flex">{sidebar}</aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/85 px-4 backdrop-blur lg:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="grid size-9 place-items-center rounded-md text-muted hover:bg-subtle hover:text-fg"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </button>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-surface shadow-xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 grid size-8 place-items-center rounded-md text-muted hover:bg-subtle"
              aria-label="Close navigation"
            >
              <X className="size-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      ) : null}

      <main className="min-w-0">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
