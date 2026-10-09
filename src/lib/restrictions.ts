/**
 * Pure, dependency-free helpers shared by the client (desk edit modal, floor
 * map panel) and the server (booking validation, match counts). Anything that
 * touches the database lives in src/server/booking/eligibility.ts instead —
 * this module is the single place the rule semantics are defined.
 */

export type RuleFieldType = "DEPARTMENT" | "EMAIL" | "USER" | "JOB_TITLE";
export type RuleOperator = "IS" | "IS_NOT" | "IS_ANY_OF" | "IS_NOT_ANY_OF" | "IS_EMPTY" | "IS_NOT_EMPTY";
export type RuleConnector = "AND" | "OR";
export type DeskRestrictionMode = "ANYONE" | "ASSIGNED_OCCUPANTS" | "DEPARTMENT" | "CUSTOM";

export interface RuleLike {
  fieldType: RuleFieldType;
  operator: RuleOperator;
  /** Stored as a JSON array of strings; older rows may hold a bare string. */
  value: unknown;
  connector?: RuleConnector | null;
  sortOrder?: number | null;
}

/** The employee fields a rule can inspect. Department and job title are matched by name (User.department / User.title). */
export interface RuleSubject {
  id: string;
  email: string;
  department: string | null;
  title: string | null;
}

export const RULE_FIELD_LABELS: Record<RuleFieldType, string> = {
  DEPARTMENT: "Department",
  EMAIL: "Email",
  USER: "User",
  JOB_TITLE: "Job title",
};

export const RULE_OPERATOR_LABELS: Record<RuleOperator, string> = {
  IS: "is",
  IS_NOT: "is not",
  IS_ANY_OF: "is any of",
  IS_NOT_ANY_OF: "is not any of",
  IS_EMPTY: "is empty",
  IS_NOT_EMPTY: "is not empty",
};

export const RULE_OPERATORS: RuleOperator[] = ["IS", "IS_NOT", "IS_ANY_OF", "IS_NOT_ANY_OF", "IS_EMPTY", "IS_NOT_EMPTY"];
export const RULE_FIELD_TYPES: RuleFieldType[] = ["DEPARTMENT", "JOB_TITLE", "EMAIL", "USER"];

export const DESK_RESTRICTION_MODE_LABELS: Record<DeskRestrictionMode, string> = {
  ANYONE: "None (Any occupant)",
  ASSIGNED_OCCUPANTS: "Only assigned occupants",
  DEPARTMENT: "Only people matching department",
  CUSTOM: "Custom restriction by employee field",
};

export const DESK_RESTRICTION_MODES: DeskRestrictionMode[] = ["ANYONE", "ASSIGNED_OCCUPANTS", "DEPARTMENT", "CUSTOM"];

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** "Mon, Wed, Fri" — always in calendar order regardless of storage order. */
export function formatDays(days: readonly number[]): string {
  const sorted = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (sorted.length === 0) return "No days";
  return sorted.map((d) => WEEKDAY_SHORT[d]).join(", ");
}

