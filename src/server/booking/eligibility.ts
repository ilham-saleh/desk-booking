import {
  WEEKDAY_LONG,
  calendarDaysBetween,
  dayOfWeekForDate,
  formatDays,
  matchesRules,
  type DeskRestrictionMode,
  type RuleLike,
  type RuleSubject,
} from "@/lib/restrictions";

/**
 * The one desk-eligibility engine (CLAUDE.md §18). Pure: callers load the desk
 * with its restriction blocks and pass the occupant in; the same function
 * backs booking creation, the Floor Map's "why can't I book this" panel and
 * the per-desk restricted state. All checks use the OCCUPANT, never the
 * person creating the booking (§19).
 */

export interface EligibilityShift {
  id: string;
  name: string;
  daysOfWeek: number[];
  startTimeMinutes: number | null;
  endTimeMinutes: number | null;
}

export interface EligibilityRestriction {
  id: string;
  name: string;
  isActive: boolean;
  rules: RuleLike[];
}

export interface EligibilityAssignment {
  id: string;
  restrictionMode: DeskRestrictionMode;
  advanceBookingWindowDays: number | null;
  /** DEPARTMENT blocks: admitted department names (compared case-insensitively with User.department). */
  departmentNames: string[];
  /** ASSIGNED_OCCUPANTS blocks: admitted people. */
  occupants: ReadonlyArray<{ userId: string }>;
  shift: EligibilityShift;
  restriction: EligibilityRestriction | null;
}

export interface EligibilityDesk {
  id: string;
  number: string;
  isActive: boolean;
  archivedAt: Date | null;
  /** Permanent occupant (assign mode "Assigned Desk") — also admitted by ASSIGNED_OCCUPANTS blocks. */
  assignedOccupantId: string | null;
  restrictionAssignments: EligibilityAssignment[];
}

export interface EligibilityInput {
  desk: EligibilityDesk;
  /** Null for guest bookings (admin-only): day availability is still checked. */
  occupant: RuleSubject | null;
  /** Site-local calendar date being booked, YYYY-MM-DD. */
  date: string;
  /** Today's site-local calendar date, YYYY-MM-DD — for the advance-booking window. */
  today: string;
  /** Requested slot (minutes from midnight, site-local) — checked against a shift's optional time window. */
  startMinutes?: number;
  endMinutes?: number;
}

export type EligibilityStatus =
  | "ELIGIBLE"
  | "DESK_INACTIVE"
  | "NO_SHIFT_FOR_DAY"
  | "OUTSIDE_SHIFT_HOURS"
  | "NOT_ASSIGNED_OCCUPANT"
  | "DEPARTMENT_MISMATCH"
  | "RESTRICTION_MISMATCH"
  | "RESTRICTION_UNAVAILABLE"
  | "OUTSIDE_ADVANCE_WINDOW";

export interface EligibilityResult {
  eligible: boolean;
  status: EligibilityStatus;
  /** Actionable, user-safe explanation (null when eligible). */
  reason: string | null;
  /** The restriction block that governs this date, if any. */
  assignment: EligibilityAssignment | null;
  dayOfWeek: number;
}

export { describeAssignmentAudience } from "@/lib/restriction-labels";

const dayName = (dayOfWeek: number) => WEEKDAY_LONG[dayOfWeek] ?? "that day";
const plural = (dayOfWeek: number) => `${dayName(dayOfWeek)}s`;

