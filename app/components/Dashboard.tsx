'use client';

import { useState, useEffect, useRef } from 'react';
import { DailyStaff } from '@/lib/types';

interface DashboardProps {
  onSaveAndGenerate: () => void;
}

export default function Dashboard({ onSaveAndGenerate }: DashboardProps) {
  const [allStaff, setAllStaff] = useState<{ id: string; name: string }[]>([]);
  const [workingToday, setWorkingToday] = useState<DailyStaff[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>('');
  const [selectedDuration, setSelectedDuration] = useState<'11-1pm' | '11-2pm' | '1-2pm' | '12-2pm'>('11-2pm');
  const [grillOpener, setGrillOpener] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [oneGrillerOnly, setOneGrillerOnly] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const hasMounted = useRef(false);

  // Load staff from localStorage
  useEffect(() => {
    const savedStaff = localStorage.getItem('staff');
    if (savedStaff) {
      try {
        const staffData = JSON.parse(savedStaff);
        setAllStaff(staffData.map((s: any) => ({ id: s.id, name: s.name })));
      } catch (error) {
        console.error('Error loading staff:', error);
      }
    }
  }, []);

  // Load saved daily staff and settings from localStorage on mount
  useEffect(() => {
    const savedDailyStaff = localStorage.getItem('dailyStaff');
    const savedGrillOpener = localStorage.getItem('grillOpener');
    const savedDate = localStorage.getItem('currentDate');
    const savedOneGrillerOnly = localStorage.getItem('oneGrillerOnly');

    if (savedDailyStaff) {
      try {
        setWorkingToday(JSON.parse(savedDailyStaff));
      } catch (error) {
        console.error('Error loading daily staff:', error);
      }
    }

    if (savedGrillOpener) {
      setGrillOpener(savedGrillOpener);
    }

    if (savedDate) {
      setSelectedDate(savedDate);
    }

    if (savedOneGrillerOnly) {
      setOneGrillerOnly(savedOneGrillerOnly === 'true');
    }

    setTimeout(() => { hasMounted.current = true; }, 0);
  }, []);

  // Auto-save grill opener when it changes
  useEffect(() => {
    if (!hasMounted.current) return;
    localStorage.setItem('grillOpener', grillOpener);
  }, [grillOpener]);

  // Auto-save one griller only when it changes
  useEffect(() => {
    if (!hasMounted.current) return;
    localStorage.setItem('oneGrillerOnly', oneGrillerOnly.toString());
  }, [oneGrillerOnly]);

  // Auto-save date when it changes
  useEffect(() => {
    if (!hasMounted.current) return;
    localStorage.setItem('currentDate', selectedDate);
    setIsSaved(false); // Reset saved state when date changes
  }, [selectedDate]);

  const handleAddStaff = () => {
    if (!selectedStaff) {
      alert('Please select a staff member');
      return;
    }

    // Check if already added
    if (workingToday.find(s => s.id === selectedStaff)) {
      alert('This staff member is already added');
      return;
    }

    const staffMember = allStaff.find(s => s.id === selectedStaff);
    if (staffMember) {
      setWorkingToday([...workingToday, {
        id: staffMember.id,
        name: staffMember.name,
        duration: selectedDuration,
      }]);
      setSelectedStaff('');
      setIsSaved(false);
    }
  };

  const handleRemoveStaff = (id: string) => {
    const updated = workingToday.filter(s => s.id !== id);
    setWorkingToday(updated);
    localStorage.setItem('dailyStaff', JSON.stringify(updated));
    setIsSaved(false);
  };

  const handleDurationChange = (id: string, duration: '11-1pm' | '11-2pm' | '1-2pm' | '12-2pm') => {
    const updated = workingToday.map(s =>
      s.id === id ? { ...s, duration } : s
    );
    setWorkingToday(updated);
    localStorage.setItem('dailyStaff', JSON.stringify(updated));
    setIsSaved(false);
  };

  const handleSave = () => {
    // Save current day's data
    const dailyData = {
      date: selectedDate,
      staff: workingToday,
      grillOpener: grillOpener,
    };

    localStorage.setItem('dailyStaff', JSON.stringify(workingToday));
    localStorage.setItem('grillOpener', grillOpener);
    localStorage.setItem('currentDate', selectedDate);
    localStorage.setItem('oneGrillerOnly', oneGrillerOnly.toString());

    // Save to history (last 7 days)
    const historyKey = 'scheduleHistory';
    const existingHistory = localStorage.getItem(historyKey);
    let history: any[] = existingHistory ? JSON.parse(existingHistory) : [];

    // Remove entry for this date if it exists
    history = history.filter(h => h.date !== selectedDate);

    // Add new entry
    history.push({
      date: selectedDate,
      staff: workingToday,
      grillOpener: grillOpener,
    });

    // Keep only last 7 days
    history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    history = history.slice(0, 7);

    localStorage.setItem(historyKey, JSON.stringify(history));

    setIsSaved(true);

    // Trigger the schedule generation event
    window.dispatchEvent(new Event('generateSchedule'));

    // Switch to generator tab after a brief delay to allow the event to be processed
    setTimeout(() => {
      onSaveAndGenerate();
    }, 100);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Who's Working Today?</h2>
              <p className="text-gray-600 mt-2">
                Select staff members working during lunch rush today and specify their shift duration.
              </p>
            </div>
            <div className="flex items-center space-x-2 ml-4">
              <input
                type="checkbox"
                id="oneGrillerOnly"
                checked={oneGrillerOnly}
                onChange={(e) => setOneGrillerOnly(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-white border-gray-400 rounded focus:ring-blue-500"
              />
              <label htmlFor="oneGrillerOnly" className="text-sm font-medium text-gray-900 whitespace-nowrap">
                One Griller Only
              </label>
            </div>
          </div>

        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-bold text-gray-900 mb-2">
                Staff Member
              </label>
              <select
                value={selectedStaff}
                onChange={(e) => setSelectedStaff(e.target.value)}
                className="w-full px-3 py-2 text-base font-medium text-gray-900 bg-white border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select a staff member...</option>
                {allStaff
                  .filter(staff => !workingToday.find(w => w.id === staff.id))
                  .map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="w-48">
              <label className="block text-sm font-bold text-gray-900 mb-2">
                Shift Duration
              </label>
              <select
                value={selectedDuration}
                onChange={(e) => setSelectedDuration(e.target.value as '11-1pm' | '11-2pm' | '1-2pm' | '12-2pm')}
                className="w-full px-3 py-2 text-base font-medium text-gray-900 bg-white border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="11-2pm">11am - 2pm</option>
                <option value="11-1pm">11am - 1pm</option>
                <option value="12-2pm">12pm - 2pm</option>
                <option value="1-2pm">1pm - 2pm</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleAddStaff}
                className="px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
              >
                Add
              </button>
            </div>
          </div>

          {allStaff.length === 0 && (
            <p className="text-sm text-orange-600 font-medium">
              No staff members found. Please add staff in the Staff Management tab first.
            </p>
          )}
        </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Who Opened Grill?</h2>
          <p className="text-gray-600 mb-6">
            This person cooked meat before opening (9am-10am) and will not be assigned to hot positions (Grill, Fries) from 11am-12pm.
          </p>
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-2">
              Grill Opener
            </label>
            <select
              value={grillOpener}
              onChange={(e) => setGrillOpener(e.target.value)}
              className="w-full px-3 py-2 text-base font-medium text-gray-900 bg-white border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">None selected</option>
              {allStaff.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {workingToday.length > 0 && (
        <div className={`rounded-lg shadow overflow-hidden ${isSaved ? 'bg-gray-300' : 'bg-white'}`}>
          <div className={`p-6 border-b border-gray-200 flex justify-between items-center ${isSaved ? 'bg-gray-300' : ''}`}>
            <h3 className="text-xl font-bold text-gray-900">Working Today ({workingToday.length} staff)</h3>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 text-base font-medium text-gray-900 bg-white border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className={isSaved ? 'bg-gray-200' : 'bg-gray-50'}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Shift Duration
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-gray-200 ${isSaved ? 'bg-gray-300' : 'bg-white'}`}>
                {workingToday.map((staff) => (
                  <tr key={staff.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {staff.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={staff.duration}
                        onChange={(e) => handleDurationChange(staff.id, e.target.value as '11-1pm' | '11-2pm' | '1-2pm' | '12-2pm')}
                        className="px-3 py-1 text-sm font-medium text-gray-900 bg-white border-2 border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={isSaved}
                      >
                        <option value="11-2pm">11am - 2pm (all 3 slots)</option>
                        <option value="11-1pm">11am - 1pm (first 2 slots)</option>
                        <option value="12-2pm">12pm - 2pm (last 2 slots)</option>
                        <option value="1-2pm">1pm - 2pm (last slot)</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleRemoveStaff(staff.id)}
                        className="text-red-600 hover:text-red-900"
                        disabled={isSaved}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={`p-6 border-t border-gray-200 ${isSaved ? 'bg-gray-200' : 'bg-gray-50'}`}>
            <button
              onClick={handleSave}
              className="px-6 py-3 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700"
              disabled={isSaved}
            >
              {isSaved ? 'Saved!' : 'Save Daily Staff'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
