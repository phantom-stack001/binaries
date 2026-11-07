export type SubscriptionStatus = "subscribed" | "unsubscribed" | "pending" | "unknown";

export type Contact = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  subscriptionStatus: SubscriptionStatus;
  createdAt: string;
  updatedAt: string;
  listNames: string[];
  canManage: boolean;
  canAddToList: boolean;
};

export type ContactList = {
  id: string;
  name: string;
  description: string;
  isTestList: boolean;
  memberCount: number;
  canManage: boolean;
  canAddContacts: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SuppressionReason = "unsubscribed" | "hard_bounce" | "complaint" | "manual_block";

export type Suppression = {
  id: string;
  email: string;
  reason: SuppressionReason;
  createdAt: string;
  updatedAt: string;
};

export class RecipientsApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "RecipientsApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : "Request failed";
    throw new RecipientsApiError(message, response.status);
  }
  return payload as T;
}

export function fetchContactStats(scope?: "all") {
  return request<{ stats: { total: number; subscribed: number; unsubscribed: number; pending: number; unknown: number } }>(
    `/api/contacts/stats${scope ? `?scope=${scope}` : ""}`,
  );
}

export function fetchContacts(params: {
  page?: number;
  limit?: number;
  q?: string;
  status?: "subscribed" | "unsubscribed";
  listId?: string;
  sort?: string;
  scope?: "all";
}) {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  if (params.listId) search.set("listId", params.listId);
  if (params.sort) search.set("sort", params.sort);
  if (params.scope) search.set("scope", params.scope);
  return request<{
    contacts: Contact[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>(`/api/contacts?${search.toString()}`);
}

export type ContactInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  phone?: string;
  subscriptionStatus?: SubscriptionStatus;
  consentSource?: string;
  consentMethod?: string;
  consentOccurredAt?: string;
};

export function createContact(input: ContactInput) {
  return request<{ contact: Contact }>("/api/contacts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateContact(id: string, input: Partial<ContactInput>) {
  return request<{ contact: Contact }>(`/api/contacts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteContact(id: string) {
  return request<{ ok: boolean }>(`/api/contacts/${id}`, { method: "DELETE" });
}

export function unsubscribeContact(id: string) {
  return request<{ contact: Contact }>(`/api/contacts/${id}/unsubscribe`, { method: "POST" });
}

export function bulkDeleteContacts(contactIds: string[]) {
  return request<{ deleted: number }>("/api/contacts/bulk/delete", {
    method: "POST",
    body: JSON.stringify({ contactIds }),
  });
}

export function bulkUnsubscribeContacts(contactIds: string[]) {
  return request<{ updated: number }>("/api/contacts/bulk/unsubscribe", {
    method: "POST",
    body: JSON.stringify({ contactIds }),
  });
}

export function fetchContactLists() {
  return request<{ lists: ContactList[] }>("/api/contact-lists");
}

export function createContactList(input: { name: string; description?: string; isTestList?: boolean }) {
  return request<{ list: ContactList }>("/api/contact-lists", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateContactList(
  id: string,
  input: { name?: string; description?: string; isTestList?: boolean },
) {
  return request<{ list: ContactList }>(`/api/contact-lists/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteContactList(id: string) {
  return request<{ ok: boolean }>(`/api/contact-lists/${id}`, { method: "DELETE" });
}

export function fetchListDetail(id: string, page = 1, limit = 25) {
  return request<{
    list: ContactList;
    contacts: Contact[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>(`/api/contact-lists/${id}/contacts?page=${page}&limit=${limit}`);
}

export function addContactsToList(listId: string, contactIds: string[]) {
  return request<{ added: number }>(`/api/contact-lists/${listId}/contacts`, {
    method: "POST",
    body: JSON.stringify({ contactIds }),
  });
}

export function removeContactsFromList(listId: string, contactIds: string[]) {
  return request<{ removed: number }>(`/api/contact-lists/${listId}/contacts/remove`, {
    method: "POST",
    body: JSON.stringify({ contactIds }),
  });
}

export function previewCsvImport(csvText: string) {
  return request<{
    preview: { headers: string[]; previewRows: string[][]; totalDataRows: number };
  }>("/api/contacts/import/preview", {
    method: "POST",
    body: JSON.stringify({ csvText }),
  });
}

export function importContacts(csvText: string, mapping: Record<string, string | undefined>) {
  return request<{
    result: {
      totalRows: number;
      validRows: number;
      imported: number;
      duplicates: number;
      invalid: number;
      suppressed: number;
      errors: { row: number; message: string }[];
    };
  }>("/api/contacts/import", {
    method: "POST",
    body: JSON.stringify({ csvText, mapping }),
  });
}

export function fetchSuppressions(params: {
  page?: number;
  limit?: number;
  q?: string;
  reason?: SuppressionReason;
}) {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.q) search.set("q", params.q);
  if (params.reason) search.set("reason", params.reason);
  return request<{
    suppressions: Suppression[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>(`/api/suppressions?${search.toString()}`);
}

export function createSuppression(input: { email: string; reason: SuppressionReason }) {
  return request<{ suppression: Suppression }>("/api/suppressions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function contactDisplayName(contact: Contact) {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  return name || "—";
}
