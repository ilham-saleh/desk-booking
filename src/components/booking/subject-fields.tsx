"use client";

import { api } from "@/lib/trpc/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type BookingSubjectMode = "self" | "user" | "guest";

/**
 * "Book for myself / another user / a guest" — shared between the desk panel
 * (direct map booking) and the Book-a-Desk flow. Admin-only fields
 * (rule 4/10); a standard user never sees this.
 */
export function BookingSubjectFields({
  mode,
  onModeChange,
  forUserId,
  onForUserIdChange,
  guestName,
  onGuestNameChange,
}: {
  mode: BookingSubjectMode;
  onModeChange: (mode: BookingSubjectMode) => void;
  forUserId: string;
  onForUserIdChange: (userId: string) => void;
  guestName: string;
  onGuestNameChange: (name: string) => void;
}) {
  const orgUsers = api.user.listActive.useQuery();

  return (
    <>
      <div className="grid gap-1.5">
        <Label>Book for</Label>
        <Select value={mode} onValueChange={(v) => onModeChange(v as BookingSubjectMode)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="self">Myself</SelectItem>
            <SelectItem value="user">Another user</SelectItem>
            <SelectItem value="guest">A guest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === "user" && (
        <div className="grid gap-1.5">
          <Label>User</Label>
          <Select value={forUserId} onValueChange={onForUserIdChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select a user" />
            </SelectTrigger>
            <SelectContent>
              {(orgUsers.data ?? []).map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name} ({user.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        </div>
      )}
    </>
  );
}
