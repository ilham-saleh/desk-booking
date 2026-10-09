import { describe, expect, it } from "vitest";

import { calendarDaysBetween, dayOfWeekForDate, describeRules, findOverlappingDays, formatDays, matchesRules } from "@/lib/restrictions";
import { evaluateDeskEligibility, type EligibilityDesk } from "@/server/booking/eligibility";

const engineering = { id: "u1", email: "eng@example.test", department: "Engineering", title: "Senior Software Engineer" };
const sales = { id: "u2", email: "sales@example.test", department: "Sales", title: "Account Executive" };
const noDepartment = { id: "u3", email: "new@example.test", department: null, title: null };

describe("matchesRules", () => {
  it("matches everyone when there are no rules", () => {
    expect(matchesRules([], sales)).toBe(true);
  });

  it("evaluates is / is any of against department names case-insensitively", () => {
    const rules = [{ fieldType: "DEPARTMENT" as const, operator: "IS_ANY_OF" as const, value: ["engineering", "Product"] }];
    expect(matchesRules(rules, engineering)).toBe(true);
    expect(matchesRules(rules, sales)).toBe(false);
    expect(matchesRules(rules, noDepartment)).toBe(false);
  });

  it("treats OR as separate groups and AND as one group", () => {
    const rules = [
      { fieldType: "DEPARTMENT" as const, operator: "IS" as const, value: ["Sales"], connector: "OR" as const, sortOrder: 0 },
      { fieldType: "EMAIL" as const, operator: "IS_NOT" as const, value: ["sales@example.test"], connector: "AND" as const, sortOrder: 1 },
      { fieldType: "USER" as const, operator: "IS_ANY_OF" as const, value: ["u1"], connector: "OR" as const, sortOrder: 2 },
    ];
    // Group 1: Sales AND email != sales@ → sales fails group 1; Group 2: user u1 → engineering matches.
    expect(matchesRules(rules, sales)).toBe(false);
    expect(matchesRules(rules, engineering)).toBe(true);
    expect(matchesRules(rules, { id: "u9", email: "other@example.test", department: "Sales", title: null })).toBe(true);
  });

  it("supports is empty / is not empty", () => {
    expect(matchesRules([{ fieldType: "DEPARTMENT", operator: "IS_EMPTY", value: [] }], noDepartment)).toBe(true);
    expect(matchesRules([{ fieldType: "DEPARTMENT", operator: "IS_EMPTY", value: [] }], sales)).toBe(false);
    expect(matchesRules([{ fieldType: "DEPARTMENT", operator: "IS_NOT_EMPTY", value: [] }], sales)).toBe(true);
  });

  it("tolerates legacy bare-string values", () => {
    expect(matchesRules([{ fieldType: "DEPARTMENT", operator: "IS", value: "Sales" }], sales)).toBe(true);
  });

  it("matches job titles case-insensitively and treats a blank title as empty", () => {
    const rules = [{ fieldType: "JOB_TITLE" as const, operator: "IS_ANY_OF" as const, value: ["senior software engineer", "Staff Engineer"] }];
    expect(matchesRules(rules, engineering)).toBe(true);
    expect(matchesRules(rules, sales)).toBe(false);
    expect(matchesRules(rules, noDepartment)).toBe(false);

    expect(matchesRules([{ fieldType: "JOB_TITLE", operator: "IS_NOT", value: ["Account Executive"] }], sales)).toBe(false);
    expect(matchesRules([{ fieldType: "JOB_TITLE", operator: "IS_EMPTY", value: [] }], noDepartment)).toBe(true);
    expect(matchesRules([{ fieldType: "JOB_TITLE", operator: "IS_EMPTY", value: [] }], { ...sales, title: "  " })).toBe(true);
    expect(matchesRules([{ fieldType: "JOB_TITLE", operator: "IS_NOT_EMPTY", value: [] }], sales)).toBe(true);
  });

  it("combines job title with department using AND", () => {
    const rules = [
      { fieldType: "DEPARTMENT" as const, operator: "IS" as const, value: ["Engineering"], sortOrder: 0 },
      { fieldType: "JOB_TITLE" as const, operator: "IS" as const, value: ["Senior Software Engineer"], connector: "AND" as const, sortOrder: 1 },
    ];
    expect(matchesRules(rules, engineering)).toBe(true);
    expect(matchesRules(rules, { ...engineering, title: "Graduate Engineer" })).toBe(false);
  });
});

