'use client';

import { Position, TimeSlot } from '@/lib/types';
import { TIME_SLOTS } from '@/lib/constants';
import { POSITION_PILL } from '@/lib/positionStyle';
import { UNFILLED } from '@/lib/rotation';
import { useLocalJSON } from '@/lib/clientStore';

interface HistoryEntry {
  date: string;
  staff: Array<{ id: string; name: string; duration: string }>;
  grillOpener: string;
  schedule?: Record<TimeSlot, Array<{ position: Position; staffName: string; staffId: string }>>;
}

const HISTORY_KEY = 'scheduleHistory';

/** Module-level: both feed useCallback deps inside useLocalJSON. */
const NO_HISTORY: HistoryEntry[] = [];
const isHistory = (value: unknown): value is HistoryEntry[] => Array.isArray(value);

export default function History() {
  // Read straight from localStorage as an external store rather than
  // setState-ing from a mount effect: the Generator writes this same key, and
  // the prerender needs an answer that does not touch `localStorage`.
  const history = useLocalJSON(HISTORY_KEY, NO_HISTORY, isHistory);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Schedule History</h2>
        <p className="text-gray-600 mb-6">
          View the past 7 days of staff assignments. The algorithm uses this data to ensure variety in position assignments.
        </p>
      </div>

      {history.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <p className="text-gray-500">No schedule history yet. Create and save schedules to see them here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {history.map((entry) => (
            <div key={entry.date} className="glass rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-gray-200 bg-gray-50">
                <h3 className="text-xl font-semibold text-gray-900">
                  {formatDate(entry.date)}
                </h3>
                {entry.grillOpener && (
                  <p className="text-sm text-gray-600 mt-1">
                    Grill Opener: {entry.staff.find(s => s.id === entry.grillOpener)?.name || 'Unknown'}
                  </p>
                )}
              </div>
              <div className="p-6">
                <h4 className="text-sm font-bold text-gray-900 mb-3">Staff Working ({entry.staff.length} people)</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {entry.staff.map(staff => (
                    <div key={staff.id} className="flex items-center space-x-2 text-sm">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {staff.duration}
                      </span>
                      <span className="text-gray-900">{staff.name}</span>
                    </div>
                  ))}
                </div>

                {entry.schedule && (
                  <div className="mt-6">
                    <h4 className="text-sm font-bold text-gray-900 mb-3">Generated Schedule</h4>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 border border-gray-200">
                        <thead className="bg-gray-50/60">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Position</th>
                            {TIME_SLOTS.map(slot => (
                              <th key={slot} className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                                {slot}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white/40 divide-y divide-gray-200">
                          {(() => {
                            // Get unique positions from schedule
                            const positions = new Set<Position>();
                            Object.values(entry.schedule!).forEach(assignments => {
                              assignments.forEach(a => positions.add(a.position));
                            });
                            return Array.from(positions).map(position => (
                              <tr key={position}>
                                <td className="px-4 py-2 whitespace-nowrap text-xs font-medium text-gray-900">
                                  {position}
                                </td>
                                {TIME_SLOTS.map(slot => {
                                  const assignment = entry.schedule![slot].find(a => a.position === position);
                                  return (
                                    <td key={slot} className="px-4 py-2 whitespace-nowrap text-center">
                                      {assignment?.staffName && assignment.staffName !== UNFILLED ? (
                                        <span
                                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold shadow-sm ${POSITION_PILL}`}
                                        >
                                          {assignment.staffName}
                                        </span>
                                      ) : (
                                        <span className="text-gray-400">-</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
