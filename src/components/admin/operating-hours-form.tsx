"use client";

import { useState } from "react";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function timeToMinutes(time: string): number {
  const [hours, mins] = time.split(":").map(Number);
  return (hours || 0) * 60 + (mins || 0);
}

interface OperatingHoursFormProps {
  siteId: string;
  initialHours?: Array<{
    dayOfWeek: number;
    openAtMinutes: number;
    closeAtMinutes: number;
  }>;
}

export function OperatingHoursForm({ siteId, initialHours }: OperatingHoursFormProps) {
  const [hours, setHours] = useState<Record<number, { open: string; close: string }>>(
    initialHours
      ? Object.fromEntries(
          initialHours.map((h) => [
            h.dayOfWeek,
            {
              open: minutesToTime(h.openAtMinutes),
              close: minutesToTime(h.closeAtMinutes),
            },
          ]),
        )
      : {
          1: { open: "09:00", close: "17:00" }, // Mon-Fri defaults
          2: { open: "09:00", close: "17:00" },
          3: { open: "09:00", close: "17:00" },
          4: { open: "09:00", close: "17:00" },
          5: { open: "09:00", close: "17:00" },
        },
  );

  const updateHoursMutation = api.facility.updateOperatingHours.useMutation({
    onSuccess: () => {
      toast.success("Operating hours updated");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = () => {
    const operatingHours = Object.entries(hours).map(([day, times]) => ({
      dayOfWeek: Number(day),
      openAtMinutes: timeToMinutes(times.open),
      closeAtMinutes: timeToMinutes(times.close),
    }));

    void updateHoursMutation.mutateAsync({
      siteId,
      hours: operatingHours,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Operating Hours</CardTitle>
        <CardDescription>Set working hours for each day of the week</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {DAYS.map((day) => (
          <div key={day.value} className="flex items-center gap-4">
            <Label className="w-24">{day.label}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={hours[day.value]?.open || "09:00"}
                onChange={(e) => {
                  const current = hours[day.value] || { open: "09:00", close: "17:00" };
                  setHours({
                    ...hours,
                    [day.value]: { ...current, open: e.target.value },
                  });
                }}
                className="w-24"
              />
              <span>to</span>
              <Input
                type="time"
                value={hours[day.value]?.close || "17:00"}
                onChange={(e) => {
                  const current = hours[day.value] || { open: "09:00", close: "17:00" };
                  setHours({
                    ...hours,
                    [day.value]: { ...current, close: e.target.value },
                  });
                }}
                className="w-24"
              />
            </div>
          </div>
        ))}
        <div className="pt-4">
          <Button onClick={handleSubmit} disabled={updateHoursMutation.isPending}>
            Save Operating Hours
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
