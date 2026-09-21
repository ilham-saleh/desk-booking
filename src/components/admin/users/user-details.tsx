"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, UserMinus, UserPlus } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { z } from "zod";

import { Role } from "@/generated/prisma/enums";
import { permissionTypeForRole, roleLabel } from "@/lib/roles";
import { api } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SitePermissionsSection } from "@/components/admin/users/site-permissions-section";

export type UserDetail = RouterOutputs["user"]["get"];

/** Form-side schema: plain strings; the router trims/normalizes and turns an empty location into null. */
const formSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: z.string().trim().email("Enter a valid email address").max(254),
  location: z.string().trim().max(120),
  role: z.nativeEnum(Role),
});
type FormValues = z.infer<typeof formSchema>;

const ROLE_HELP: Record<Role, string> = {
  [Role.PLATFORM_ADMIN]: "Platform operator — not assignable here.",
  [Role.ORG_SUPER_ADMIN]: "Full authority over every site, floor, desk and user. Can book and cancel on behalf of anyone.",
  [Role.SITE_ADMIN]: "Manages the sites assigned below: floors, Editing Platform, desks, restrictions and relevant users. Can book and cancel on behalf of others at those sites.",
  [Role.BOOKING_MANAGER]: "Books desks for themselves and, at the sites granted below, on behalf of other employees. No access to user, desk or site management.",
  [Role.STANDARD_USER]: "Books desks for themselves only.",
};

export function UserDetails({ userId }: { userId: string }) {
  const utils = api.useUtils();
  const user = api.user.get.useQuery({ userId });

  if (user.isPending) return <div className="text-muted-foreground p-8">Loading user…</div>;
  if (user.error) {
    return (
      <div className="space-y-4 p-8">
        <BackLink />
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {user.error.data?.code === "FORBIDDEN" ? user.error.message : user.error.data?.code === "NOT_FOUND" ? "This user doesn't exist or has been removed." : "Couldn't load this user."}
        </div>
      </div>
    );
  }

  return (
    <UserDetailsLoaded
      user={user.data}
      onChanged={() => {
        void utils.user.get.invalidate({ userId });
        void utils.user.listDirectory.invalidate();
      }}
    />
  );
}

function BackLink() {
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link href="/admin/users" className="gap-2">
        <ArrowLeft className="size-4" />
        Back to Users
      </Link>
    </Button>
  );
}

