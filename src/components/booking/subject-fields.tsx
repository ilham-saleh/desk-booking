"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/trpc/client";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type BookingSubjectMode = "self" | "user" | "guest";

/** An employee picked from the directory — only people who exist in the system can be chosen. */
export interface BookingSubjectUser {
  id: string;
  name: string;
  email: string;
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

/**
 * "Book for myself / another employee / a guest" — shared between the desk panel
 * (direct map booking) and the Book-a-Desk flow. Admin/Booking-Manager-only
 * fields; a standard user never sees this. The employee picker is a server-side
 * typeahead over the directory (never the whole employee list), so only real
 * employees can be selected; guests are free text.
 */
export function BookingSubjectFields({
  mode,
  onModeChange,
  forUser,
  onForUserChange,
  guestName,
  onGuestNameChange,
}: {
  mode: BookingSubjectMode;
  onModeChange: (mode: BookingSubjectMode) => void;
  forUser: BookingSubjectUser | null;
  onForUserChange: (user: BookingSubjectUser | null) => void;
  guestName: string;
  onGuestNameChange: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query.trim(), 250);
  const search = api.user.search.useQuery(
    { query: debouncedQuery, limit: 20 },
    { enabled: mode === "user", placeholderData: (previous) => previous },
  );

  const options: ComboboxOption[] = (search.data ?? []).map((user) => ({
    value: user.id,
    label: user.name,
    description: [user.email, user.department].filter(Boolean).join(" · "),
  }));
  // Keep the chosen employee visible in the trigger even when the current search no longer lists them.
  if (forUser && !options.some((option) => option.value === forUser.id)) {
    options.unshift({ value: forUser.id, label: forUser.name, description: forUser.email });
  }

  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor="booking-subject-mode">Book for</Label>
        <Select value={mode} onValueChange={(v) => onModeChange(v as BookingSubjectMode)}>
          <SelectTrigger id="booking-subject-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="self">Myself</SelectItem>
            <SelectItem value="user">Another employee</SelectItem>
            <SelectItem value="guest">A guest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === "user" && (
        <div className="grid gap-1.5">
          <Label htmlFor="booking-subject-user">Employee</Label>
          <Combobox
            id="booking-subject-user"
            value={forUser?.id ?? null}
            onChange={(id) => {
              const picked = search.data?.find((user) => user.id === id);
              onForUserChange(picked ? { id: picked.id, name: picked.name, email: picked.email } : null);
            }}
            options={options}
            onSearchChange={setQuery}
            loading={search.isFetching}
            placeholder="Start typing a name or email…"
            searchPlaceholder="Search employees"
            emptyText={debouncedQuery ? "No employee in the system matches that" : "Type a name, email or department"}
          />
          <p className="text-muted-foreground text-xs">Only employees in the directory can be selected. Restrictions are checked for them, not you.</p>
        </div>
      )}

      {mode === "guest" && (
        <div className="grid gap-1.5">
          <Label htmlFor="booking-guest-name">Guest name</Label>
          <Input
            id="booking-guest-name"
            value={guestName}
            onChange={(e) => onGuestNameChange(e.target.value)}
            placeholder="Visitor name"
          />
          <p className="text-muted-foreground text-xs">Guests can only be booked into desks without booking restrictions.</p>
        </div>
      )}
    </>
  );
}
