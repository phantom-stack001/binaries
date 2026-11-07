import { Plus, Upload, ListPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { ContactDialog } from "@/components/recipients/ContactDialog";
import { ContactStats } from "@/components/recipients/ContactStats";
import { ContactsTable } from "@/components/recipients/ContactsTable";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthorization } from "@/lib/authorization";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addContactsToList,
  bulkDeleteContacts,
  bulkUnsubscribeContacts,
  createContact,
  createContactList,
  deleteContact,
  fetchContactLists,
  fetchContactStats,
  fetchContacts,
  RecipientsApiError,
  type Contact,
  type ContactInput,
  type ContactList,
  unsubscribeContact,
  updateContact,
} from "@/lib/recipients-api";

export function RecipientsPage() {
  const { can, allowListCreation } = useAuthorization();
  const [stats, setStats] = useState<Awaited<ReturnType<typeof fetchContactStats>>["stats"] | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"subscribed" | "unsubscribed" | "">("");
  const [listId, setListId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null);
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [addToListOpen, setAddToListOpen] = useState(false);
  const [targetListId, setTargetListId] = useState("");
  const [addToListContactIds, setAddToListContactIds] = useState<string[]>([]);
  const [addToListError, setAddToListError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    return Promise.all([
      fetchContactStats("all"),
      fetchContacts({
        page,
        limit: 25,
        q: q.trim() || undefined,
        status: status || undefined,
        listId: listId || undefined,
        scope: "all",
      }),
      fetchContactLists(),
    ]).then(([statsRes, contactsRes, listsRes]) => {
      setStats(statsRes.stats);
      setContacts(contactsRes.contacts);
      setTotalPages(contactsRes.pagination.totalPages);
      setLists(listsRes.lists);
      setError(null);
    });
  }, [page, q, status, listId]);

  const reload = useCallback(() => {
    setFetchKey((key) => key + 1);
    setLoading(true);
    fetchData()
      .catch((err) => {
        setError(err instanceof RecipientsApiError ? err.message : "Failed to load contacts");
      })
      .finally(() => setLoading(false));
  }, [fetchData]);

  useEffect(() => {
    let cancelled = false;
    fetchData()
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof RecipientsApiError ? err.message : "Failed to load contacts");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchData, fetchKey]);

  const allSelected = useMemo(
    () => {
      const manageable = contacts.filter((contact) => contact.canManage);
      return manageable.length > 0 && manageable.every((contact) => selectedIds.has(contact.id));
    },
    [contacts, selectedIds],
  );

  const handleSave = async (input: ContactInput) => {
    if (editing) {
      await updateContact(editing.id, input);
    } else {
      await createContact(input);
    }
    reload();
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await deleteContact(pendingDelete.id);
    setPendingDelete(null);
    reload();
  };

  const handleCreateList = async () => {
    await createContactList({ name: newListName });
    setListDialogOpen(false);
    setNewListName("");
    reload();
  };

  const openAddToListDialog = (contactIds: string[]) => {
    if (contactIds.length === 0) return;
    setAddToListContactIds(contactIds);
    setTargetListId("");
    setAddToListError(null);
    setAddToListOpen(true);
  };

  const handleBulkAddToList = async () => {
    if (!targetListId || addToListContactIds.length === 0) return;
    setAddToListError(null);
    try {
      await addContactsToList(targetListId, addToListContactIds);
      setAddToListOpen(false);
      setAddToListContactIds([]);
      setSelectedIds(new Set());
      reload();
    } catch (err) {
      setAddToListError(err instanceof RecipientsApiError ? err.message : "Could not add to list");
    }
  };

  return (
    <>
      <PageMeta title="Recipients | Binaries.nl" description="Manage contacts and lists." canonicalPath="/app/recipients/" />
      <AppPageContainer>
        <PageHeader
          title="Recipients"
          description="Manage your contacts and recipient lists."
          actions={
            <>
              <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus /> Add contact
              </Button>
              <Button variant="outline" asChild>
                <Link to="/app/recipients/import/"><Upload /> Import CSV</Link>
              </Button>
              {can("lists.create") && allowListCreation ? <Button variant="outline" onClick={() => setListDialogOpen(true)}>
                <ListPlus /> Create list
              </Button> : null}
            </>
          }
        />

        <RecipientsNav />
        <ContactStats stats={stats} loading={loading && !stats} />

        <Card>
          <CardContent className="space-y-4 py-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="contact-search">Search</Label>
                <Input
                  id="contact-search"
                  value={q}
                  onChange={(e) => { setPage(1); setLoading(true); setQ(e.target.value); }}
                  placeholder="Email, name, or company"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status-filter">Status</Label>
                <select
                  id="status-filter"
                  className="flex h-9 w-full min-w-[10rem] rounded-md border border-input bg-transparent px-3 text-sm"
                  value={status}
                  onChange={(e) => {
                    setPage(1);
                    setLoading(true);
                    setStatus(e.target.value as "subscribed" | "unsubscribed" | "");
                  }}
                >
                  <option value="">All</option>
                  <option value="subscribed">Subscribed</option>
                  <option value="unsubscribed">Unsubscribed</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="list-filter">List</Label>
                <select
                  id="list-filter"
                  className="flex h-9 w-full min-w-[10rem] rounded-md border border-input bg-transparent px-3 text-sm"
                  value={listId}
                  onChange={(e) => { setPage(1); setLoading(true); setListId(e.target.value); }}
                >
                  <option value="">All lists</option>
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>{list.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {selectedIds.size > 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                <span>{selectedIds.size} selected</span>
                <Button size="sm" variant="outline" onClick={() => openAddToListDialog(Array.from(selectedIds))}>
                  Add to list
                </Button>
                {contacts.some((c) => selectedIds.has(c.id) && c.canManage) ? <Button size="sm" variant="outline" onClick={() => void bulkUnsubscribeContacts(Array.from(selectedIds)).then(reload)}>
                  Unsubscribe
                </Button> : null}
                {contacts.some((c) => selectedIds.has(c.id) && c.canManage) ? <Button size="sm" variant="destructive" onClick={() => void bulkDeleteContacts(Array.from(selectedIds)).then(reload)}>
                  Delete
                </Button> : null}
              </div>
            ) : null}

            {loading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : contacts.length === 0 ? (
              <EmptyState title="No contacts yet" description="Add a contact or import a CSV to get started." />
            ) : (
              <ContactsTable
                contacts={contacts}
                selectedIds={selectedIds}
                selectable={(contact) => contact.canManage}
                onToggleSelect={(id) => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  });
                }}
                onToggleSelectAll={() => {
                  if (allSelected) setSelectedIds(new Set());
                  else setSelectedIds(new Set(contacts.filter((c) => c.canManage).map((c) => c.id)));
                }}
                allSelected={allSelected}
                onEdit={(contact) => { setEditing(contact); setDialogOpen(true); }}
                onDelete={setPendingDelete}
                onUnsubscribe={(contact) => void unsubscribeContact(contact.id).then(reload)}
                onAddToList={(contact) => openAddToListDialog([contact.id])}
              />
            )}

            {totalPages > 1 ? (
              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { setLoading(true); setPage((p) => p - 1); }}>Previous</Button>
                <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { setLoading(true); setPage((p) => p + 1); }}>Next</Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </AppPageContainer>

      <ContactDialog open={dialogOpen} onOpenChange={setDialogOpen} contact={editing} onSave={handleSave} />

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This contact will be removed from your contact database. Suppression records for compliance are retained separately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmDelete()}>Delete contact</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={listDialogOpen} onOpenChange={setListDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create list</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-list-name">List name</Label>
            <Input id="new-list-name" value={newListName} onChange={(e) => setNewListName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={() => void handleCreateList()} disabled={!newListName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addToListOpen}
        onOpenChange={(open) => {
          setAddToListOpen(open);
          if (!open) {
            setAddToListContactIds([]);
            setAddToListError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to list</DialogTitle>
            <DialogDescription>
              {addToListContactIds.length === 1
                ? "Choose a list for this contact."
                : `Choose a list for ${addToListContactIds.length} contacts.`}
            </DialogDescription>
          </DialogHeader>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={targetListId}
            onChange={(e) => setTargetListId(e.target.value)}
            aria-label="Select list"
          >
            <option value="">Select a list</option>
            {lists.filter((list) => list.canAddContacts).map((list) => (
              <option key={list.id} value={list.id}>{list.name}</option>
            ))}
          </select>
          {addToListError ? <p className="text-sm text-destructive">{addToListError}</p> : null}
          <DialogFooter>
            <Button
              onClick={() => void handleBulkAddToList()}
              disabled={!targetListId || addToListContactIds.length === 0}
            >
              Add to list
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
