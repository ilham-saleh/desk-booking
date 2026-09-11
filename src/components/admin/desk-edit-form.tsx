"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const deskFormSchema = z.object({
  number: z.string().min(1, "Desk number is required"),
  name: z.string().optional(),
  x: z.number().min(0),
  y: z.number().min(0),
  spaceType: z.string().optional(),
});

type DeskFormInput = z.infer<typeof deskFormSchema>;

interface DeskEditFormProps {
  floorId: string;
  deskId?: string | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function DeskEditForm({ floorId, deskId, onSaved, onCancel }: DeskEditFormProps) {
  const form = useForm<DeskFormInput>({
    resolver: zodResolver(deskFormSchema),
    defaultValues: { number: "", name: "", x: 0, y: 0, spaceType: "" },
  });

  const createDesk = api.desk.createDesk.useMutation();
  const updateDesk = api.desk.updateDesk.useMutation();
  const { data: existingDesk } = api.desk.get.useQuery(
    { deskId: deskId ?? "" },
    { enabled: !!deskId },
  );

  useEffect(() => {
    if (existingDesk) {
      form.reset({
        number: existingDesk.number,
        name: existingDesk.name || "",
        x: existingDesk.x,
        y: existingDesk.y,
        spaceType: existingDesk.spaceType || "",
      });
    }
  }, [existingDesk, form]);

  const handleSubmitAsync = async (data: DeskFormInput) => {
    try {
      if (deskId) {
        await updateDesk.mutateAsync({
          deskId,
          floorId,
          number: data.number,
          name: data.name,
          x: data.x,
          y: data.y,
          spaceType: data.spaceType,
        });
      } else {
        await createDesk.mutateAsync({
          floorId,
          number: data.number,
          name: data.name,
          x: data.x,
          y: data.y,
          spaceType: data.spaceType,
        });
      }
      onSaved();
    } catch (error) {
      form.setError("root", {
        message: error instanceof Error ? error.message : "Failed to save desk",
      });
    }
  };

  return (
    <Form {...form}>
      {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
      <form onSubmit={form.handleSubmit(handleSubmitAsync)} className="space-y-4">
        <FormField
          control={form.control}
          name="number"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Desk Number *</FormLabel>
              <FormControl>
                <Input placeholder="e.g., 5.52" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name (optional)</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Corner by window" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="x"
            render={({ field }) => (
              <FormItem>
                <FormLabel>X Position</FormLabel>
                <FormControl>
                  <Input type="number" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="y"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Y Position</FormLabel>
                <FormControl>
                  <Input type="number" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="spaceType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Space Type (optional)</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Open, Private, Meeting" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {form.formState.errors.root && (
          <div className="rounded bg-red-50 p-2 text-sm text-red-800">{form.formState.errors.root.message}</div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={createDesk.isPending || updateDesk.isPending}>
            {deskId ? "Update" : "Create"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
