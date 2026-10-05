"use client";

import { useState } from "react";
import { api } from "@/lib/trpc/client";
import { PlusCircle, Edit, Trash2, MapPin, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { FacilityForm } from "@/components/admin/facility-form";
import { toast } from "sonner";

export function AdminSitesClient() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  const { data: sites, isLoading, refetch } = api.facility.list.useQuery();
  const { data: selectedSite } = api.facility.get.useQuery(
    { siteId: selectedSiteId! },
    { enabled: !!selectedSiteId && isEditOpen },
  );

  const deleteMutation = api.facility.delete.useMutation({
    onSuccess: () => {
      toast.success("Facility deleted");
      void refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleDelete = (siteId: string) => {
    if (confirm("Are you sure? This will delete all associated floors and desks.")) {
      deleteMutation.mutate({ siteId });
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="type-page-title">Facilities / Sites</h1>
          <p className="text-muted-foreground mt-1 max-w-[70ch] text-sm leading-6">Create and manage workplace facilities, operating hours, and timezones.</p>
        </div>
        <Button
          onClick={() => {
            setSelectedSiteId(null);
            setIsCreateOpen(true);
          }}
          className="gap-2"
        >
          <PlusCircle className="size-4" />
          New Facility
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Facilities</CardTitle>
          <CardDescription>Manage your workplace facilities</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center text-muted-foreground">Loading facilities...</div>
          ) : !sites || sites.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No facilities yet. Create one to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Facility Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Timezone</TableHead>
                  <TableHead>Floors</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.map((site) => (
                  <TableRow key={site.id}>
                    <TableCell className="font-medium">
                      <Link href={`/admin/sites/${site.id}`} className="hover:underline flex items-center gap-2">
                        {site.name}
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Link>
                    </TableCell>
                    <TableCell>
                      {site.city && site.country ? (
                        <span className="flex items-center gap-1 text-sm">
                          <MapPin className="size-3" />
                          {site.city}, {site.country}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{site.timeZone}</TableCell>
                    <TableCell className="text-sm">{site._count?.floors || 0}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedSiteId(site.id);
                            setIsEditOpen(true);
                          }}
                        >
                          <Edit className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(site.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Facility Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Facility</DialogTitle>
          </DialogHeader>
          <FacilityForm
            onSuccess={() => {
              setIsCreateOpen(false);
              void refetch();
            }}
            mode="create"
          />
        </DialogContent>
      </Dialog>

      {/* Edit Facility Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Facility</DialogTitle>
          </DialogHeader>
          {selectedSite && (
            <FacilityForm
              initialData={selectedSite}
              onSuccess={() => {
                setIsEditOpen(false);
                void refetch();
              }}
              mode="edit"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
