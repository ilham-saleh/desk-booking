import {
  WEEKDAY_LONG,
  calendarDaysBetween,
  dayOfWeekForDate,
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

/**
 * Shifts are day-based: admins pick weekdays and occupants choose their own
 * time within site operating hours. (AvailabilityShift's legacy time-window
 * columns are not enforced.)
 */
export interface EligibilityShift {
  id: string;
  name: string;
  daysOfWeek: number[];
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
}

export type EligibilityStatus =
  | "ELIGIBLE"
  | "DESK_INACTIVE"
  | "NOT_ASSIGNED_OCCUPANT"
  | "DEPARTMENT_MISMATCH"
  | "RESTRICTION_MISMATCH"
  | "RESTRICTION_UNAVAILABLE"
  | "OUTSIDE_ADVANCE_WINDOW"
  | "GUEST_NOT_ALLOWED";

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

  // Guests aren't in the employee directory, so they may only use desks that
  // carry no people-based restriction at all (no department / assigned-occupant /
  // custom block on any day, and not an assigned desk). Day-based "Anyone"
  // shifts still apply below.
  if (occupant === null && !isGuestBookable(desk)) {
    return fail(
      "GUEST_NOT_ALLOWED",
      `Desk ${desk.number} has booking restrictions and can't be booked for a guest. Choose a desk without restrictions.`,
    );
  }

  // Restriction blocks only narrow the days their shift covers. A day no block
  // covers (or a desk with no blocks at all) is open to anyone — site operating
  // days and hours are enforced separately by booking validation.
  const assignment = desk.restrictionAssignments.find((a) => a.shift.daysOfWeek.includes(dayOfWeek));
  if (!assignment) {
    return { eligible: true, status: "ELIGIBLE", reason: null, assignment: null, dayOfWeek };
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

/** A desk a guest may be booked into: no assigned occupant and no restriction block other than "Anyone". */
export function isGuestBookable(desk: Pick<EligibilityDesk, "assignedOccupantId" | "restrictionAssignments">): boolean {
  return desk.assignedOccupantId === null && desk.restrictionAssignments.every((a) => a.restrictionMode === "ANYONE");
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
