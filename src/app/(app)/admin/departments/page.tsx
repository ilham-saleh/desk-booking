"use client";

import { useState } from "react";
import { api } from "@/lib/trpc/client";
import { PlusCircle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function DepartmentsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState("");

  const { data: departments = [], refetch } = api.restriction.listDepartments.useQuery();

  const createMutation = api.restriction.createDepartment.useMutation({
    onSuccess: () => {
      toast.success("Department created");
      setNewDepartmentName("");
      setIsCreateOpen(false);
      void refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const deleteMutation = api.restriction.deleteDepartment.useMutation({
    onSuccess: () => {
      toast.success("Department deleted");
      void refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleCreate = () => {
    if (!newDepartmentName.trim()) {
      toast.error("Department name required");
      return;
    }
    createMutation.mutate({ name: newDepartmentName });
  };

  const handleDelete = (departmentId: string) => {
    if (confirm("Delete this department?")) {
      deleteMutation.mutate({ departmentId });
    }
  };

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Departments</h1>
          <p className="mt-2 text-gray-600">Create and manage departments for your organization.</p>
        </div>
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="gap-2"
        >
          <PlusCircle className="size-4" />
          New Department
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Departments</CardTitle>
          <CardDescription>Used for booking restrictions</CardDescription>
        </CardHeader>
        <CardContent>
          {departments.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No departments yet. Create one to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {departments.map((dept) => (
                <div key={dept.id} className="flex items-center justify-between rounded border p-3">
                  <span className="font-medium">{dept.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(dept.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Department</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Department Name *</Label>
              <Input
                placeholder="e.g., Engineering, Sales, Finance"
                value={newDepartmentName}
                onChange={(e) => setNewDepartmentName(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
