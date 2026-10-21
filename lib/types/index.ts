// Core types for the restaurant scheduling system

export type Position =
  | 'Grill 1'
  | 'Grill 2'
  | 'P.O.S.'
  | 'Expo 1'
  | 'Expo 2'
  | 'Fries'
  | 'Lobby/Dish 1'
  | 'Lobby/Dish 2';

export type TimeSlot = '11am-12pm' | '12pm-1pm' | '1pm-2pm';

export type Seniority = 'GM' | 'AGM' | 'Captain' | 'Team Member';

export interface StaffMember {
  id: string;
  name: string;
  positions: Position[]; // Positions they can work
  preferences: PositionPreference[];
  availability: DayAvailability[];
  seniority: Seniority;
  /**
   * Every Toast employee GUID belonging to this person. The join key for
   * pulling the roster from Toast.
   *
   * An array, not a single value, even though this deployment is one store:
   * a human has a DIFFERENT Toast GUID at every location they can work, and
   * 20+ Forefathers staff pick up shifts away from their home store. One
   * value silently loses their shifts the day they cover elsewhere.
   *
   * Absent or empty means "not linked yet" -- the pull reports them rather
   * than guessing from the name.
   */
  toastGuids?: string[];
}

export interface DailyStaff {
  id: string;
  name: string;
  duration: '11-1pm' | '11-2pm' | '1-2pm' | '12-2pm';
}

export interface PositionPreference {
  position: Position;
  preferenceLevel: 1 | 2 | 3 | 4 | 5; // 1 = least preferred, 5 = most preferred
}

export interface DayAvailability {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 6 = Saturday
  available: boolean;
  timeSlots?: TimeSlot[]; // Specific time slots available, if not specified assumes all slots
}

export interface ShiftAssignment {
  id: string;
  staffId: string;
  position: Position;
  date: Date;
  timeSlot: TimeSlot;
}

export interface WeekSchedule {
  weekStartDate: Date;
  assignments: ShiftAssignment[];
}

export interface PositionHistory {
  staffId: string;
  position: Position;
  count: number; // How many times they've worked this position in the current period
  lastWorked?: Date;
}

/**
 * One person's Toast identity, as recorded in the My Forefathers database.
 *
 * This is the mapping that lets a Toast shift (which carries only a GUID)
 * name a human. It is READ from Supabase and never written here -- the
 * authority for it is Forecast86's `link_toast_employees.py`.
 */
export interface EmployeeLink {
  /** Legal name as Forefathers records it, e.g. "Antoinette McBride". */
  name: string;
  /** Every Toast GUID belonging to this person -- one per store they work. */
  toastGuids: string[];
  /** Forefathers level, e.g. "team_member" | "gm". Null when unset. */
  level: string | null;
  /** Home store, e.g. "tempe". Null when unset. */
  store: string | null;
}