function UserDetailsLoaded({ user, onChanged }: { user: UserDetail; onChanged: () => void }) {
  const [pendingSave, setPendingSave] = useState<FormValues | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      email: user.email,
      location: user.location ?? "",
      role: user.role,
    },
  });
  // Re-sync after a save (or an outside change) so the form reflects persisted values.
  useEffect(() => {
    form.reset({ firstName: user.firstName ?? "", lastName: user.lastName ?? "", email: user.email, location: user.location ?? "", role: user.role });
  }, [user, form]);

  const save = api.user.save.useMutation({
    onSuccess: (result) => {
      toast.success(
        result.removedPermissionCount > 0
          ? `User saved. ${result.removedPermissionCount} site permission${result.removedPermissionCount === 1 ? "" : "s"} no longer applied and ${result.removedPermissionCount === 1 ? "was" : "were"} removed.`
          : "User saved",
      );
      setPendingSave(null);
      onChanged();
    },
    onError: (error) => {
      toast.error(error.message);
      setPendingSave(null);
    },
  });
  const deactivate = api.user.deactivateMany.useMutation({
    onSuccess: () => {
      toast.success(`${user.name} removed. They can no longer sign in.`);
      setConfirmRemove(false);
      onChanged();
    },
    onError: (error) => toast.error(error.message),
  });
  const reactivate = api.user.reactivate.useMutation({
    onSuccess: () => {
      toast.success(`${user.name} reactivated.`);
      onChanged();
    },
    onError: (error) => toast.error(error.message),
  });

  const selectedRole = useWatch({ control: form.control, name: "role" });
  const roleChanged = selectedRole !== user.role;
  const permissionsLostOnSave = roleChanged ? user.permissions.filter((permission) => permission.type !== permissionTypeForRole(selectedRole)) : [];
  const leavingSystemAdmin = roleChanged && user.role === Role.ORG_SUPER_ADMIN;

  const submit = (values: FormValues) => {
    if (leavingSystemAdmin || permissionsLostOnSave.length > 0) {
      setPendingSave(values);
      return;
    }
    save.mutate({ userId: user.id, ...values, location: values.location.length > 0 ? values.location : null });
  };

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <BackLink />
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">{user.name}</h1>
            <Badge variant="outline">{user.roleLabel}</Badge>
            {!user.isActive && <Badge variant="destructive">Inactive</Badge>}
          </div>
          <p className="text-muted-foreground text-sm">{user.email}</p>
        </div>
        {!user.isSelf &&
          (user.isActive ? (
            <Button variant="outline" className="gap-2 text-red-700 hover:text-red-800" onClick={() => setConfirmRemove(true)}>
              <UserMinus className="size-4" />
              Remove User
            </Button>
          ) : (
            <Button variant="outline" className="gap-2" disabled={reactivate.isPending} onClick={() => reactivate.mutate({ userId: user.id })}>
              <UserPlus className="size-4" />
              {reactivate.isPending ? "Reactivating…" : "Reactivate User"}
            </Button>
          ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Names, email and location are employee profile fields — the HRIS sync will keep them updated in the next phase. Role is managed here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={(event) => void form.handleSubmit(submit)(event)} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input autoComplete="off" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input autoComplete="off" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" autoComplete="off" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="user-title">Title</Label>
                    <Input id="user-title" value={user.title ?? ""} readOnly disabled placeholder="Not set" />
                    <p className="text-muted-foreground text-xs">Synced from HRIS. Read-only.</p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="user-department">Department</Label>
                    <Input id="user-department" value={user.department ?? ""} readOnly disabled placeholder="Not set" />
                    <p className="text-muted-foreground text-xs">Synced from HRIS. Read-only.</p>
                  </div>
                </div>
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. London" autoComplete="off" {...field} />
                      </FormControl>
                      <FormDescription>The employee&apos;s office location. This is informational — site permissions are granted separately below.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={user.isSelf}>
                        <FormControl>
                          <SelectTrigger className="w-full sm:w-72">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {user.assignableRoles.map((role) => (
                            <SelectItem key={role} value={role}>
                              {roleLabel(role)}
                            </SelectItem>
                          ))}
                          {!(user.assignableRoles as Role[]).includes(user.role) && (
                            <SelectItem value={user.role} disabled>
                              {roleLabel(user.role)}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription>{user.isSelf ? "You can't change your own role." : ROLE_HELP[field.value]}</FormDescription>
                      {roleChanged && (
                        <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                          Save to apply the new role. Site permissions below are for the current role ({roleLabel(user.role)}) until then
                          {permissionsLostOnSave.length > 0 && ` — ${permissionsLostOnSave.length} existing site permission${permissionsLostOnSave.length === 1 ? "" : "s"} will be removed`}.
                        </p>
                      )}
                    </FormItem>
                  )}
                />
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={save.isPending || !form.formState.isDirty}>
                    {save.isPending ? "Saving…" : "Save User"}
                  </Button>
                  <Button type="button" variant="outline" disabled={!form.formState.isDirty} onClick={() => form.reset()}>
                    Cancel
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>User Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="text-muted-foreground">Status</dt>
              <dd>{user.isActive ? "Active" : "Inactive — cannot sign in"}</dd>
              <dt className="text-muted-foreground">Last activity</dt>
              <dd>{user.lastLoginAt ? `Logged in ${formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true })}` : "Never logged in"}</dd>
              <dt className="text-muted-foreground">Employee ID</dt>
              <dd>{user.employeeId ?? <span className="text-muted-foreground">Not synced yet</span>}</dd>
              <dt className="text-muted-foreground">Added</dt>
              <dd>{format(new Date(user.createdAt), "d MMM yyyy")}</dd>
            </dl>
            <div>
              <h3 className="mb-2 font-medium">Recent bookings</h3>
              {user.recentBookings.length === 0 ? (
                <p className="text-muted-foreground">No bookings yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {user.recentBookings.map((booking) => (
                    <li key={booking.id} className="flex items-baseline justify-between gap-2">
                      <span>
                        Desk {booking.deskNumber} · {booking.siteName}, {booking.floorName}
                      </span>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {format(new Date(booking.startAt), "d MMM")} · {booking.status.toLowerCase().replace("_", " ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <SitePermissionsSection user={user} onChanged={onChanged} />

      {/* Role-change confirmation (System Admin demotion, or permissions that will be dropped) */}
      <Dialog open={pendingSave !== null} onOpenChange={(open) => !open && setPendingSave(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change {user.firstName ?? user.name}&apos;s role to {pendingSave ? roleLabel(pendingSave.role) : ""}?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                {leavingSystemAdmin && <p>This removes their global System Admin access to every site, floor and user.</p>}
                {permissionsLostOnSave.length > 0 && (
                  <p>
                    The following site permission{permissionsLostOnSave.length === 1 ? "" : "s"} no longer apply to the new role and will be removed:{" "}
                    <span className="font-medium">{permissionsLostOnSave.map((permission) => permission.siteName).join(", ")}</span>. You can grant sites for the new role afterwards.
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingSave(null)}>
              Cancel
            </Button>
            <Button
              disabled={save.isPending}
              onClick={() => pendingSave && save.mutate({ userId: user.id, ...pendingSave, location: pendingSave.location.length > 0 ? pendingSave.location : null })}
            >
              {save.isPending ? "Saving…" : "Change Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {user.name}?</DialogTitle>
            <DialogDescription>
              {user.name} will no longer be able to sign in or use the desk-booking system. Their booking history is kept and you can reactivate them later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deactivate.isPending} onClick={() => deactivate.mutate({ userIds: [user.id] })}>
              {deactivate.isPending ? "Removing…" : "Remove User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
