"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { api } from "@/lib/trpc/client";
import { restrictionCreateInputSchema, type RestrictionCreateInput } from "@/server/api/routers/restriction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

interface Rule {
  fieldType: "DEPARTMENT" | "EMAIL" | "USER";
  operator: "IS" | "IS_NOT" | "IS_ANY_OF" | "IS_NOT_ANY_OF";
  value: string | string[];
}

interface RestrictionFormProps {
  mode: "create" | "edit";
  initialData?: {
    id: string;
    name: string;
    rules: Array<{
      fieldType: "DEPARTMENT" | "EMAIL" | "USER";
      operator: "IS" | "IS_NOT" | "IS_ANY_OF" | "IS_NOT_ANY_OF";
      value: string | string[];
    }>;
  };
  onSuccess?: () => void;
}

export function RestrictionForm({ mode, initialData, onSuccess }: RestrictionFormProps) {
  const [rules, setRules] = useState<Rule[]>(
    initialData?.rules?.map((r) => ({
      fieldType: r.fieldType,
      operator: r.operator,
      value: r.value,
    })) || [],
  );

  const form = useForm<RestrictionCreateInput>({
    resolver: zodResolver(restrictionCreateInputSchema),
    defaultValues: {
      name: initialData?.name || "",
      rules: undefined,
    },
  });

  const createMutation = api.restriction.createRestriction.useMutation({
    onSuccess: () => {
      toast.success("Restriction created");
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const updateMutation = api.restriction.updateRestriction.useMutation({
    onSuccess: () => {
      toast.success("Restriction updated");
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const onSubmit = (data: RestrictionCreateInput) => {
    if (mode === "create") {
      createMutation.mutate({
        name: data.name,
        rules: rules.length > 0 ? rules : undefined,
      });
    } else if (mode === "edit" && initialData) {
      updateMutation.mutate({
        restrictionId: initialData.id,
        name: data.name,
        rules: rules.length > 0 ? rules : undefined,
      });
    }
  };

  const addRule = () => {
    setRules([
      ...rules,
      { fieldType: "DEPARTMENT" as const, operator: "IS_ANY_OF" as const, value: [] },
    ]);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const updateRule = (index: number, updates: Partial<Rule>) => {
    const updated = [...rules];
    updated[index] = {
      ...updated[index],
      ...updates,
    } as Rule;
    setRules(updated);
  };

  return (
    <Form {...form}>
      {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Restriction Name *</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., Editorial Only, Credit & Equities"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Rules */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <FormLabel>Restriction Rules</FormLabel>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRule}
              className="gap-2"
            >
              <Plus className="size-4" />
              Add Rule
            </Button>
          </div>

          {rules.length === 0 ? (
            <p className="text-sm text-gray-500">No rules (Anyone can book)</p>
          ) : (
            <div className="space-y-3">
              {rules.map((rule, idx) => (
                <div key={idx} className="border rounded p-3 space-y-3 bg-gray-50">
                  <div className="grid grid-cols-3 gap-2">
                    {/* Field Type */}
                    <Select
                      value={rule.fieldType}
                      onValueChange={(val) =>
                        updateRule(idx, { fieldType: val as "DEPARTMENT" | "EMAIL" | "USER" })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DEPARTMENT">Department</SelectItem>
                        <SelectItem value="EMAIL">Email</SelectItem>
                        <SelectItem value="USER">User</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Operator */}
                    <Select
                      value={rule.operator}
                      onValueChange={(val) =>
                        updateRule(idx, { operator: val as "IS" | "IS_NOT" | "IS_ANY_OF" | "IS_NOT_ANY_OF" })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IS">IS</SelectItem>
                        <SelectItem value="IS_NOT">IS NOT</SelectItem>
                        <SelectItem value="IS_ANY_OF">IS ANY OF</SelectItem>
                        <SelectItem value="IS_NOT_ANY_OF">IS NOT ANY OF</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Delete */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRule(idx)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  {/* Value Input */}
                  <div>
                    <Label className="text-xs text-gray-600">
                      Value (comma-separated for multiple)
                    </Label>
                    <Input
                      placeholder={
                        rule.fieldType === "DEPARTMENT"
                          ? "e.g., Engineering, Sales"
                          : rule.fieldType === "EMAIL"
                            ? "e.g., user@example.com"
                            : "User ID or email"
                      }
                      value={Array.isArray(rule.value) ? rule.value.join(", ") : rule.value}
                      onChange={(e) => {
                        const vals = e.target.value
                          .split(",")
                          .map((v) => v.trim())
                          .filter(Boolean);
                        updateRule(idx, {
                          value: vals.length > 1 ? vals : vals[0] || "",
                        });
                      }}
                      className="mt-1"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-4">
          <Button
            type="submit"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {mode === "create" ? "Create Restriction" : "Update Restriction"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
