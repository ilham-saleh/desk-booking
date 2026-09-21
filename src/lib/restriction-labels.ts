import type { DeskRestrictionMode } from "@/lib/restrictions";

/**
 * Display label for a restriction block's audience — shared by the Floor Map
 * panel, the desks table and the server's error messages (re-exported there).
 */
export function describeAssignmentAudience(assignment: {
  restrictionMode: DeskRestrictionMode;
  restriction: { name: string } | null;
  departmentNames: string[];
  occupants: ReadonlyArray<{ user?: { name: string } | null }>;
}): string {
  switch (assignment.restrictionMode) {
    case "ANYONE":
      return "Anyone can book";
    case "ASSIGNED_OCCUPANTS": {
      const names = assignment.occupants.map((o) => o.user?.name).filter((n): n is string => !!n);
      if (names.length === 0) return "Assigned occupants only";
      return names.length <= 2 ? names.join(" & ") : `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
    }
    case "DEPARTMENT":
      return assignment.departmentNames.length === 0
        ? "Department only"
        : assignment.departmentNames.length === 1
          ? `${assignment.departmentNames[0]} department`
          : `${assignment.departmentNames.slice(0, 3).join(", ")}${assignment.departmentNames.length > 3 ? ` +${assignment.departmentNames.length - 3} more` : ""}`;
    case "CUSTOM":
      return assignment.restriction?.name ?? "Custom restriction (removed)";
  }
}
