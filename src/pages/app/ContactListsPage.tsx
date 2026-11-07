import { Link } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { RecipientsNav } from "@/components/recipients/RecipientsNav";
import { PageMeta } from "@/components/layout/PageMeta";
import { AppPageContainer } from "@/components/shared/AppPageContainer";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuthorization } from "@/lib/authorization";
import {
  createContactList,
  deleteContactList,
  fetchContactLists,
  updateContactList,
  type ContactList,
} from "@/lib/recipients-api";

export function ContactListsPage() {
  const { can, allowListCreation } = useAuthorization();
  const [lists, setLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isTestList, setIsTestList] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ContactList | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    fetchContactLists()
      .then((res) => {
        if (!cancelled) {
          setLists(res.lists);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  return (
    <>
      <PageMeta title="Contact lists | Binaries.nl" description="Contact lists." canonicalPath="/app/recipients/lists/" />
      <AppPageContainer>
        <PageHeader
          title="Contact lists"
          description="Organize contacts into reusable lists."
          actions={can("lists.create") && allowListCreation ? <Button onClick={() => setDialogOpen(true)}><Plus /> Create list</Button> : null}
        />
        <RecipientsNav />
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : lists.length === 0 ? (
          <EmptyState title="No lists yet" description="Create a list to group contacts for future campaigns." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {lists.map((list) => (
              <Card key={list.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      <Link to={`/app/recipients/lists/${list.id}/`} className="hover:text-primary hover:underline">
                        {list.name}
                      </Link>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{list.memberCount} contacts</p>
                    {list.isTestList ? <Badge variant="outline">Test list</Badge> : null}
                    {!list.canManage ? <Badge variant="secondary">View only</Badge> : null}
                  </div>
                  {list.canManage ? <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void updateContactList(list.id, { isTestList: !list.isTestList }).then(() => load())}
                    >
                      {list.isTestList ? "Unmark test list" : "Mark as test list"}
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setPendingDelete(list)} aria-label="Delete list">
                    <Trash2 />
                  </Button>
                  </div> : null}
                </CardHeader>
                {list.description ? (
                  <CardContent className="pt-0 text-sm text-muted-foreground">{list.description}</CardContent>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </AppPageContainer>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create list</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={isTestList}
                onChange={(event) => setIsTestList(event.target.checked)}
              />
              <span>Test list. Settings → Test Message can send a separate email to each eligible member.</span>
            </label>
          </div>
          <DialogFooter>
            <Button onClick={() => void createContactList({ name, description, isTestList }).then(() => { setDialogOpen(false); setName(""); setDescription(""); setIsTestList(false); void load(); })}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete list?</AlertDialogTitle>
            <AlertDialogDescription>
              Contacts in this list will not be deleted. Only list membership is removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => pendingDelete && void deleteContactList(pendingDelete.id).then(() => { setPendingDelete(null); void load(); })}>
              Delete list
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
