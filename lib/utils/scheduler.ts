import {
  StaffMember,
  Position,
  ShiftAssignment,
  PositionHistory,
  WeekSchedule,
  TimeSlot,
} from '@/lib/types';

interface SchedulingConfig {
  positionsNeeded: {
    position: Position;
    timeSlot: TimeSlot;
    count: number;
  }[];
}

/**
 * Calculate a score for assigning a staff member to a position
 * Higher score = better fit
 */
function calculateAssignmentScore(
  staff: StaffMember,
  position: Position,
  timeSlot: TimeSlot,
  dayOfWeek: number,
  positionHistory: PositionHistory[]
): number {
  let score = 0;

  // Check if they can work this position
  if (!staff.positions.includes(position)) {
    return -1000; // Cannot work this position
  }

  // Check availability
  const availability = staff.availability.find(a => a.dayOfWeek === dayOfWeek);
  if (!availability || !availability.available) {
    return -1000; // Not available this day
  }

  // Check time slot availability
  if (availability.timeSlots && !availability.timeSlots.includes(timeSlot)) {
    return -1000; // Not available for this time slot
  }

  // Preference score (0-50 points)
  const preference = staff.preferences.find(p => p.position === position);
  if (preference) {
    score += preference.preferenceLevel * 10;
  }

  // Balance workload - penalize if they've worked this position a lot recently
  const history = positionHistory.find(h => h.staffId === staff.id && h.position === position);
  if (history) {
    score -= history.count * 5; // Subtract 5 points per time they've worked this position
  }

  // Bonus for variety - prefer giving different positions
  const totalWorkedCount = positionHistory
    .filter(h => h.staffId === staff.id)
    .reduce((sum, h) => sum + h.count, 0);

  if (totalWorkedCount < 5) {
    score += 10; // Bonus for staff who haven't worked much this week
  }

  return score;
}

/**
 * Generate a weekly schedule based on staff preferences and position history
 */
export function generateWeeklySchedule(
  staff: StaffMember[],
  weekStartDate: Date,
  config: SchedulingConfig,
  previousHistory: PositionHistory[] = []
): WeekSchedule {
  const assignments: ShiftAssignment[] = [];
  const positionHistory = [...previousHistory];

  // For each day of the week
  for (let day = 0; day < 7; day++) {
    const currentDate = new Date(weekStartDate);
    currentDate.setDate(currentDate.getDate() + day);
    const dayOfWeek = currentDate.getDay();

    // For each position needed on this day
    for (const need of config.positionsNeeded) {
      const { position, timeSlot, count } = need;

      // Find best staff for this position
      const candidates = staff
        .map(s => ({
          staff: s,
          score: calculateAssignmentScore(s, position, timeSlot, dayOfWeek, positionHistory),
        }))
        .filter(c => c.score > -1000) // Filter out unavailable staff
        .sort((a, b) => b.score - a.score); // Sort by score descending

      // Assign top candidates
      for (let i = 0; i < Math.min(count, candidates.length); i++) {
        const candidate = candidates[i];

        // Create assignment
        const assignment: ShiftAssignment = {
          id: `${candidate.staff.id}-${currentDate.toISOString()}-${position}-${timeSlot}`,
          staffId: candidate.staff.id,
          position,
          date: currentDate,
          timeSlot,
        };

        assignments.push(assignment);

        // Update position history
        const historyEntry = positionHistory.find(
          h => h.staffId === candidate.staff.id && h.position === position
        );

        if (historyEntry) {
          historyEntry.count += 1;
          historyEntry.lastWorked = currentDate;
        } else {
          positionHistory.push({
            staffId: candidate.staff.id,
            position,
            count: 1,
            lastWorked: currentDate,
          });
        }

        // Remove this candidate from future consideration for this time slot
        candidates.splice(i, 1);
        i--;
      }
    }
  }

  return {
    weekStartDate,
    assignments,
  };
}

/**
 * Get the start of the week (Sunday) for a given date
 */
export function getWeekStart(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = result.getDate() - day;
  result.setDate(diff);
  result.setHours(0, 0, 0, 0);
  return result;
}
