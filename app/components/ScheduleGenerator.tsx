'use client';

import { useState, useEffect } from 'react';
import { Position, TimeSlot, StaffMember, PositionPreference, DailyStaff } from '@/lib/types';
import { ALL_POSITIONS, TIME_SLOTS } from '@/lib/constants';

interface ScheduleAssignment {
  position: Position;
  staffName: string;
  staffId: string;
}

interface StaffWithPreferences extends DailyStaff {
  preferences: PositionPreference[];
  availableSlots: TimeSlot[];
  seniority: 'GM' | 'AGM' | 'Captain' | 'Team Member';
}

const getHotPositionType = (pos: Position): string => {
  if (pos === 'Grill 1' || pos === 'Grill 2') return 'Grill';
  if (pos === 'Fries') return 'Fries';
  return '';
};

export default function ScheduleGenerator() {
  const [schedule, setSchedule] = useState<Record<TimeSlot, ScheduleAssignment[]> | null>(null);
  const [dailyStaff, setDailyStaff] = useState<DailyStaff[]>([]);
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [grillOpener, setGrillOpener] = useState<string>('');
  const [activePositions, setActivePositions] = useState<Position[]>(ALL_POSITIONS);
  const [history, setHistory] = useState<any[]>([]);
  const [oneGrillerOnly, setOneGrillerOnly] = useState<boolean>(false);
  const [pendingGenerate, setPendingGenerate] = useState<boolean>(false);

  // Load data from localStorage
  useEffect(() => {
    const savedDailyStaff = localStorage.getItem('dailyStaff');
    const savedAllStaff = localStorage.getItem('staff');
    const savedGrillOpener = localStorage.getItem('grillOpener');
    const savedHistory = localStorage.getItem('scheduleHistory');
    const savedOneGrillerOnly = localStorage.getItem('oneGrillerOnly');
    const savedSchedule = localStorage.getItem('currentSchedule');
    const savedActivePositions = localStorage.getItem('currentActivePositions');

    if (savedDailyStaff) {
      try {
        setDailyStaff(JSON.parse(savedDailyStaff));
      } catch (error) {
        console.error('Error loading daily staff:', error);
      }
    }

    if (savedAllStaff) {
      try {
        setAllStaff(JSON.parse(savedAllStaff));
      } catch (error) {
        console.error('Error loading staff:', error);
      }
    }

    if (savedGrillOpener) {
      setGrillOpener(savedGrillOpener);
    }

    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (error) {
        console.error('Error loading history:', error);
      }
    }

    if (savedOneGrillerOnly) {
      setOneGrillerOnly(savedOneGrillerOnly === 'true');
    }

    // Load previously generated schedule if exists
    if (savedSchedule) {
      try {
        setSchedule(JSON.parse(savedSchedule));
      } catch (error) {
        console.error('Error loading schedule:', error);
      }
    }

    if (savedActivePositions) {
      try {
        setActivePositions(JSON.parse(savedActivePositions));
      } catch (error) {
        console.error('Error loading active positions:', error);
      }
    }
  }, []);

  // Listen for auto-generate event from Dashboard
  useEffect(() => {
    const handleAutoGenerate = () => {
      // Reload data from localStorage and trigger generation
      const savedDailyStaff = localStorage.getItem('dailyStaff');
      if (savedDailyStaff) {
        try {
          const parsedStaff = JSON.parse(savedDailyStaff);
          setDailyStaff(parsedStaff);
          setPendingGenerate(true);
        } catch (error) {
          console.error('Error loading daily staff:', error);
        }
      }
    };

    window.addEventListener('generateSchedule', handleAutoGenerate);
    return () => window.removeEventListener('generateSchedule', handleAutoGenerate);
  }, []);

  // Auto-generate when triggered by Dashboard event
  useEffect(() => {
    if (pendingGenerate && dailyStaff.length > 0) {
      setPendingGenerate(false);
      generateSchedule();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingGenerate, dailyStaff]);

  // Get position frequency for a staff member from history
  const getPositionFrequency = (staffId: string, position: Position): number => {
    let count = 0;
    history.forEach(entry => {
      if (entry.schedule) {
        Object.values(entry.schedule).forEach((slotAssignments: any) => {
          slotAssignments.forEach((assignment: any) => {
            if (assignment.staffId === staffId && assignment.position === position) {
              count++;
            }
          });
        });
      }
    });
    return count;
  };

  const getPreferenceForPosition = (preferences: PositionPreference[], position: Position): number => {
    // Map Grill 2 to Grill 1 preferences, Lobby/Dish 2 to Lobby/Dish 1
    let lookupPosition = position;
    if (position === 'Grill 2') lookupPosition = 'Grill 1';
    if (position === 'Lobby/Dish 2') lookupPosition = 'Lobby/Dish 1';

    const pref = preferences.find(p => p.position === lookupPosition);
    return pref?.preferenceLevel || 3; // Default to neutral if not found
  };

  const generateSchedule = () => {
    if (dailyStaff.length === 0) {
      alert('No staff selected for today. Please go to the Dashboard and select who is working.');
      return;
    }

    if (dailyStaff.length < 5) {
      alert(`Warning: You have ${dailyStaff.length} staff members. You need at least 5 staff to create a schedule.`);
      return;
    }

    // Determine which positions to use based on staff count and time slot
    // For 6 people: 11-12 & 12-1 need 2 grillers (busy), 1-2 needs lobby/dish (slow)
    const getPositionsForSlotAndCount = (slot: TimeSlot, count: number): Position[] => {
      if (oneGrillerOnly) {
        // One griller only mode (e.g., slow Sundays)
        if (count === 5) {
          return ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2'];
        } else if (count === 6) {
          return ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2', 'Lobby/Dish 1'];
        } else if (count === 7) {
          return ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2', 'Lobby/Dish 1', 'Lobby/Dish 2'];
        } else {
          // 8+ people: Skip Grill 2
          return ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2', 'Lobby/Dish 1', 'Lobby/Dish 2'];
        }
      } else {
        // Normal mode
        if (count === 5) {
          // 5 people: Essential positions only
          return ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2'];
        } else if (count === 6) {
          // 6 people: Different positions for busy vs slow periods
          if (slot === '1pm-2pm') {
            // Slow period: 1 griller + Lobby/Dish
            return ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2', 'Lobby/Dish 1'];
          } else {
            // Busy periods: 2 grillers, no Lobby/Dish
            return ['P.O.S.', 'Grill 1', 'Grill 2', 'Expo 1', 'Expo 2', 'Fries'];
          }
        } else if (count === 7) {
          // 7 people: Essential + Lobby/Dish 1 + Grill 2 (except Grill 2 removed from 1-2pm later)
          return ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2', 'Lobby/Dish 1', 'Grill 2'];
        } else if (count === 8) {
          // 8 people: All positions
          return [...ALL_POSITIONS];
        } else {
          // 9+ people: All positions
          return [...ALL_POSITIONS];
        }
      }
    };

    // We'll use this function per time slot instead of a single positionsToUse array

    // Define hot positions
    const HOT_POSITIONS: Position[] = ['Grill 1', 'Grill 2', 'Fries'];

    // Helper to get seniority rank (lower number = more senior)
    const getSeniorityRank = (seniority: string): number => {
      switch (seniority) {
        case 'GM': return 1;
        case 'AGM': return 2;
        case 'Captain': return 3;
        case 'Team Member': return 4;
        default: return 4;
      }
    };

    // Combine daily staff with their preferences
    const staffWithPreferences: StaffWithPreferences[] = dailyStaff.map(ds => {
      const fullStaffData = allStaff.find(s => s.id === ds.id);

      // Map duration to available time slots
      let availableSlots: TimeSlot[] = [];
      switch (ds.duration) {
        case '11-2pm':
          availableSlots = ['11am-12pm', '12pm-1pm', '1pm-2pm'];
          break;
        case '11-1pm':
          availableSlots = ['11am-12pm', '12pm-1pm'];
          break;
        case '12-2pm':
          availableSlots = ['12pm-1pm', '1pm-2pm'];
          break;
        case '1-2pm':
          availableSlots = ['1pm-2pm'];
          break;
      }

      return {
        ...ds,
        preferences: fullStaffData?.preferences || [],
        availableSlots,
        seniority: fullStaffData?.seniority || 'Team Member',
      };
    });

    // Generate schedule using rotation algorithm
    const newSchedule: Record<TimeSlot, ScheduleAssignment[]> = {
      '11am-12pm': [],
      '12pm-1pm': [],
      '1pm-2pm': [],
    };

    // Track position assignments for each staff member to ensure rotation
    const staffPositionHistory: Record<string, Set<Position>> = {};
    const staffHotPositionCount: Record<string, number> = {};
    const staffHotPositionTypes: Record<string, Set<string>> = {}; // Track which hot position types worked
    staffWithPreferences.forEach(s => {
      staffPositionHistory[s.id] = new Set();
      staffHotPositionCount[s.id] = 0;
      staffHotPositionTypes[s.id] = new Set();
    });

    // Assign positions for each time slot
    TIME_SLOTS.forEach((slot, slotIndex) => {
      const availableStaff = staffWithPreferences.filter(s => s.availableSlots.includes(slot));
      const assignments: ScheduleAssignment[] = [];
      const assignedStaff = new Set<string>();
      const assignedPositions = new Set<Position>();

      // Get positions for this specific time slot and staff count
      const positionsForSlot = getPositionsForSlotAndCount(slot, dailyStaff.length);

      // Define essential positions based on slot and staff count
      // For 6 people during busy hours (11-12, 12-1), Grill 2 is essential
      let essentialPositions: Position[] = ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2'];
      if (dailyStaff.length === 6 && (slot === '11am-12pm' || slot === '12pm-1pm') && !oneGrillerOnly) {
        essentialPositions = ['P.O.S.', 'Grill 1', 'Grill 2', 'Expo 1', 'Expo 2', 'Fries'];
      }

      // Score all available staff for a given position and return the best match
      const scoreStaffForPosition = (position: Position, availableStaff: StaffWithPreferences[], assignedStaff: Set<string>): { staffId: string; staffName: string } | null => {
        const staffScores: Array<{ staffId: string; staffName: string; score: number }> = [];

        availableStaff.forEach(staff => {
          if (assignedStaff.has(staff.id)) return;

          const isHotPosition = HOT_POSITIONS.includes(position);
          const isFirstSlot = slot === '11am-12pm';
          const isGrillOpener = staff.id === grillOpener;

          // Skip grill opener for hot positions during 11-12pm
          if (isGrillOpener && isHotPosition && isFirstSlot) return;

          // Hard block: never assign same position twice in one day
          if (staffPositionHistory[staff.id].has(position)) return;

          const preference = getPreferenceForPosition(staff.preferences, position);
          const historicalFrequency = getPositionFrequency(staff.id, position);

          // Check if this person worked this position at this time slot yesterday
          const workedSameSlotYesterday = (() => {
            if (history.length === 0) return false;
            const yesterdaySchedule = history[0];
            if (!yesterdaySchedule.schedule) return false;
            const yesterdaySlotAssignments = yesterdaySchedule.schedule[slot];
            if (!yesterdaySlotAssignments) return false;
            return yesterdaySlotAssignments.some((assignment: any) =>
              assignment.staffId === staff.id && assignment.position === position
            );
          })();

          // Heavy penalty for second hot position assignment
          let hotPositionPenalty = 0;
          if (isHotPosition && staffHotPositionCount[staff.id] >= 1) {
            const seniorityRank = getSeniorityRank(staff.seniority);
            hotPositionPenalty = 1000 - (seniorityRank * 50);
            if (staffHotPositionTypes[staff.id].has(getHotPositionType(position))) {
              hotPositionPenalty += 500;
            }
          }

          const sameSlotYesterdayPenalty = workedSameSlotYesterday ? 500 : 0;
          const varietyBonus = 2;
          const historyPenalty = historicalFrequency * 0.5;
          const score = preference + varietyBonus - historyPenalty - hotPositionPenalty - sameSlotYesterdayPenalty;

          staffScores.push({ staffId: staff.id, staffName: staff.name, score });
        });

        staffScores.sort((a, b) => b.score - a.score);
        return staffScores.length > 0 ? staffScores[0] : null;
      };

      // Assign a list of positions using the scoring algorithm
      const assignPositions = (positions: Position[]) => {
        positions.forEach(position => {
          const best = scoreStaffForPosition(position, availableStaff, assignedStaff);
          if (best) {
            assignments.push({ position, staffName: best.staffName, staffId: best.staffId });
            assignedStaff.add(best.staffId);
            assignedPositions.add(position);
            staffPositionHistory[best.staffId].add(position);
            if (HOT_POSITIONS.includes(position)) {
              staffHotPositionCount[best.staffId]++;
              staffHotPositionTypes[best.staffId].add(getHotPositionType(position));
            }
          } else {
            assignments.push({ position, staffName: 'UNFILLED', staffId: '' });
            assignedPositions.add(position);
          }
        });
      };

      // Phase 1: Fill essential positions first
      assignPositions(positionsForSlot.filter(p => essentialPositions.includes(p)));

      // Phase 2: Fill remaining non-essential positions
      assignPositions(positionsForSlot.filter(p => !essentialPositions.includes(p)));

      newSchedule[slot] = assignments;
    });

    // Collect all unique positions used across all slots
    const allPositionsUsed = new Set<Position>();
    TIME_SLOTS.forEach(slot => {
      const positions = getPositionsForSlotAndCount(slot, dailyStaff.length);
      positions.forEach(p => allPositionsUsed.add(p));
    });
    const activePositionsArray = Array.from(allPositionsUsed);

    setSchedule(newSchedule);
    setActivePositions(activePositionsArray);

    // Save current schedule to localStorage
    localStorage.setItem('currentSchedule', JSON.stringify(newSchedule));
    localStorage.setItem('currentActivePositions', JSON.stringify(activePositionsArray));

    // Update history with the generated schedule
    const currentDate = localStorage.getItem('currentDate') || new Date().toISOString().split('T')[0];
    const historyKey = 'scheduleHistory';
    const existingHistory = localStorage.getItem(historyKey);
    let updatedHistory: any[] = existingHistory ? JSON.parse(existingHistory) : [];

    // Find and update entry for current date
    const dateIndex = updatedHistory.findIndex(h => h.date === currentDate);
    if (dateIndex >= 0) {
      updatedHistory[dateIndex].schedule = newSchedule;
    } else {
      // Entry doesn't exist yet (shouldn't happen, but handle gracefully)
      updatedHistory.push({
        date: currentDate,
        staff: dailyStaff,
        grillOpener: grillOpener,
        schedule: newSchedule,
      });
    }

    // Keep only last 7 days
    updatedHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    updatedHistory = updatedHistory.slice(0, 7);

    localStorage.setItem(historyKey, JSON.stringify(updatedHistory));
    setHistory(updatedHistory);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Generate Today's Rotation Schedule</h2>
        <p className="text-gray-600 mb-6">
          Generate the lunch rush rotation schedule for today. Staff will rotate through all 8 positions
          across the three time slots (11am-12pm, 12pm-1pm, 1pm-2pm) based on their preferences.
        </p>
        <button
          onClick={generateSchedule}
          className="px-6 py-3 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
        >
          Generate Schedule
        </button>
      </div>

      {schedule && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-xl font-bold text-gray-900">Rotation Schedule</h3>
            <p className="text-sm font-medium text-gray-600 mt-1">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Position
                  </th>
                  {TIME_SLOTS.map(slot => (
                    <th key={slot} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {slot}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {activePositions
                  // Sort positions to ensure Grill 2 appears right after Grill 1
                  .sort((a, b) => {
                    const order: Position[] = [
                      'Grill 1',
                      'Grill 2',
                      'P.O.S.',
                      'Expo 1',
                      'Expo 2',
                      'Fries',
                      'Lobby/Dish 1',
                      'Lobby/Dish 2'
                    ];
                    return order.indexOf(a) - order.indexOf(b);
                  })
                  .map((position) => {
                  // Check if this position has any assigned staff (not UNFILLED)
                  const hasAssignments = TIME_SLOTS.some(slot => {
                    const assignment = schedule[slot].find(a => a.position === position);
                    return assignment && assignment.staffName !== 'UNFILLED';
                  });

                  // Check if this position appears in any slot (even if UNFILLED)
                  const appearsInSchedule = TIME_SLOTS.some(slot => {
                    const assignment = schedule[slot].find(a => a.position === position);
                    return assignment !== undefined;
                  });

                  // Only render row if position has assignments OR appears in schedule
                  if (!hasAssignments && !appearsInSchedule) return null;

                  return (
                    <tr key={position}>
                      <td className="px-6 py-4 whitespace-nowrap text-base font-bold text-gray-900">
                        {position}
                      </td>
                      {TIME_SLOTS.map(slot => {
                        const assignment = schedule[slot].find(a => a.position === position);
                        const staffName = assignment?.staffName;

                        return (
                          <td key={slot} className="px-6 py-4 whitespace-nowrap text-center">
                            {staffName && staffName !== 'UNFILLED' ? (
                              <span className="inline-flex items-center px-4 py-2 rounded-lg text-lg font-bold bg-blue-100 text-blue-900">
                                {staffName}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-6 bg-gray-50 border-t border-gray-200">
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700"
            >
              Print Schedule
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
