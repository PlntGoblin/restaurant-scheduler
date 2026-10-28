'use client';

import { useState, useEffect } from 'react';
import { Position, StaffMember, DailyStaff } from '@/lib/types';
import { ALL_POSITIONS, TIME_SLOTS } from '@/lib/constants';
import { POSITION_PILL } from '@/lib/positionStyle';
import { todayLocal } from '@/lib/toast/time';
import { generateRotation, slotsForDuration, MIN_STAFF, UNFILLED, type HistoryDay, type Schedule } from '@/lib/rotation';

export default function ScheduleGenerator() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  // The no-consecutive-hot rule had to bend to fill today's grid.
  const [relaxed, setRelaxed] = useState<boolean>(false);
  const [dailyStaff, setDailyStaff] = useState<DailyStaff[]>([]);
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [grillOpener, setGrillOpener] = useState<string>('');
  const [activePositions, setActivePositions] = useState<Position[]>(ALL_POSITIONS);
  const [history, setHistory] = useState<HistoryDay[]>([]);
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

  const generateSchedule = () => {
    if (dailyStaff.length === 0) {
      alert('No staff selected for today. Please go to the Dashboard and select who is working.');
      return;
    }

    if (dailyStaff.length < MIN_STAFF) {
      alert(`Warning: You have ${dailyStaff.length} staff members. You need at least ${MIN_STAFF} staff to create a schedule.`);
      return;
    }

    const result = generateRotation({
      staff: dailyStaff.map(ds => {
        const record = allStaff.find(s => s.id === ds.id);
        return {
          id: ds.id,
          // The roster row's name is a snapshot from pull time; the staff
          // record is the living one. Prefer it so a rename in Staff
          // Management shows up on the generated grid immediately.
          name: record?.name ?? ds.name,
          availableSlots: slotsForDuration(ds.duration),
          preferences: record?.preferences ?? [],
        };
      }),
      grillOpener,
      oneGrillerOnly,
      history,
    });
    const newSchedule = result.schedule;
    const activePositionsArray = result.activePositions;

    setSchedule(newSchedule);
    setActivePositions(activePositionsArray);
    setRelaxed(result.relaxed);

    // Save current schedule to localStorage
    localStorage.setItem('currentSchedule', JSON.stringify(newSchedule));
    localStorage.setItem('currentActivePositions', JSON.stringify(activePositionsArray));

    // Update history with the generated schedule
    // todayLocal() rather than toISOString(), which is UTC and rolls over to
    // tomorrow mid-afternoon Phoenix time -- filing the schedule under the
    // wrong day in History. Matches the Dashboard's date exactly.
    const currentDate = localStorage.getItem('currentDate') || todayLocal();
    const historyKey = 'scheduleHistory';
    const existingHistory = localStorage.getItem(historyKey);
    let updatedHistory: HistoryDay[] = existingHistory ? JSON.parse(existingHistory) : [];

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
    updatedHistory.sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
    updatedHistory = updatedHistory.slice(0, 7);

    localStorage.setItem(historyKey, JSON.stringify(updatedHistory));
    setHistory(updatedHistory);
  };

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Generate Today's Rotation Schedule</h2>
        <p className="text-gray-600 mb-6">
          Generate the lunch rush rotation schedule for today. Staff will rotate through all 8 positions
          across the three time slots (11am-12pm, 12pm-1pm, 1pm-2pm) based on their preferences.
        </p>
        <button
          onClick={() => generateSchedule()}
          className="px-6 py-3 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700"
        >
          Generate Schedule
        </button>
      </div>

      {schedule && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-xl font-bold text-gray-900">Rotation Schedule</h3>
            <p className="text-sm font-medium text-gray-600 mt-1">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
            {relaxed && (
              <p className="mt-2 text-sm font-medium text-amber-700">
                Today&apos;s shift times don&apos;t leave enough people to keep everyone off hot stations two hours in a row. Someone is hot back to back.
              </p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50/60">
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
              <tbody className="bg-white/40 divide-y divide-gray-200">
                {activePositions
                  // Sort positions to ensure Grill 2 appears right after Grill 1
                  .sort((a, b) => {
                    const order: Position[] = [
                      'Grill 1',
                      'Grill 2',
                      'P.O.S.',
                      'Fries',
                      'Expo 1',
                      'Expo 2',
                      'Lobby/Dish 1',
                      'Lobby/Dish 2'
                    ];
                    return order.indexOf(a) - order.indexOf(b);
                  })
                  .map((position) => {
                  // Check if this position has any assigned staff (not UNFILLED)
                  const hasAssignments = TIME_SLOTS.some(slot => {
                    const assignment = schedule[slot].find(a => a.position === position);
                    return assignment && assignment.staffName !== UNFILLED;
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
                            {staffName && staffName !== UNFILLED ? (
                              <span
                                className={`inline-flex items-center rounded-xl px-4 py-2 text-lg font-bold shadow-lg ${POSITION_PILL}`}
                              >
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

          <div className="p-6 bg-gray-50 border-t border-gray-200 flex space-x-3">
            <button
              onClick={() => generateSchedule()}
              className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700"
            >
              Shuffle
            </button>
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
