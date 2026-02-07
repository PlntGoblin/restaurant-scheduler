'use client';

import { useState, useEffect } from 'react';
import { Position, TimeSlot, StaffMember, PositionPreference } from '@/lib/types';

const ALL_POSITIONS: Position[] = [
  'Grill 1',
  'Grill 2',
  'P.O.S.',
  'Expo 1',
  'Expo 2',
  'Fries',
  'Lobby/Dish 1',
  'Lobby/Dish 2',
];

const TIME_SLOTS: TimeSlot[] = ['11am-12pm', '12pm-1pm', '1pm-2pm'];

interface DailyStaff {
  id: string;
  name: string;
  duration: '11-1pm' | '11-2pm' | '1-2pm' | '12-2pm';
}

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

export default function ScheduleGenerator() {
  const [schedule, setSchedule] = useState<Record<TimeSlot, ScheduleAssignment[]> | null>(null);
  const [dailyStaff, setDailyStaff] = useState<DailyStaff[]>([]);
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [grillOpener, setGrillOpener] = useState<string>('');
  const [activePositions, setActivePositions] = useState<Position[]>(ALL_POSITIONS);
  const [history, setHistory] = useState<any[]>([]);
  const [oneGrillerOnly, setOneGrillerOnly] = useState<boolean>(false);

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

          // Set a flag to trigger generation
          setTimeout(() => {
            const generateBtn = document.querySelector('[data-generate-btn]') as HTMLButtonElement;
            if (generateBtn) {
              generateBtn.click();
            }
          }, 300);
        } catch (error) {
          console.error('Error loading daily staff:', error);
        }
      }
    };

    window.addEventListener('generateSchedule', handleAutoGenerate);
    return () => window.removeEventListener('generateSchedule', handleAutoGenerate);
  }, []);

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

    // Determine which positions to use based on staff count
    // Priority order: POS, Grill 1, Expo 1, Fries, Expo 2, then Lobby/Dish 1, then Grill 2, then Lobby/Dish 2
    let positionsToUse: Position[] = [];

    if (oneGrillerOnly) {
      // One griller only mode (e.g., slow Sundays)
      if (dailyStaff.length === 5) {
        positionsToUse = ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2'];
      } else if (dailyStaff.length === 6) {
        positionsToUse = ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2', 'Lobby/Dish 1'];
      } else if (dailyStaff.length === 7) {
        positionsToUse = ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2', 'Lobby/Dish 1', 'Lobby/Dish 2'];
      } else {
        // 8+ people: Skip Grill 2
        positionsToUse = ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2', 'Lobby/Dish 1', 'Lobby/Dish 2'];
      }
    } else {
      // Normal mode
      if (dailyStaff.length === 5) {
        // 5 people: Essential positions only (POS, Grill 1, Expo 1, Fries, Expo 2)
        positionsToUse = ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2'];
      } else if (dailyStaff.length === 6) {
        // 6 people: Essential + Lobby/Dish 1
        positionsToUse = ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2', 'Lobby/Dish 1'];
      } else if (dailyStaff.length === 7) {
        // 7 people: Essential + Lobby/Dish 1 + Grill 2
        positionsToUse = ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2', 'Lobby/Dish 1', 'Grill 2'];
      } else if (dailyStaff.length === 8) {
        // 8 people: All positions
        positionsToUse = [...ALL_POSITIONS];
      } else {
        // 9+ people: All positions (will have UNFILLED for extras)
        positionsToUse = [...ALL_POSITIONS];
      }
    }

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

    // Define essential positions that must always be filled
    const ESSENTIAL_POSITIONS: Position[] = ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2'];

    // Assign positions for each time slot
    TIME_SLOTS.forEach((slot, slotIndex) => {
      const availableStaff = staffWithPreferences.filter(s => s.availableSlots.includes(slot));
      const assignments: ScheduleAssignment[] = [];
      const assignedStaff = new Set<string>();
      const assignedPositions = new Set<Position>();

      // Filter positions for this slot - Remove Grill 2 from 1-2pm
      let positionsForSlot = positionsToUse;
      if (slot === '1pm-2pm') {
        positionsForSlot = positionsToUse.filter(p => p !== 'Grill 2');
      }

      // PHASE 1: Fill essential positions first
      const essentialPositionsInSlot = positionsForSlot.filter(p => ESSENTIAL_POSITIONS.includes(p));

      essentialPositionsInSlot.forEach(position => {
        const staffScores: Array<{
          staffId: string;
          staffName: string;
          score: number;
        }> = [];

        availableStaff.forEach(staff => {
          if (assignedStaff.has(staff.id)) return;

          // Skip grill opener for hot positions during 11-12pm
          const isHotPosition = HOT_POSITIONS.includes(position);
          const isFirstSlot = slot === '11am-12pm';
          const isGrillOpener = staff.id === grillOpener;

          if (isGrillOpener && isHotPosition && isFirstSlot) {
            return;
          }

          const preference = getPreferenceForPosition(staff.preferences, position);
          const hasWorkedPosition = staffPositionHistory[staff.id].has(position);
          const historicalFrequency = getPositionFrequency(staff.id, position);
          const currentHotPositionCount = staffHotPositionCount[staff.id];

          // Check if this person worked this position at this time slot yesterday
          const workedSameSlotYesterday = (() => {
            if (history.length === 0) return false;
            const yesterdaySchedule = history[0]; // Most recent schedule
            if (!yesterdaySchedule.schedule) return false;

            const yesterdaySlotAssignments = yesterdaySchedule.schedule[slot];
            if (!yesterdaySlotAssignments) return false;

            return yesterdaySlotAssignments.some((assignment: any) =>
              assignment.staffId === staff.id && assignment.position === position
            );
          })();

          // Get hot position type (Grill 1 and Grill 2 are both "Grill")
          const getHotPositionType = (pos: Position): string => {
            if (pos === 'Grill 1' || pos === 'Grill 2') return 'Grill';
            if (pos === 'Fries') return 'Fries';
            return '';
          };

          // Heavy penalty for second hot position assignment
          let hotPositionPenalty = 0;
          if (isHotPosition && currentHotPositionCount >= 1) {
            // Already worked a hot position - huge penalty
            // But less penalty for senior staff (they can handle it better if needed)
            const seniorityRank = getSeniorityRank(staff.seniority);
            hotPositionPenalty = 1000 - (seniorityRank * 50); // GM: 950, AGM: 900, Captain: 850, Team: 800

            // Extra penalty if it's the same hot position type (e.g., Grill twice)
            const currentPositionType = getHotPositionType(position);
            if (staffHotPositionTypes[staff.id].has(currentPositionType)) {
              hotPositionPenalty += 500; // Huge penalty for same type twice
            }
          }

          // MASSIVE penalty for working same position twice in one day
          const samePositionTodayPenalty = hasWorkedPosition ? 10000 : 0;

          // Large penalty for working same position at same time slot as yesterday
          const sameSlotYesterdayPenalty = workedSameSlotYesterday ? 500 : 0;

          const varietyBonus = hasWorkedPosition ? 0 : 2;
          const historyPenalty = historicalFrequency * 0.5;
          const score = preference + varietyBonus - historyPenalty - hotPositionPenalty - samePositionTodayPenalty - sameSlotYesterdayPenalty;

          staffScores.push({
            staffId: staff.id,
            staffName: staff.name,
            score,
          });
        });

        // Assign best available staff to this essential position
        staffScores.sort((a, b) => b.score - a.score);
        if (staffScores.length > 0) {
          const bestStaff = staffScores[0];
          assignments.push({
            position,
            staffName: bestStaff.staffName,
            staffId: bestStaff.staffId,
          });
          assignedStaff.add(bestStaff.staffId);
          assignedPositions.add(position);
          staffPositionHistory[bestStaff.staffId].add(position);
          // Track hot position assignments
          if (HOT_POSITIONS.includes(position)) {
            staffHotPositionCount[bestStaff.staffId]++;
            // Track hot position type for diversity
            const posType = position === 'Grill 1' || position === 'Grill 2' ? 'Grill' : 'Fries';
            staffHotPositionTypes[bestStaff.staffId].add(posType);
          }
        } else {
          // No available staff for this essential position
          assignments.push({
            position,
            staffName: 'UNFILLED',
            staffId: '',
          });
          assignedPositions.add(position);
        }
      });

      // PHASE 2: Fill remaining non-essential positions
      const nonEssentialPositions = positionsForSlot.filter(p => !ESSENTIAL_POSITIONS.includes(p));

      nonEssentialPositions.forEach(position => {
        const staffScores: Array<{
          staffId: string;
          staffName: string;
          score: number;
        }> = [];

        availableStaff.forEach(staff => {
          if (assignedStaff.has(staff.id)) return;

          // Skip grill opener for hot positions during 11-12pm
          const isHotPosition = HOT_POSITIONS.includes(position);
          const isFirstSlot = slot === '11am-12pm';
          const isGrillOpener = staff.id === grillOpener;

          if (isGrillOpener && isHotPosition && isFirstSlot) {
            return;
          }

          const preference = getPreferenceForPosition(staff.preferences, position);
          const hasWorkedPosition = staffPositionHistory[staff.id].has(position);
          const historicalFrequency = getPositionFrequency(staff.id, position);
          const currentHotPositionCount = staffHotPositionCount[staff.id];

          // Check if this person worked this position at this time slot yesterday
          const workedSameSlotYesterday = (() => {
            if (history.length === 0) return false;
            const yesterdaySchedule = history[0]; // Most recent schedule
            if (!yesterdaySchedule.schedule) return false;

            const yesterdaySlotAssignments = yesterdaySchedule.schedule[slot];
            if (!yesterdaySlotAssignments) return false;

            return yesterdaySlotAssignments.some((assignment: any) =>
              assignment.staffId === staff.id && assignment.position === position
            );
          })();

          // Get hot position type (Grill 1 and Grill 2 are both "Grill")
          const getHotPositionType = (pos: Position): string => {
            if (pos === 'Grill 1' || pos === 'Grill 2') return 'Grill';
            if (pos === 'Fries') return 'Fries';
            return '';
          };

          // Heavy penalty for second hot position assignment
          let hotPositionPenalty = 0;
          if (isHotPosition && currentHotPositionCount >= 1) {
            // Already worked a hot position - huge penalty
            // But less penalty for senior staff (they can handle it better if needed)
            const seniorityRank = getSeniorityRank(staff.seniority);
            hotPositionPenalty = 1000 - (seniorityRank * 50); // GM: 950, AGM: 900, Captain: 850, Team: 800

            // Extra penalty if it's the same hot position type (e.g., Grill twice)
            const currentPositionType = getHotPositionType(position);
            if (staffHotPositionTypes[staff.id].has(currentPositionType)) {
              hotPositionPenalty += 500; // Huge penalty for same type twice
            }
          }

          // MASSIVE penalty for working same position twice in one day
          const samePositionTodayPenalty = hasWorkedPosition ? 10000 : 0;

          // Large penalty for working same position at same time slot as yesterday
          const sameSlotYesterdayPenalty = workedSameSlotYesterday ? 500 : 0;

          const varietyBonus = hasWorkedPosition ? 0 : 2;
          const historyPenalty = historicalFrequency * 0.5;
          const score = preference + varietyBonus - historyPenalty - hotPositionPenalty - samePositionTodayPenalty - sameSlotYesterdayPenalty;

          staffScores.push({
            staffId: staff.id,
            staffName: staff.name,
            score,
          });
        });

        // Assign best available staff to this non-essential position
        staffScores.sort((a, b) => b.score - a.score);
        if (staffScores.length > 0) {
          const bestStaff = staffScores[0];
          assignments.push({
            position,
            staffName: bestStaff.staffName,
            staffId: bestStaff.staffId,
          });
          assignedStaff.add(bestStaff.staffId);
          assignedPositions.add(position);
          staffPositionHistory[bestStaff.staffId].add(position);
          // Track hot position assignments
          if (HOT_POSITIONS.includes(position)) {
            staffHotPositionCount[bestStaff.staffId]++;
            // Track hot position type for diversity
            const posType = position === 'Grill 1' || position === 'Grill 2' ? 'Grill' : 'Fries';
            staffHotPositionTypes[bestStaff.staffId].add(posType);
          }
        } else {
          // No available staff for this position
          assignments.push({
            position,
            staffName: 'UNFILLED',
            staffId: '',
          });
          assignedPositions.add(position);
        }
      });

      newSchedule[slot] = assignments;
    });

    setSchedule(newSchedule);
    setActivePositions(positionsToUse);

    // Save current schedule to localStorage
    localStorage.setItem('currentSchedule', JSON.stringify(newSchedule));
    localStorage.setItem('currentActivePositions', JSON.stringify(positionsToUse));

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
          data-generate-btn
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

                  // Only render row if position has assignments
                  if (!hasAssignments) return null;

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
