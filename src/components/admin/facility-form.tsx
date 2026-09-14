"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { api } from "@/lib/trpc/client";
import { facilityCreateInputSchema, type FacilityCreateInput } from "@/lib/schemas/facility";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OperatingHoursForm } from "./operating-hours-form";

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];

interface FacilityFormProps {
  mode: "create" | "edit";
  initialData?: {
    id: string;
    name: string;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    postalCode?: string | null;
    description?: string | null;
    timeZone: string;
    unitSystem?: string;
    allowEmployeeSeeBookings: boolean;
    operatingHours?: Array<{ dayOfWeek: number; openAtMinutes: number; closeAtMinutes: number }>;
  };
  onSuccess?: () => void;
}

export function FacilityForm({ mode, initialData, onSuccess }: FacilityFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FacilityCreateInput>({
    resolver: zodResolver(facilityCreateInputSchema),
    defaultValues: {
      name: initialData?.name || "",
      address: initialData?.address || "",
      city: initialData?.city || "",
      country: initialData?.country || "",
      postalCode: initialData?.postalCode || "",
      description: initialData?.description || "",
      timeZone: initialData?.timeZone || "UTC",
      unitSystem: (initialData?.unitSystem as "METRIC" | "IMPERIAL") || "METRIC",
      allowEmployeeSeeBookings: initialData?.allowEmployeeSeeBookings ?? true,
    },
  });

  const createMutation = api.facility.create.useMutation({
    onSuccess: () => {
      toast.success("Facility created");
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const updateMutation = api.facility.update.useMutation({
    onSuccess: () => {
      toast.success("Facility updated");
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const onSubmit = (data: FacilityCreateInput) => {
    setIsSubmitting(true);
    if (mode === "create") {
      void createMutation.mutateAsync(data).finally(() => setIsSubmitting(false));
    } else if (mode === "edit" && initialData) {
      void updateMutation.mutateAsync({
        ...data,
        siteId: initialData.id,
      }).finally(() => setIsSubmitting(false));
    }
  };

  return (
    <Form {...form}>
      {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          {/* Facility Name */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Facility Name *</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., London - Steward Building" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Timezone */}
          <FormField
            control={form.control}
            name="timeZone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Timezone *</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Address */}
          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Address</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 12 Steward Street" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* City */}
          <FormField
            control={form.control}
            name="city"
            render={({ field }) => (
              <FormItem>
                <FormLabel>City</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., London" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Country */}
          <FormField
            control={form.control}
            name="country"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Country</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., United Kingdom" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Postal Code */}
          <FormField
            control={form.control}
            name="postalCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Postal Code</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., E1 6FQ" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Unit System */}
          <FormField
            control={form.control}
            name="unitSystem"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Units</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="METRIC">Metric</SelectItem>
                    <SelectItem value="IMPERIAL">Imperial</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Description */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., London headquarters" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Allow Employees See Bookings */}
          <FormField
            control={form.control}
            name="allowEmployeeSeeBookings"
            render={({ field }) => (
              <FormItem className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                  className="rounded"
                />
                <FormLabel className="m-0">Allow employees to see coworkers&apos; bookings</FormLabel>
              </FormItem>
            )}
          />
        </div>

        {/* Operating Hours */}
        {mode === "edit" && initialData && (
          <OperatingHoursForm siteId={initialData.id} initialHours={initialData.operatingHours} />
        )}

        <div className="flex gap-2 pt-4">
          <Button type="submit" disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}>
            {mode === "create" ? "Create Facility" : "Update Facility"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
