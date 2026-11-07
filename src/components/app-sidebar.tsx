import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ExternalLink } from "lucide-react";

import { APP_COMPANY, APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { visibleDashboardNavGroups } from "@/lib/dashboard-nav";
import { useAuthorization } from "@/lib/authorization";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const { permissions, features } = useAuthorization();

  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);
  const groups = visibleDashboardNavGroups(permissions, features);

  const mark = APP_NAME.charAt(0).toUpperCase();

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/app/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <span className="text-sm font-bold">{mark}</span>
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{APP_NAME}</span>
                  <span className="truncate text-xs">
                    {APP_TAGLINE} · {APP_COMPANY}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <NavMain
            key={group.label}
            label={group.label}
            items={group.items.map((item) => ({
              title: item.title,
              url: item.url,
              icon: item.icon,
            }))}
          />
        ))}
        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel>Public site</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Public site">
                <a href="/" target="_blank" rel="noreferrer">
                  <ExternalLink />
                  <span>Home</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
