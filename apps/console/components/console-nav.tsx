"use client";

import Link from "next/link";
import type { ReactElement } from "react";

export function ConsoleNav(props: {
  current: "entities" | "intake" | "relationships" | "review" | "screening" | "truth";
}): ReactElement {
  return (
    <nav
      style={{
        display: "flex",
        gap: "0.6rem",
        marginTop: "0.9rem"
      }}
    >
      <ConsoleNavLink current={props.current === "intake"} href="/intake" label="Intake" />
      <ConsoleNavLink current={props.current === "screening"} href="/screening" label="Screening Workbench" />
      <ConsoleNavLink current={props.current === "review"} href="/review" label="Candidate Review" />
      <ConsoleNavLink current={props.current === "truth"} href="/truth" label="Accepted Truth" />
      <ConsoleNavLink current={props.current === "relationships"} href="/relationships" label="Relationships" />
      <ConsoleNavLink current={props.current === "entities"} href="/entities" label="Entity Reconciliation" />
    </nav>
  );
}

function ConsoleNavLink(props: { current: boolean; href: string; label: string }): ReactElement {
  return (
    <Link
      href={props.href}
      style={{
        background: props.current ? "rgba(196, 138, 74, 0.18)" : "rgba(255, 255, 255, 0.04)",
        border: props.current ? "1px solid rgba(196, 138, 74, 0.55)" : "1px solid var(--line)",
        borderRadius: 999,
        color: "var(--text)",
        padding: "0.55rem 0.9rem"
      }}
    >
      {props.label}
    </Link>
  );
}
