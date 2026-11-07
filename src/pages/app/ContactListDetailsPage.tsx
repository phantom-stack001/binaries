import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ContactsTable } from "@/components/recipients/ContactsTable";
import { RecipientsNav } from "@/components/recipients/RecipientsNav";
import { PageMeta } from "@/components/layout/PageMeta";
import { AppPageContainer } from "@/components/shared/AppPageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  addContactsToList,
  fetchContacts,
  fetchListDetail,
  RecipientsApiError,
  removeContactsFromList,
  updateContactList,
  type Contact,
  type ContactList,
} from "@/lib/recipients-api";

export function ContactListDetailsPage() {
  const { listId } = useParams<{ listId: string }>();
  const [list, setList] = useState<ContactList | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [pickerContacts, setPickerContacts] = useState<Contact[]>([]);
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());
  const [pickerQ, setPickerQ] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  const refresh = useCallback(() => {
    if (!listId) return Promise.resolve();
    return fetchListDetail(listId).then((res) => {
      setList(res.list);
      setContacts(res.contacts);
    });
  }, [listId]);

  useEffect(() => {
    if (!listId) return;
    let cancelled = false;
    refresh()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listId, refresh]);

  const openAddContacts = () => {
    setPickerSelected(new Set());
    setPickerQ("");
    setAddError(null);
    setAddOpen(true);
    fetchContacts({ page: 1, limit: 100 })
      .then((res) => setPickerContacts(res.contacts))
      .catch(() => setPickerContacts([]));
  };

  useEffect(() => {
    if (!addOpen) return;
    const timer = setTimeout(() => {
      fetchContacts({ page: 1, limit: 100, q: pickerQ.trim() || undefined })
        .then((res) => setPickerContacts(res.contacts))
        .catch(() => setPickerContacts([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [addOpen, pickerQ]);

  const memberIds = useMemo(() => new Set(contacts.map((c) => c.id)), [contacts]);

  const confirmAddContacts = async () => {
    if (!listId || pickerSelected.size === 0) return;
    setAddBusy(true);
    setAddError(null);
    try {
      await addContactsToList(listId, Array.from(pickerSelected));
      setAddOpen(false);
      setPickerSelected(new Set());
      setLoading(true);
      await refresh();
    } catch (err) {
      setAddError(err instanceof RecipientsApiError ? err.message : "Could not add contacts");
    } finally {
      setAddBusy(false);
      setLoading(false);
    }
  };

  const removeSelected = async () => {
    if (!listId || selectedIds.size === 0) return;
    await removeContactsFromList(listId, Array.from(selectedIds));
    setSelectedIds(new Set());
    setLoading(true);
    await refresh();
    setLoading(false);
  };

  if (!listId) return null;

  return (
    <>
      <PageMeta title="List details | Binaries.nl" description="Contact list." canonicalPath={`/app/recipients/lists/${listId}/`} />
      <AppPageContainer>
        <PageHeader
          title={list?.name ?? "List"}
          description={list?.description || "Contacts in this list."}
          actions={
            <>
              <Button variant="outline" asChild><Link to="/app/recipients/lists/">Back to lists</Link></Button>
              {list?.canManage ? <Button onClick={openAddContacts}>Add contacts</Button> : null}
              {list?.canManage && selectedIds.size > 0 ? (
                <Button variant="destructive" onClick={() => void removeSelected()}>Remove selected</Button>
              ) : null}
            </>
          }
        />
        <RecipientsNav />
        {list?.canManage ? (
          <label className="mb-4 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={list.isTestList}
              onChange={(event) => {
                const next = event.target.checked;
                void updateContactList(list.id, { isTestList: next }).then(() => refresh());
              }}
            />
            <span>
              <span className="font-medium">Test list</span>
              <span className="block text-muted-foreground">
                Purpose: testing. Settings → Test Message can send one separate email to each eligible member.
              </span>
            </span>
          </label>
        ) : null}
        <Card>
          <CardContent className="p-0 sm:p-0">
            {loading ? <Skeleton className="h-40 w-full" /> : (
              <ContactsTable
                contacts={contacts}
                selectedIds={selectedIds}
                selectable={Boolean(list?.canManage)}
                onToggleSelect={(id) => setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })}
                onToggleSelectAll={() => {
                  if (contacts.every((c) => selectedIds.has(c.id))) setSelectedIds(new Set());
                  else setSelectedIds(new Set(contacts.map((c) => c.id)));
                }}
                allSelected={contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id))}
                showActions={false}
              />
            )}
          </CardContent>
        </Card>
      </AppPageContainer>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add contacts to list</DialogTitle>
            <DialogDescription>Select contacts from your account to add to this list.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Search by email"
            value={pickerQ}
            onChange={(e) => setPickerQ(e.target.value)}
          />
          <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
            {pickerContacts.map((contact) => {
              const inList = memberIds.has(contact.id);
              const checked = pickerSelected.has(contact.id);
              return (
                <li key={contact.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={inList}
                    checked={inList || checked}
                    onChange={() => {
                      if (inList) return;
                      setPickerSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(contact.id)) next.delete(contact.id);
                        else next.add(contact.id);
                        return next;
                      });
                    }}
                    aria-label={`Select ${contact.email}`}
                  />
                  <span className={inList ? "text-muted-foreground" : undefined}>{contact.email}</span>
                  {inList ? <span className="text-xs text-muted-foreground">(already in list)</span> : null}
                </li>
              );
            })}
          </ul>
          {addError ? <p className="text-sm text-destructive">{addError}</p> : null}
          <DialogFooter>
            <Button
              disabled={addBusy || pickerSelected.size === 0}
              onClick={() => void confirmAddContacts()}
            >
              {addBusy ? "Adding…" : `Add ${pickerSelected.size || ""} contact${pickerSelected.size === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
