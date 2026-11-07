import { MoreHorizontal, Pencil, Trash2, UserMinus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { contactStatusBadgeVariant, contactStatusLabel } from "@/lib/contact-status";
import type { Contact } from "@/lib/recipients-api";
import { contactDisplayName } from "@/lib/recipients-api";

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type ContactsTableProps = {
  contacts: Contact[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  allSelected: boolean;
  onEdit?: (contact: Contact) => void;
  onDelete?: (contact: Contact) => void;
  onUnsubscribe?: (contact: Contact) => void;
  onAddToList?: (contact: Contact) => void;
  showActions?: boolean;
  selectable?: boolean;
};

export function ContactsTable({
  contacts,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  allSelected,
  onEdit,
  onDelete,
  onUnsubscribe,
  onAddToList,
  showActions = true,
  selectable = true,
}: ContactsTableProps) {
  return (
    <>
      <ul className="divide-y md:hidden">
        <li className="flex min-h-11 items-center gap-3 px-4 py-3">
          <input
            type="checkbox"
            className="size-5"
            aria-label="Select all contacts"
            checked={allSelected}
            disabled={!selectable}
            onChange={onToggleSelectAll}
          />
          <span className="text-sm">Select all</span>
        </li>
        {contacts.map((contact) => (
          <li key={contact.id} className="flex items-start gap-3 px-4 py-3">
            <input
              type="checkbox"
              className="mt-1 size-5 shrink-0"
              aria-label={`Select ${contact.email}`}
              checked={selectedIds.has(contact.id)}
              disabled={!selectable}
              onChange={() => onToggleSelect(contact.id)}
            />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium wrap-break-word">{contactDisplayName(contact)}</p>
              <p className="text-sm break-all text-muted-foreground">{contact.email}</p>
              <Badge variant={contactStatusBadgeVariant(contact.subscriptionStatus)}>
                {contactStatusLabel(contact.subscriptionStatus)}
              </Badge>
            </div>
            {showActions ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Contact actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onEdit ? (
                    <DropdownMenuItem onClick={() => onEdit(contact)}>
                      <Pencil className="size-4" /> Edit
                    </DropdownMenuItem>
                  ) : null}
                  {onAddToList ? (
                    <DropdownMenuItem onClick={() => onAddToList(contact)}>
                      Add to list
                    </DropdownMenuItem>
                  ) : null}
                  {onUnsubscribe && contact.subscriptionStatus !== "unsubscribed" ? (
                    <DropdownMenuItem onClick={() => onUnsubscribe(contact)}>
                      <UserMinus className="size-4" /> Unsubscribe
                    </DropdownMenuItem>
                  ) : null}
                  {onDelete ? (
                    <DropdownMenuItem variant="destructive" onClick={() => onDelete(contact)}>
                      <Trash2 className="size-4" /> Delete
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <input
              type="checkbox"
              aria-label="Select all contacts"
              checked={allSelected}
              disabled={!selectable}
              onChange={onToggleSelectAll}
            />
          </TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden md:table-cell">Lists</TableHead>
          <TableHead className="hidden lg:table-cell">Added</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {contacts.map((contact) => (
          <TableRow key={contact.id}>
            <TableCell>
              <input
                type="checkbox"
                aria-label={`Select ${contact.email}`}
                checked={selectedIds.has(contact.id)}
                disabled={!selectable}
                onChange={() => onToggleSelect(contact.id)}
              />
            </TableCell>
            <TableCell className="font-medium">{contactDisplayName(contact)}</TableCell>
            <TableCell className="max-w-64 truncate">{contact.email}</TableCell>
            <TableCell>
              <Badge variant={contactStatusBadgeVariant(contact.subscriptionStatus)}>
                {contactStatusLabel(contact.subscriptionStatus)}
              </Badge>
            </TableCell>
            <TableCell className="hidden max-w-[180px] truncate md:table-cell">
              {contact.listNames.length ? contact.listNames.join(", ") : "—"}
            </TableCell>
            <TableCell className="hidden lg:table-cell">{formatDate(contact.createdAt)}</TableCell>
            <TableCell className="text-right">
              {!showActions ? null : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Contact actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onEdit ? (
                    <DropdownMenuItem onClick={() => onEdit(contact)}>
                      <Pencil className="size-4" /> Edit
                    </DropdownMenuItem>
                  ) : null}
                  {onAddToList ? (
                    <DropdownMenuItem onClick={() => onAddToList(contact)}>
                      Add to list
                    </DropdownMenuItem>
                  ) : null}
                  {onUnsubscribe && contact.subscriptionStatus !== "unsubscribed" ? (
                    <DropdownMenuItem onClick={() => onUnsubscribe(contact)}>
                      <UserMinus className="size-4" /> Unsubscribe
                    </DropdownMenuItem>
                  ) : null}
                  {onDelete ? (
                    <DropdownMenuItem variant="destructive" onClick={() => onDelete(contact)}>
                      <Trash2 className="size-4" /> Delete
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
      </div>
    </>
  );
}
