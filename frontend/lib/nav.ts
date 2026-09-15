import {
  Activity,
  BarChart3,
  Building2,
  LayoutDashboard,
  Megaphone,
  Plug,
  Search,
  Settings,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * "soon" sections render a real page explaining what they'll do, and carry a
   * marker in the sidebar. Showing them as ordinary links that lead nowhere
   * would read as broken; hiding them entirely hides the roadmap.
   */
  status: "live" | "soon";
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, status: "live" },
  { href: "/dashboard/leads", label: "Leads", icon: Users, status: "live" },
  { href: "/dashboard/accounts", label: "Accounts", icon: Building2, status: "live" },
  { href: "/dashboard/research", label: "Research", icon: Search, status: "live" },
  { href: "/dashboard/pipeline", label: "Pipeline", icon: Workflow, status: "live" },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3, status: "live" },
  { href: "/dashboard/activity", label: "Activity", icon: Activity, status: "live" },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone, status: "soon" },
  { href: "/dashboard/integrations", label: "Integrations", icon: Plug, status: "soon" },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, status: "live" },
];

/** Exact match for the overview root, prefix match for its children. */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
