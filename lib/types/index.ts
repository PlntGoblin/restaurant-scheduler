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
  email: string;
  positions: Position[]; // Positions they can work
  preferences: PositionPreference[];
  availability: DayAvailability[];
  seniority: Seniority;
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