describe("helpers", () => {
  it("describes rules for humans", () => {
    const text = describeRules([
      { fieldType: "DEPARTMENT", operator: "IS_ANY_OF", value: ["A", "B"], sortOrder: 0 },
      { fieldType: "EMAIL", operator: "IS", value: ["x@y.z"], connector: "OR", sortOrder: 1 },
    ]);
    expect(text).toBe("Department is any of A, B or Email is x@y.z");
  });

  it("finds weekdays covered by more than one block", () => {
    expect(findOverlappingDays([{ daysOfWeek: [1, 5] }, { daysOfWeek: [3] }, { daysOfWeek: [5, 4] }])).toEqual([5]);
    expect(findOverlappingDays([{ daysOfWeek: [1] }, { daysOfWeek: [2] }])).toEqual([]);
  });

  it("formats days in calendar order and derives weekday from a plain date", () => {
    expect(formatDays([5, 1])).toBe("Mon, Fri");
    expect(dayOfWeekForDate("2026-09-16")).toBe(3); // a Wednesday
    expect(calendarDaysBetween("2026-09-01", "2026-10-01")).toBe(30);
  });
});

describe("evaluateDeskEligibility", () => {
  const shift = (id: string, name: string, daysOfWeek: number[]) => ({ id, name, daysOfWeek });
  const technology = {
    id: "r1",
    name: "Technology",
    isActive: true,
    rules: [{ fieldType: "DEPARTMENT" as const, operator: "IS_ANY_OF" as const, value: ["Engineering", "Product", "Technology"] }],
  };
  const block = (partial: Partial<EligibilityDesk["restrictionAssignments"][number]> & Pick<EligibilityDesk["restrictionAssignments"][number], "id" | "restrictionMode" | "shift">) => ({
    advanceBookingWindowDays: null,
    departmentNames: [],
    occupants: [],
    restriction: null,
    ...partial,
  });
  const desk: EligibilityDesk = {
    id: "d1",
    number: "2.21",
    isActive: true,
    archivedAt: null,
    assignedOccupantId: null,
    restrictionAssignments: [
      block({ id: "a1", restrictionMode: "ANYONE", shift: shift("s1", "Mon + Fri", [1, 5]) }),
      block({ id: "a2", restrictionMode: "ANYONE", advanceBookingWindowDays: 7, shift: shift("s2", "Tuesday Only", [2]) }),
      block({ id: "a3", restrictionMode: "CUSTOM", shift: shift("s3", "Wednesday Only", [3]), restriction: technology }),
      block({ id: "a4", restrictionMode: "DEPARTMENT", departmentNames: ["Sales", "Marketing"], shift: shift("s4", "Thursday Only", [4]) }),
    ],
  };
  const today = "2026-09-14"; // Monday

  it("picks the block for the requested weekday", () => {
    const monday = evaluateDeskEligibility({ desk, occupant: sales, date: "2026-09-14", today });
    expect(monday.eligible).toBe(true);
    expect(monday.assignment?.id).toBe("a1");
  });

  it("admits a matching department on the custom-restriction day and rejects others with a clear reason", () => {
    expect(evaluateDeskEligibility({ desk, occupant: engineering, date: "2026-09-16", today }).eligible).toBe(true);
    const rejected = evaluateDeskEligibility({ desk, occupant: sales, date: "2026-09-16", today });
    expect(rejected.eligible).toBe(false);
    expect(rejected.status).toBe("RESTRICTION_MISMATCH");
    expect(rejected.reason).toBe("Desk 2.21 is restricted to Technology on Wednesdays.");
  });

  it("admits only the block's departments for DEPARTMENT blocks", () => {
    expect(evaluateDeskEligibility({ desk, occupant: sales, date: "2026-09-17", today }).eligible).toBe(true);
    expect(evaluateDeskEligibility({ desk, occupant: { ...sales, department: "marketing" }, date: "2026-09-17", today }).eligible).toBe(true);
    const rejected = evaluateDeskEligibility({ desk, occupant: engineering, date: "2026-09-17", today });
    expect(rejected.status).toBe("DEPARTMENT_MISMATCH");
    expect(rejected.reason).toBe("Desk 2.21 is restricted to the Sales, Marketing departments on Thursdays.");
  });

  it("leaves days no block covers open to anyone", () => {
    const saturday = evaluateDeskEligibility({ desk, occupant: noDepartment, date: "2026-09-19", today });
    expect(saturday.eligible).toBe(true);
    expect(saturday.assignment).toBeNull();
  });

  it("only narrows the covered days: Mon+Wed anyone, Thu one department, Tue/Fri open", () => {
    const partial: EligibilityDesk = {
      ...desk,
      number: "2.04",
      restrictionAssignments: [
        block({ id: "b1", restrictionMode: "ANYONE", shift: shift("s5", "Mon & Wed", [1, 3]) }),
        block({ id: "b2", restrictionMode: "DEPARTMENT", departmentNames: ["Engineering"], shift: shift("s6", "Thursday Only", [4]) }),
      ],
    };
    const check = (occupant: typeof sales, date: string) => evaluateDeskEligibility({ desk: partial, occupant, date, today });
    for (const date of ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-18"]) {
      expect(check(sales, date).eligible).toBe(true); // Mon, Tue, Wed, Fri
    }
    expect(check(sales, "2026-09-15").assignment).toBeNull(); // Tuesday: no block applies
    expect(check(engineering, "2026-09-17").eligible).toBe(true); // Thursday: Engineering admitted
    const thursday = check(sales, "2026-09-17");
    expect(thursday.status).toBe("DEPARTMENT_MISMATCH");
    expect(thursday.reason).toBe("Desk 2.04 is restricted to the Engineering department on Thursdays.");
  });

  it("enforces the advance-booking window", () => {
    const farTuesday = evaluateDeskEligibility({ desk, occupant: sales, date: "2026-10-13", today });
    expect(farTuesday.status).toBe("OUTSIDE_ADVANCE_WINDOW");
    expect(farTuesday.reason).toContain("7 days in advance");
  });

  it("treats a desk with no blocks as open, and an inactive desk as unbookable", () => {
    const open = { ...desk, restrictionAssignments: [] };
    expect(evaluateDeskEligibility({ desk: open, occupant: noDepartment, date: "2026-09-19", today }).eligible).toBe(true);
    expect(evaluateDeskEligibility({ desk: { ...desk, isActive: false }, occupant: sales, date: "2026-09-14", today }).status).toBe("DESK_INACTIVE");
  });

  it("only lets the block's occupants (or the desk's permanent occupant) use ASSIGNED_OCCUPANTS blocks", () => {
    const reserved: EligibilityDesk = {
      ...desk,
      assignedOccupantId: "u3",
      restrictionAssignments: [block({ id: "a5", restrictionMode: "ASSIGNED_OCCUPANTS", occupants: [{ userId: "u2" }], shift: shift("s5", "Mon–Fri", [1, 2, 3, 4, 5]) })],
    };
    expect(evaluateDeskEligibility({ desk: reserved, occupant: sales, date: "2026-09-14", today }).eligible).toBe(true);
    expect(evaluateDeskEligibility({ desk: reserved, occupant: noDepartment, date: "2026-09-14", today }).eligible).toBe(true);
    expect(evaluateDeskEligibility({ desk: reserved, occupant: engineering, date: "2026-09-14", today }).status).toBe("NOT_ASSIGNED_OCCUPANT");
  });
});