export function evaluateDeskEligibility(input: EligibilityInput): EligibilityResult {
  const { desk, occupant, date, today } = input;
  const dayOfWeek = dayOfWeekForDate(date);
  const fail = (status: EligibilityStatus, reason: string, assignment: EligibilityAssignment | null = null): EligibilityResult => ({
    eligible: false,
    status,
    reason,
    assignment,
    dayOfWeek,
  });

  if (!desk.isActive || desk.archivedAt) {
    return fail("DESK_INACTIVE", `Desk ${desk.number} is inactive and can't be booked.`);
  }

  // No restriction blocks at all: the desk is open to anyone on any working day.
  if (desk.restrictionAssignments.length === 0) {
    return { eligible: true, status: "ELIGIBLE", reason: null, assignment: null, dayOfWeek };
  }

  const assignment = desk.restrictionAssignments.find((a) => a.shift.daysOfWeek.includes(dayOfWeek));
  if (!assignment) {
    const available = [...new Set(desk.restrictionAssignments.flatMap((a) => a.shift.daysOfWeek))];
    return fail(
      "NO_SHIFT_FOR_DAY",
      `Desk ${desk.number} isn't available on ${plural(dayOfWeek)}. It can be booked on ${formatDays(available)}.`,
    );
  }

  const { shift } = assignment;
  if (
    shift.startTimeMinutes != null &&
    shift.endTimeMinutes != null &&
    input.startMinutes !== undefined &&
    input.endMinutes !== undefined &&
    (input.startMinutes < shift.startTimeMinutes || input.endMinutes > shift.endTimeMinutes)
  ) {
    return fail(
      "OUTSIDE_SHIFT_HOURS",
      `On ${plural(dayOfWeek)} desk ${desk.number} is only bookable between ${formatMinutes(shift.startTimeMinutes)} and ${formatMinutes(shift.endTimeMinutes)}.`,
      assignment,
    );
  }

  if (assignment.advanceBookingWindowDays != null) {
    const daysAhead = calendarDaysBetween(today, date);
    if (daysAhead > assignment.advanceBookingWindowDays) {
      return fail(
        "OUTSIDE_ADVANCE_WINDOW",
        `Desk ${desk.number} can only be booked up to ${assignment.advanceBookingWindowDays} days in advance on ${plural(dayOfWeek)}.`,
        assignment,
      );
    }
  }

  // Guest bookings have no employee record to match; only open blocks admit them.
  switch (assignment.restrictionMode) {
    case "ANYONE":
      break;
    case "ASSIGNED_OCCUPANTS": {
      const admitted = new Set(assignment.occupants.map((o) => o.userId));
      if (desk.assignedOccupantId) admitted.add(desk.assignedOccupantId);
      if (!occupant || !admitted.has(occupant.id)) {
        return fail(
          "NOT_ASSIGNED_OCCUPANT",
          `Desk ${desk.number} is reserved for its assigned occupant${admitted.size === 1 ? "" : "s"} on ${plural(dayOfWeek)}.`,
          assignment,
        );
      }
      break;
    }
    case "DEPARTMENT": {
      const admitted = assignment.departmentNames.map((n) => n.trim().toLowerCase());
      const occupantDepartment = occupant?.department?.trim().toLowerCase() ?? null;
      if (occupantDepartment === null || !admitted.includes(occupantDepartment)) {
        const label = assignment.departmentNames.length === 1 ? `the ${assignment.departmentNames[0]} department` : `the ${assignment.departmentNames.join(", ")} departments`;
        return fail("DEPARTMENT_MISMATCH", `Desk ${desk.number} is restricted to ${label} on ${plural(dayOfWeek)}.`, assignment);
      }
      break;
    }
    case "CUSTOM": {
      const restriction = assignment.restriction;
      if (!restriction || !restriction.isActive) {
        return fail(
          "RESTRICTION_UNAVAILABLE",
          `Desk ${desk.number}'s restriction for ${plural(dayOfWeek)} was removed. Ask a workplace admin to update the desk.`,
          assignment,
        );
      }
      if (!occupant || !matchesRules(restriction.rules, occupant)) {
        return fail(
          "RESTRICTION_MISMATCH",
          `Desk ${desk.number} is restricted to ${restriction.name} on ${plural(dayOfWeek)}.`,
          assignment,
        );
      }
      break;
    }
  }

  return { eligible: true, status: "ELIGIBLE", reason: null, assignment, dayOfWeek };
}

function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The Prisma `include` every eligibility caller needs on a Desk. */
export const eligibilityDeskInclude = {
  restrictionAssignments: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      shift: true,
      restriction: { include: { rules: { orderBy: { sortOrder: "asc" as const } } } },
      occupants: { select: { userId: true, user: { select: { id: true, name: true, email: true } } } },
    },
  },
} as const;
