'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DailyStaff, StaffMember } from '@/lib/types';
import { todayLocal } from '@/lib/toast/time';
import type { ToastShiftDTO } from '@/lib/toast/shifts';
import {
  buildRosterDiff,
  isRosterProtected,
  loadStaff,
  needsConfirmation,
  type RosterDiff,
} from '@/lib/toast/roster';

interface DashboardProps {
  onSaveAndGenerate: () => void;
  onManageToastLinks?: () => void;
}

type Duration = DailyStaff['duration'];

type ToastStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string; detail?: string }
  | { kind: 'info'; message: string };

/**
 * Whether the roster on screen has been touched by a person.
 *
 * This is the whole safety mechanism for auto-refresh. Toast is the source of
 * truth right up until a human disagrees with it -- and the moment someone
 * removes a no-show, Toast is WRONG and must not be allowed to quietly undo
 * them on the next page load.
 */
const ROSTER_META_KEY = 'dailyStaffMeta';

interface RosterMeta {
  date: string;
  edited: boolean;
}

function loadMeta(): RosterMeta | null {
  try {
    const raw = localStorage.getItem(ROSTER_META_KEY);
    return raw ? (JSON.parse(raw) as RosterMeta) : null;
  } catch {
    return null;
  }
}

export default function Dashboard({ onSaveAndGenerate, onManageToastLinks }: DashboardProps) {
  const [staffRoster, setStaffRoster] = useState<StaffMember[]>([]);
  const [workingToday, setWorkingToday] = useState<DailyStaff[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>('');
  const [selectedDuration, setSelectedDuration] = useState<Duration>('11-2pm');
  const [grillOpener, setGrillOpener] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(todayLocal());
  const [oneGrillerOnly, setOneGrillerOnly] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [showManualAdd, setShowManualAdd] = useState<boolean>(false);
  const hasMounted = useRef(false);

  // --- Toast ---------------------------------------------------------------
  const [hydrated, setHydrated] = useState(false);
  const [rosterEdited, setRosterEdited] = useState(false);
  const [toastStatus, setToastStatus] = useState<ToastStatus>({ kind: 'idle' });
  const [pendingDiff, setPendingDiff] = useState<RosterDiff | null>(null);
  const [shiftByStaffId, setShiftByStaffId] = useState<Map<string, ToastShiftDTO>>(new Map());
  const [unlinkedShifts, setUnlinkedShifts] = useState<ToastShiftDTO[]>([]);
  const [openerCandidates, setOpenerCandidates] = useState<RosterDiff['openerCandidates']>([]);
  /** Dates already auto-pulled this session, so a re-render never re-fetches. */
  const autoPulled = useRef<Set<string>>(new Set());

  const allStaff = useMemo(
    () => staffRoster.map((s) => ({ id: s.id, name: s.name })),
    [staffRoster],
  );

  const linkedCount = staffRoster.filter((s) => (s.toastGuids ?? []).length > 0).length;

  const saveRoster = (next: DailyStaff[], edited: boolean, date = selectedDate) => {
    localStorage.setItem('dailyStaff', JSON.stringify(next));
    localStorage.setItem(ROSTER_META_KEY, JSON.stringify({ date, edited } satisfies RosterMeta));
    setRosterEdited(edited);
  };

  // One hydration pass. Staff roster and daily roster have to land together
  // or the auto-pull would run before it can resolve a single Toast GUID.
  useEffect(() => {
    setStaffRoster(loadStaff());

    const savedDailyStaff = localStorage.getItem('dailyStaff');
    const savedGrillOpener = localStorage.getItem('grillOpener');
    const savedDate = localStorage.getItem('currentDate');
    const savedOneGrillerOnly = localStorage.getItem('oneGrillerOnly');
    const meta = loadMeta();

    let roster: DailyStaff[] = [];
    if (savedDailyStaff) {
      try {
        roster = JSON.parse(savedDailyStaff);
      } catch (error) {
        console.error('Error loading daily staff:', error);
      }
    }
    setWorkingToday(roster);
    if (savedGrillOpener) setGrillOpener(savedGrillOpener);

    const today = todayLocal();
    const date = savedDate && savedDate >= today ? savedDate : today;
    setSelectedDate(date);
    if (date !== savedDate) localStorage.setItem('currentDate', date);

    // A missing marker means UNKNOWN provenance, which must be treated as a
    // human's work -- never as "safe to overwrite". Every roster built before
    // this feature shipped has no marker, and reading that as "untouched"
    // silently replaced a hand-built roster with Toast's answer on first load.
    // Only a roster this code wrote from Toast is ever safe to auto-replace.
    //
    // Edits still only protect the day they were made on: yesterday's tuned
    // roster is not a reason to refuse to fill in today.
    setRosterEdited(isRosterProtected(meta, date, roster.length));

    if (savedOneGrillerOnly) setOneGrillerOnly(savedOneGrillerOnly === 'true');

    setHydrated(true);
    setTimeout(() => { hasMounted.current = true; }, 0);
  }, []);

  useEffect(() => {
    if (!hasMounted.current) return;
    localStorage.setItem('grillOpener', grillOpener);
  }, [grillOpener]);

  useEffect(() => {
    if (!hasMounted.current) return;
    localStorage.setItem('oneGrillerOnly', oneGrillerOnly.toString());
  }, [oneGrillerOnly]);

  useEffect(() => {
    if (!hasMounted.current) return;
    localStorage.setItem('currentDate', selectedDate);
    setIsSaved(false);
    // An edit protects the DAY it was made on. Switching to another date means
    // those edits no longer describe what is on screen, so the new date gets
    // to auto-fill like any other untouched day -- otherwise one removal this
    // morning would stop tomorrow from ever filling itself in.
    setRosterEdited(isRosterProtected(loadMeta(), selectedDate, workingToday.length));
    // Everything below came from a different day's shifts.
    setPendingDiff(null);
    setShiftByStaffId(new Map());
    setUnlinkedShifts([]);
    setOpenerCandidates([]);
    setToastStatus({ kind: 'idle' });
  }, [selectedDate]);

  const applyDiff = useCallback((diff: RosterDiff, silent: boolean) => {
    setWorkingToday(diff.next);
    saveRoster(diff.next, false);
    setShiftByStaffId(diff.shiftByStaffId);
    setOpenerCandidates(diff.openerCandidates);
    // Only when there is exactly one person it could be. With several, the
    // Grill Opener card asks instead -- Toast records a person's role, not
    // their station, so it genuinely cannot tell prep from the grill opener.
    if (diff.suggestedGrillOpenerId) setGrillOpener(diff.suggestedGrillOpenerId);
    setPendingDiff(null);
    setIsSaved(false);
    setToastStatus({
      kind: 'info',
      message: silent
        ? `${diff.next.length} on the lunch rush, from Toast.`
        : `Updated from Toast — ${diff.next.length} on the lunch rush.`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  /**
   * Read the published Toast schedule for `date`.
   *
   * Applies straight away when the roster is untouched -- there is nothing to
   * lose and a confirmation step would be pure ceremony. Once a person has
   * edited the roster, it shows what changed and waits, because the edit is
   * the newer information.
   */
  const pullFromToast = useCallback(
    async (date: string, roster: DailyStaff[], staff: StaffMember[], edited: boolean) => {
      setToastStatus({ kind: 'loading' });
      setPendingDiff(null);
      try {
        const res = await fetch(`/api/toast/shifts?date=${date}`);
        const body = await res.json();
        if (!res.ok) {
          setToastStatus({
            kind: 'error',
            message: body?.error ?? `Request failed (${res.status})`,
            detail: body?.detail,
          });
          return;
        }

        const shifts: ToastShiftDTO[] = body.shifts ?? [];
        const totalShifts: number = body.totalShifts ?? 0;

        if (shifts.length === 0) {
          setUnlinkedShifts([]);
          setToastStatus({
            kind: 'info',
            message:
              totalShifts === 0
                ? 'Toast has no published shifts for this date.'
                : `Toast has ${totalShifts} shift${totalShifts === 1 ? '' : 's'} on this date, but none overlap the 11am–2pm rush.`,
          });
          return;
        }

        const diff = buildRosterDiff(shifts, roster, staff);
        setUnlinkedShifts(diff.unlinked);

        const unchanged =
          diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;

        if (unchanged) {
          setShiftByStaffId(diff.shiftByStaffId);
          setOpenerCandidates(diff.openerCandidates);
          setToastStatus({
            kind: 'info',
            message: `Up to date with Toast — ${diff.next.length} on the lunch rush.`,
          });
          return;
        }

        // Wiping a roster that HAS people down to nobody is never a routine
        // refresh. In practice it means nobody is linked to Toast yet, so
        // Toast's answer is empty through no fault of the schedule -- and
        // applying it would delete a real roster to match a lie. Always ask.
        const confirm = needsConfirmation({
          edited,
          nextCount: diff.next.length,
          currentCount: roster.length,
        });

        if (confirm) {
          setPendingDiff(diff);
          setToastStatus({ kind: 'idle' });
        } else {
          applyDiff(diff, true);
        }
      } catch (e) {
        setToastStatus({
          kind: 'error',
          message: 'Could not reach the Toast endpoint.',
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [applyDiff],
  );

  // The point of the whole feature: open the app, the crew is already there.
  useEffect(() => {
    if (!hydrated) return;
    if (linkedCount === 0) return;          // nothing could resolve anyway
    if (rosterEdited) return;               // a person disagreed; leave it alone
    if (autoPulled.current.has(selectedDate)) return;
    autoPulled.current.add(selectedDate);
    pullFromToast(selectedDate, workingToday, staffRoster, false);
    // Deliberately keyed on the date only: re-running on every roster keystroke
    // would re-fetch Toast while someone is mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, selectedDate, linkedCount, rosterEdited]);

  const handleRefresh = () => {
    autoPulled.current.add(selectedDate);
    pullFromToast(selectedDate, workingToday, staffRoster, rosterEdited);
  };

  // --- Manual edits --------------------------------------------------------

  const handleAddStaff = () => {
    if (!selectedStaff) {
      alert('Please select a staff member');
      return;
    }
    if (workingToday.find(s => s.id === selectedStaff)) {
      alert('This staff member is already added');
      return;
    }
    const staffMember = allStaff.find(s => s.id === selectedStaff);
    if (!staffMember) return;
    const updated = [...workingToday, {
      id: staffMember.id,
      name: staffMember.name,
      duration: selectedDuration,
    }];
    setWorkingToday(updated);
    saveRoster(updated, true);
    setSelectedStaff('');
    setIsSaved(false);
  };

  const handleRemoveStaff = (id: string) => {
    const updated = workingToday.filter(s => s.id !== id);
    setWorkingToday(updated);
    saveRoster(updated, true);
    setIsSaved(false);
  };

  const handleDurationChange = (id: string, duration: Duration) => {
    const updated = workingToday.map(s => (s.id === id ? { ...s, duration } : s));
    setWorkingToday(updated);
    saveRoster(updated, true);
    setIsSaved(false);
  };

  const handleSave = () => {
    localStorage.setItem('dailyStaff', JSON.stringify(workingToday));
    localStorage.setItem('grillOpener', grillOpener);
    localStorage.setItem('currentDate', selectedDate);
    localStorage.setItem('oneGrillerOnly', oneGrillerOnly.toString());

    const historyKey = 'scheduleHistory';
    const existingHistory = localStorage.getItem(historyKey);
    let history: { date: string; staff: DailyStaff[]; grillOpener: string }[] =
      existingHistory ? JSON.parse(existingHistory) : [];

    history = history.filter(h => h.date !== selectedDate);
    history.push({ date: selectedDate, staff: workingToday, grillOpener });
    history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    history = history.slice(0, 7);
    localStorage.setItem(historyKey, JSON.stringify(history));

    setIsSaved(true);

    // Switch to the Generator tab FIRST, then ask it to generate. It registers
    // its 'generateSchedule' listener in a mount effect and is only mounted
    // while its own tab is showing; dispatching before the switch fired into an
    // empty room and left yesterday's rotation on screen.
    onSaveAndGenerate();
    setTimeout(() => {
      window.dispatchEvent(new Event('generateSchedule'));
    }, 0);
  };

  const prettyDate = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <div className="space-y-6">
      <div className={`rounded-lg shadow overflow-hidden ${isSaved ? 'bg-gray-300' : 'bg-white'}`}>
        {/* ------------------------------------------------------------- */}
        {/* Header: who's on, the date, and the one button that matters.   */}
        {/* ------------------------------------------------------------- */}
        <div className="p-6 border-b border-gray-200 flex flex-wrap justify-between items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Working Today
              {workingToday.length > 0 && (
                <span className="text-gray-500 font-medium"> · {workingToday.length} staff</span>
              )}
            </h2>
            <p className="text-gray-600 text-sm mt-1">{prettyDate}</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              aria-label="Schedule date"
              className="px-3 py-2 text-base font-medium text-gray-900 bg-white border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
            />
            <button
              onClick={handleRefresh}
              disabled={toastStatus.kind === 'loading'}
              title="Refresh from Toast"
              className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-bold hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
            >
              <span className={toastStatus.kind === 'loading' ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
              {toastStatus.kind === 'loading' ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Status strip ------------------------------------------------- */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 space-y-3">
          {toastStatus.kind === 'info' && (
            <p className="text-sm font-medium text-gray-700">{toastStatus.message}</p>
          )}
          {toastStatus.kind === 'loading' && (
            <p className="text-sm font-medium text-gray-600">Checking Toast…</p>
          )}
          {toastStatus.kind === 'error' && (
            <div className="rounded-md border-2 border-red-300 bg-red-50 p-3">
              <p className="text-sm font-bold text-red-800">{toastStatus.message}</p>
              {toastStatus.detail && (
                <p className="text-xs text-red-700 mt-1 font-mono break-all">{toastStatus.detail}</p>
              )}
            </div>
          )}

          {rosterEdited && (
            <p className="text-xs text-gray-600">
              You&apos;ve edited this roster, so it won&apos;t refresh on its own. Press Refresh to
              see what Toast says.
            </p>
          )}

          {linkedCount === 0 && staffRoster.length > 0 && (
            <div className="rounded-md border-2 border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-bold text-amber-900">No staff are linked to Toast yet.</p>
              <p className="text-sm text-amber-800 mt-1">
                Pair each person with their Toast record once and this fills itself in from then on.
              </p>
              {onManageToastLinks && (
                <button
                  onClick={onManageToastLinks}
                  className="mt-2 px-3 py-1 bg-amber-600 text-white rounded text-xs font-bold hover:bg-amber-700"
                >
                  Open Toast Link
                </button>
              )}
            </div>
          )}

          {unlinkedShifts.length > 0 && (
            <div className="rounded-md border-2 border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-bold text-amber-900">
                {unlinkedShifts.length === 1
                  ? '1 person on Toast’s schedule isn’t linked in this app'
                  : `${unlinkedShifts.length} people on Toast’s schedule aren’t linked in this app`}{' '}
                ({unlinkedShifts.map((s) => s.raw).join(', ')}).
              </p>
              <p className="text-sm text-amber-800 mt-1">
                {unlinkedShifts.length === 1 ? 'They are' : 'They are'} working and have been left
                off the list below.
              </p>
              {onManageToastLinks && (
                <button
                  onClick={onManageToastLinks}
                  className="mt-2 px-3 py-1 bg-amber-600 text-white rounded text-xs font-bold hover:bg-amber-700"
                >
                  Open Toast Link
                </button>
              )}
            </div>
          )}

          {/* Only ever shown when there are edits that would be lost. ----- */}
          {pendingDiff && (
            <div className="rounded-md border-2 border-gray-400 bg-white p-4">
              <h3 className="text-base font-bold text-gray-900">
                {pendingDiff.next.length === 0
                  ? 'Toast would clear this roster'
                  : 'Toast disagrees with your changes'}
              </h3>
              {pendingDiff.next.length === 0 && (
                <p className="text-sm text-gray-600 mt-1">
                  Usually this means nobody is linked to Toast yet, not that the shift was
                  cancelled. Keep what you have unless you know otherwise.
                </p>
              )}
              <div className="mt-3 space-y-2 text-sm">
                {pendingDiff.added.length > 0 && (
                  <p className="text-green-800">
                    <span className="font-bold">Would add:</span>{' '}
                    {pendingDiff.added.map((r) => `${r.name} (${r.duration})`).join(', ')}
                  </p>
                )}
                {pendingDiff.changed.length > 0 && (
                  <p className="text-blue-800">
                    <span className="font-bold">Would change:</span>{' '}
                    {pendingDiff.changed.map((c) => `${c.staff.name} ${c.from}→${c.to}`).join(', ')}
                  </p>
                )}
                {pendingDiff.removed.length > 0 && (
                  <p className="text-red-800">
                    <span className="font-bold">Would remove:</span>{' '}
                    {pendingDiff.removed.map((r) => r.name).join(', ')}
                  </p>
                )}
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => applyDiff(pendingDiff, false)}
                  className="px-5 py-2 bg-green-600 text-white rounded-md text-sm font-bold hover:bg-green-700"
                >
                  Use Toast&apos;s version
                </button>
                <button
                  onClick={() => setPendingDiff(null)}
                  className="px-5 py-2 bg-white text-gray-800 border-2 border-gray-400 rounded-md text-sm font-bold hover:bg-gray-100"
                >
                  Keep my changes
                </button>
              </div>
            </div>
          )}
        </div>

        {/* The crew ----------------------------------------------------- */}
        {workingToday.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-gray-600 font-medium">
              {staffRoster.length === 0
                ? 'No staff members yet — add them in Staff Management.'
                : 'Nobody on the lunch rush for this date.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className={isSaved ? 'bg-gray-200' : 'bg-gray-50'}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shift Duration</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
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
                        onChange={(e) => handleDurationChange(staff.id, e.target.value as Duration)}
                        className="px-3 py-1 text-sm font-medium text-gray-900 bg-white border-2 border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                        disabled={isSaved}
                      >
                        <option value="11-2pm">11am - 2pm (all 3 slots)</option>
                        <option value="11-1pm">11am - 1pm (first 2 slots)</option>
                        <option value="12-2pm">12pm - 2pm (last 2 slots)</option>
                        <option value="1-2pm">1pm - 2pm (last slot)</option>
                      </select>
                      <ToastChip shift={shiftByStaffId.get(staff.id)} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleRemoveStaff(staff.id)}
                        className="text-red-600 hover:text-red-900 font-medium"
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
        )}

        {/* Add someone Toast doesn't know about ------------------------- */}
        <div className="px-6 py-4 border-t border-gray-200 bg-white">
          {showManualAdd ? (
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[12rem]">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Staff Member
                </label>
                <select
                  value={selectedStaff}
                  onChange={(e) => setSelectedStaff(e.target.value)}
                  className="w-full px-3 py-2 text-base font-medium text-gray-900 bg-white border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Select a staff member...</option>
                  {allStaff
                    .filter(staff => !workingToday.find(w => w.id === staff.id))
                    .map((staff) => (
                      <option key={staff.id} value={staff.id}>{staff.name}</option>
                    ))}
                </select>
              </div>
              <div className="w-44">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Shift Duration
                </label>
                <select
                  value={selectedDuration}
                  onChange={(e) => setSelectedDuration(e.target.value as Duration)}
                  className="w-full px-3 py-2 text-base font-medium text-gray-900 bg-white border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="11-2pm">11am - 2pm</option>
                  <option value="11-1pm">11am - 1pm</option>
                  <option value="12-2pm">12pm - 2pm</option>
                  <option value="1-2pm">1pm - 2pm</option>
                </select>
              </div>
              <button
                onClick={handleAddStaff}
                className="px-5 py-2 bg-red-600 text-white rounded-md text-sm font-bold hover:bg-red-700"
              >
                Add
              </button>
              <button
                onClick={() => { setShowManualAdd(false); setSelectedStaff(''); }}
                className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowManualAdd(true)}
              className="text-sm font-bold text-red-600 hover:text-red-800"
            >
              + Add someone not on Toast&apos;s schedule
            </button>
          )}
        </div>

        <div className={`p-6 border-t border-gray-200 ${isSaved ? 'bg-gray-200' : 'bg-gray-50'}`}>
          <button
            onClick={handleSave}
            className="px-6 py-3 bg-green-600 text-white rounded-md text-sm font-bold hover:bg-green-700 disabled:opacity-60"
            disabled={isSaved || workingToday.length === 0}
          >
            {isSaved ? 'Saved!' : 'Save & Generate Schedule'}
          </button>
        </div>
      </div>

      {/* Grill opener + slow-day toggle --------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Who Opened Grill?</h2>
          <p className="text-gray-600 text-sm mb-4">
            Cooked meat before opening (9am&ndash;10am). Kept off Grill and Fries from 11am&ndash;12pm.
          </p>
          <select
            value={grillOpener}
            onChange={(e) => setGrillOpener(e.target.value)}
            className="w-full px-3 py-2 text-base font-medium text-gray-900 bg-white border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="">None selected</option>
            {allStaff.map((staff) => (
              <option key={staff.id} value={staff.id}>{staff.name}</option>
            ))}
          </select>
          {openerCandidates.length > 1 && !grillOpener && (
            <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-300 rounded p-2">
              <strong>{openerCandidates.length} people were on before the rush</strong> (
              {openerCandidates.map((c) => `${c.name} ${c.startHHMM}`).join(', ')}). Toast records
              each person&apos;s role, not their station, so it can&apos;t tell the opening-prep crew
              from whoever cooked the meat.
            </p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Slow Day?</h2>
          <p className="text-gray-600 text-sm mb-4">
            Runs the rotation with a single griller instead of two during the rush.
          </p>
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={oneGrillerOnly}
              onChange={(e) => setOneGrillerOnly(e.target.checked)}
              className="w-5 h-5 text-red-600 bg-white border-gray-400 rounded focus:ring-red-500"
            />
            <span className="text-base font-medium text-gray-900">One Griller Only</span>
          </label>
        </div>
      </div>
    </div>
  );
}

/**
 * Where a row's duration came from. A confident mapping gets a quiet note; a
 * lossy one gets a warning, because the four buckets cannot represent every
 * real shift and an 11:00-12:00 forced into '11-1pm' puts somebody on the
 * floor for an hour they are not there.
 */
function ToastChip({ shift }: { shift?: ToastShiftDTO }) {
  if (!shift) return null;
  if (shift.confident) {
    return <span className="ml-2 text-xs text-gray-500">Toast: {shift.raw}</span>;
  }
  return (
    <span
      className="ml-2 text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5"
      title={`Toast has this shift as ${shift.raw}, which does not fit any of the four duration options. Closest match shown.`}
    >
      ⚠ Toast: {shift.raw}
    </span>
  );
}
