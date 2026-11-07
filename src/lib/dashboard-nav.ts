import {
  FileText,
  History,
  Inbox,
  LayoutDashboard,
  LayoutTemplate,
  ListOrdered,
  Mail,
  ScrollText,
  Send,
  Settings,
  Shield,
  SquarePen,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

type DashboardFeature = "compose" | "drafts" | "campaigns" | "recipients" | "templates" | "history" | "roles" | "auditLog";

const NAV_PREFIX_MATCHES: Record<string, string> = {
  "/app/compose/": "/app/compose/",
  "/app/inbox/": "/app/inbox/",
  "/app/sent/": "/app/sent/",
  "/app/drafts/": "/app/drafts/",
  "/app/campaigns/": "/app/campaigns/",
  "/app/recipients/": "/app/recipients/",
  "/app/admin/users/": "/app/admin/users/",
  "/app/admin/roles/": "/app/admin/roles/",
  "/app/queue/": "/app/queue/",
};

export type DashboardNavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  permission?: string;
  feature?: DashboardFeature;
};

export type DashboardNavGroup = {
  label: string;
  items: DashboardNavItem[];
};

export const dashboardNavGroups: DashboardNavGroup[] = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", url: "/app/", icon: LayoutDashboard }],
  },
  {
    label: "Mail",
    items: [
      { title: "Compose", url: "/app/compose/", icon: SquarePen, feature: "compose" },
      { title: "Inbox", url: "/app/inbox/", icon: Inbox, permission: "mailbox.read" },
      { title: "Sent", url: "/app/sent/", icon: Send, permission: "mailbox.read" },
      { title: "Drafts", url: "/app/drafts/", icon: FileText, feature: "drafts" },
    ],
  },
  {
    label: "Campaigns",
    items: [
      { title: "Campaigns", url: "/app/campaigns/", icon: Mail, feature: "campaigns" },
      { title: "Recipients", url: "/app/recipients/", icon: Users, feature: "recipients" },
      { title: "Templates", url: "/app/templates/", icon: LayoutTemplate, feature: "templates" },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Queue", url: "/app/queue/", icon: ListOrdered },
      { title: "History", url: "/app/history/", icon: History, feature: "history" },
      { title: "Profile", url: "/app/settings/profile/", icon: UserRound },
      { title: "Security", url: "/app/settings/security/", icon: Shield },
      { title: "Mailbox", url: "/app/settings/", icon: Settings },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Users", url: "/app/admin/users/", icon: Users, permission: "users.read" },
      { title: "Roles", url: "/app/admin/roles/", icon: Shield, permission: "roles.read", feature: "roles" },
      { title: "Audit log", url: "/app/admin/audit/", icon: ScrollText, permission: "audit.read", feature: "auditLog" },
      { title: "Features", url: "/app/admin/features/", icon: Settings, permission: "roles.update" },
    ],
  },
];

export function visibleDashboardNavGroups(permissions: ReadonlySet<string>, features?: Record<string, boolean>): DashboardNavGroup[] {
  return dashboardNavGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        (!item.permission || permissions.has(item.permission)) &&
        (!item.feature || features?.[item.feature] !== false),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

export function normalizeAppPath(pathname: string) {
  if (pathname === "/") {
    return pathname;
  }
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

export function isDashboardNavItemActive(itemUrl: string, pathname: string) {
  const currentPath = normalizeAppPath(pathname);
  if (currentPath === itemUrl) {
    return true;
  }
  const prefix = NAV_PREFIX_MATCHES[itemUrl];
  return prefix ? currentPath.startsWith(prefix) : false;
}

export function findDashboardNavItem(pathname: string): DashboardNavItem | undefined {
  const currentPath = normalizeAppPath(pathname);
  for (const group of dashboardNavGroups) {
    const match = group.items.find((item) => isDashboardNavItemActive(item.url, currentPath));
    if (match) {
      return match;
    }
  }
  return undefined;
}
