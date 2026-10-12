import {
  Building2,
  GitCompareArrows,
  Inbox,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  Network,
  ScanSearch,
  ShieldCheck
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Workspace",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/conflicts", label: "Conflicts", icon: GitCompareArrows },
      { href: "/intake", label: "Intake", icon: Inbox },
      { href: "/review", label: "Review", icon: ListChecks }
    ]
  },
  {
    title: "Knowledge",
    items: [
      { href: "/truth", label: "Accepted truth", icon: ShieldCheck },
      { href: "/entities", label: "Entities", icon: Building2 },
      { href: "/relationships", label: "Relationships", icon: Network },
      { href: "/screening", label: "Screening", icon: ScanSearch }
    ]
  }
];