/** Sunday=0 … Saturday=6 for a plain YYYY-MM-DD calendar date (no time-zone shift). */
export function dayOfWeekForDate(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/** Whole calendar days from `fromDate` to `toDate` (both YYYY-MM-DD); negative when toDate is earlier. */
export function calendarDaysBetween(fromDate: string, toDate: string): number {
  const from = Date.UTC(Number(fromDate.slice(0, 4)), Number(fromDate.slice(5, 7)) - 1, Number(fromDate.slice(8, 10)));
  const to = Date.UTC(Number(toDate.slice(0, 4)), Number(toDate.slice(5, 7)) - 1, Number(toDate.slice(8, 10)));
  return Math.round((to - from) / 86_400_000);
}

export function ruleValues(rule: RuleLike): string[] {
  if (Array.isArray(rule.value)) return rule.value.filter((v): v is string => typeof v === "string");
  if (typeof rule.value === "string" && rule.value.length > 0) return [rule.value];
  return [];
}

const blankToNull = (value: string | null) => (value && value.trim().length > 0 ? value : null);

function subjectFieldValue(subject: RuleSubject, field: RuleFieldType): string | null {
  switch (field) {
    case "DEPARTMENT":
      return blankToNull(subject.department);
    case "JOB_TITLE":
      return blankToNull(subject.title);
    case "EMAIL":
      return subject.email;
    case "USER":
      return subject.id;
  }
}

const normalize = (value: string) => value.trim().toLowerCase();

/** Evaluates one rule row against one employee. */
export function matchesRule(rule: RuleLike, subject: RuleSubject): boolean {
  const actual = subjectFieldValue(subject, rule.fieldType);
  const values = ruleValues(rule).map(normalize);
  const contained = actual !== null && values.includes(normalize(actual));

  switch (rule.operator) {
    case "IS":
    case "IS_ANY_OF":
      return contained;
    case "IS_NOT":
    case "IS_NOT_ANY_OF":
      return !contained;
    case "IS_EMPTY":
      return actual === null;
    case "IS_NOT_EMPTY":
      return actual !== null;
  }
}

function sortedRules<T extends RuleLike>(rules: readonly T[]): T[] {
  return [...rules].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/**
 * Evaluates a restriction's rule list as OR-of-AND groups: consecutive rules
 * joined by AND form a group, OR starts a new group, and the employee matches
 * when any group is fully satisfied. A restriction with no rules matches
 * everyone (it restricts nothing).
 */
export function matchesRules(rules: readonly RuleLike[], subject: RuleSubject): boolean {
  const ordered = sortedRules(rules);
  if (ordered.length === 0) return true;

  const groups: RuleLike[][] = [];
  for (const [index, rule] of ordered.entries()) {
    const connector = index === 0 ? "OR" : (rule.connector ?? "OR");
    if (connector === "OR" || groups.length === 0) groups.push([rule]);
    else groups[groups.length - 1]!.push(rule);
  }

  return groups.some((group) => group.every((rule) => matchesRule(rule, subject)));
}

export interface RuleDescriptionOptions {
  /** Resolves USER-field ids to display names; unknown ids fall back to the raw id. */
  resolveUser?: (id: string) => string | undefined;
  /** Truncate long value lists to this many items (adds "+N more"). */
  maxValues?: number;
}

/** Human-readable summary, e.g. "Department is any of Sales, Marketing or Email is a@b.com". */
export function describeRules(rules: readonly RuleLike[], options: RuleDescriptionOptions = {}): string {
  const ordered = sortedRules(rules);
  if (ordered.length === 0) return "No rules — matches everyone";

  return ordered
    .map((rule, index) => {
      const field = RULE_FIELD_LABELS[rule.fieldType];
      const operator = RULE_OPERATOR_LABELS[rule.operator];
      let values = ruleValues(rule);
      if (rule.fieldType === "USER" && options.resolveUser) {
        values = values.map((id) => options.resolveUser!(id) ?? id);
      }
      let valueText = values.join(", ");
      if (options.maxValues && values.length > options.maxValues) {
        valueText = `${values.slice(0, options.maxValues).join(", ")} +${values.length - options.maxValues} more`;
      }
      const clause = rule.operator === "IS_EMPTY" || rule.operator === "IS_NOT_EMPTY" ? `${field} ${operator}` : `${field} ${operator} ${valueText}`;
      return index === 0 ? clause : `${(rule.connector ?? "OR").toLowerCase()} ${clause}`;
    })
    .join(" ");
}

/** Weekdays that appear in more than one restriction block on the same desk. */
export function findOverlappingDays(blocks: ReadonlyArray<{ daysOfWeek: readonly number[] }>): number[] {
  const seen = new Map<number, number>();
  for (const block of blocks) {
    for (const day of new Set(block.daysOfWeek)) seen.set(day, (seen.get(day) ?? 0) + 1);
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([day]) => day)
    .sort((a, b) => a - b);
}
