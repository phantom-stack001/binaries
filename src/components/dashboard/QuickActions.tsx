import { Link } from "react-router-dom";
import { useAuthorization } from "@/lib/authorization";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function QuickActions() {
  const { features, can, loaded } = useAuthorization();
  const actions = [
    ...(features.compose && can("mailbox.send") ? [{ label: "Compose email", href: "/app/compose/" }] : []),
    ...(features.campaigns && can("campaigns.read") ? [{ label: "View campaigns", href: "/app/campaigns/" }] : []),
    ...(features.recipients && can("contacts.read") ? [{ label: "Manage recipients", href: "/app/recipients/" }] : []),
    ...(can("queue.read") ? [{ label: "View queue", href: "/app/queue/" }] : []),
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>Shortcuts to the work you can access.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:flex sm:flex-wrap">
        {!loaded ? <div className="text-sm text-muted-foreground">Loading your shortcuts…</div> : actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No shortcuts are available for your account.</p>
        ) : actions.map((action, index) => (
          <Button
            key={action.label}
            asChild
            variant={index === 0 ? "default" : "outline"}
            className="w-full sm:w-auto"
          >
            <Link to={action.href}>{action.label}</Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
