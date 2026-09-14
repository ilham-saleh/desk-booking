"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { api } from "@/lib/trpc/client";
import { floorCreateInputSchema, type FloorCreateInput } from "@/server/api/routers/floor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "sonner";

interface FloorFormProps {
  mode: "create" | "edit";
  siteId?: string;
  floorId?: string;
  initialData?: { id: string; name: string; description?: string };
  onSuccess?: () => void;
}

export function FloorForm({ mode, siteId, floorId, initialData, onSuccess }: FloorFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FloorCreateInput>({
    resolver: zodResolver(floorCreateInputSchema),
    defaultValues: initialData || {
      siteId: siteId || "",
      name: "",
      description: "",
      sortOrder: 0,
    },
  });

  const createMutation = api.floor.create.useMutation({
    onSuccess: () => {
      toast.success("Floor created");
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const updateMutation = api.floor.update.useMutation({
    onSuccess: () => {
      toast.success("Floor updated");
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const onSubmit = (data: FloorCreateInput) => {
    setIsSubmitting(true);
    if (mode === "create") {
      void createMutation.mutateAsync(data).finally(() => setIsSubmitting(false));
    } else if (mode === "edit" && floorId) {
      void updateMutation.mutateAsync({
        floorId,
        name: data.name,
        description: data.description,
        sortOrder: data.sortOrder,
      }).finally(() => setIsSubmitting(false));
    }
  };

  return (
    <Form {...form}>
      {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Floor Name *</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Level 5, Ground Floor" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input placeholder="Optional description" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2 pt-4">
          <Button type="submit" disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}>
            {mode === "create" ? "Create Floor" : "Update Floor"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
