"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Role } from "@/generated/prisma/enums";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { UserDetail } from "@/components/admin/users/user-details";

/**
 * Role-adaptive permissions area (tasks/users-management.md §25):
 *  System Admin      → informational: all sites and floors
 *  Facility Admin    → Managed Sites (remove) + Available Sites (add selected)
 *  Booking Manager   → Sites they may book for others at (remove) + Available Sites
 *  Standard User     → informational: self-booking only
 * Reflects the saved role; an unsaved role change is flagged in the form above.
 */
export function SitePermissionsSection({ user, onChanged }: { user: UserDetail; onChanged: () => void }) {
  const firstName = user.firstName ?? user.name;

  if (user.role === Role.ORG_SUPER_ADMIN || user.role === Role.PLATFORM_ADMIN) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Associated Site / Floor Permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="status" className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
            System Administrators have access to all sites and floors. No site selection is needed for {firstName}.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (user.role === Role.STANDARD_USER) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Booking Access</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="status" className="text-muted-foreground rounded-md border bg-muted/40 p-3 text-sm">
            Standard booking access: {firstName} can book desks for themselves. To let them book on behalf of other employees, change their role to Booking Manager and grant the relevant sites.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isFacilityAdmin = user.role === Role.SITE_ADMIN;
  return (
    <ScopedPermissions
      user={user}
      onChanged={onChanged}
      title={isFacilityAdmin ? "Managed Sites" : "Sites where this user can book on behalf of others"}
      description={
        isFacilityAdmin
          ? `${firstName} can manage floors, desks, restrictions and relevant users at these sites, and book or cancel on behalf of others there.`
          : `${firstName} can book desks for themselves anywhere, and for other employees at these sites.`
      }
      emptyMessage={
        isFacilityAdmin
          ? "This Facility Admin has not been assigned a site. They can't manage any workplace until one is added."
          : "This user has not been granted permission to book desks for others at any site."
      }
      grantVerb={isFacilityAdmin ? "manage" : "book for others at"}
    />
  );
}

function ScopedPermissions({
  user,
  onChanged,
  title,
  description,
  emptyMessage,
  grantVerb,
}: {
  user: UserDetail;
  onChanged: () => void;
  title: string;
  description: string;
  emptyMessage: string;
  grantVerb: string;
}) {
  const firstName = user.firstName ?? user.name;
  const availableRef = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pendingRemove, setPendingRemove] = useState<{ siteId: string; siteName: string } | null>(null);

  const add = api.user.addSitePermissions.useMutation({
    onSuccess: (result, variables) => {
      toast.success(result.added === 1 ? "1 site added" : `${variables.siteIds.length} sites added`);
      setPicked(new Set());
      onChanged();
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = api.user.removeSitePermission.useMutation({
    onSuccess: () => {
      toast.success(`${pendingRemove?.siteName ?? "Site"} permission removed`);
      setPendingRemove(null);
      onChanged();
    },
    onError: (error) => {
      toast.error(error.message);
      setPendingRemove(null);
    },
  });

  const allPicked = user.availableSites.length > 0 && user.availableSites.every((site) => picked.has(site.id));
  const togglePicked = (siteId: string, checked: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (checked) next.add(siteId);
      else next.delete(siteId);
      return next;
    });

  const focusAvailable = () => {
    availableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    availableRef.current?.querySelector<HTMLElement>("button, [role=checkbox]")?.focus();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {user.permissions.length === 0 ? (
            <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <span>{emptyMessage}</span>
              {user.availableSites.length > 0 && (
                <Button size="sm" className="gap-1" onClick={focusAvailable}>
                  <Plus className="size-4" />
                  Add Permission
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {user.permissions.map((permission) => (
                  <TableRow key={permission.siteId}>
                    <TableCell className="font-medium">{permission.siteName}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{permission.city ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" className="text-red-700 hover:text-red-800" onClick={() => setPendingRemove({ siteId: permission.siteId, siteName: permission.siteName })}>
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card ref={availableRef}>
        <CardHeader>
          <CardTitle>Available Sites</CardTitle>
          <CardDescription>
            {user.availableSites.length === 0
              ? user.permissions.length > 0
                ? `${firstName} already has every site you can grant.`
                : "There are no sites you can grant to this user."
              : `Select the sites ${firstName} should be able to ${grantVerb}, then click Add Selected.`}
          </CardDescription>
        </CardHeader>
        {user.availableSites.length > 0 && (
          <CardContent>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="available-sites-all"
                  checked={allPicked}
                  onCheckedChange={(checked) => setPicked(checked === true ? new Set(user.availableSites.map((site) => site.id)) : new Set())}
                />
                <Label htmlFor="available-sites-all">Select all</Label>
              </div>
              <Button disabled={picked.size === 0 || add.isPending} onClick={() => add.mutate({ userId: user.id, siteIds: [...picked] })}>
                {add.isPending ? "Adding…" : picked.size > 0 ? `Add Selected (${picked.size})` : "Add Selected"}
              </Button>
            </div>
            <ul className="divide-y rounded-md border">
              {user.availableSites.map((site) => {
                const id = `available-site-${site.id}`;
                return (
                  <li key={site.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="flex items-center gap-3">
                      <Checkbox id={id} checked={picked.has(site.id)} onCheckedChange={(checked) => togglePicked(site.id, checked === true)} />
                      <Label htmlFor={id} className="flex-col items-start gap-0.5">
                        <span>{site.name}</span>
                        {site.city && <span className="text-muted-foreground text-xs font-normal">{site.city}</span>}
                      </Label>
                    </div>
                    <Button variant="ghost" size="sm" disabled={add.isPending} onClick={() => add.mutate({ userId: user.id, siteIds: [site.id] })}>
                      Add
                    </Button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        )}
      </Card>

      <Dialog open={pendingRemove !== null} onOpenChange={(open) => !open && setPendingRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {pendingRemove?.siteName} permission from {firstName}?</DialogTitle>
            <DialogDescription>
              {firstName} will immediately lose the ability to {grantVerb} {pendingRemove?.siteName}. Existing bookings are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRemove(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => pendingRemove && remove.mutate({ userId: user.id, siteId: pendingRemove.siteId })}>
              {remove.isPending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
