'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { DailyStaff, StaffMember } from '@/lib/types';
import { todayLocal } from '@/lib/toast/time';
import { formatHHMM, formatRawRange, type ToastShiftDTO } from '@/lib/toast/shifts';
import {
  buildRosterDiff,
  isRosterProtected,
  loadStaff,
  needsConfirmation,
  saveStaff,
  type RosterDiff,
} from '@/lib/toast/roster';
import { applyEmployeeLinks } from '@/lib/toast/links';
import type { EmployeeLink } from '@/lib/types';

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
  /** What the last pull had to do to the staff list to resolve Toast's GUIDs. */
  const [linkNote, setLinkNote] = useState<string | null>(null);
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

    const today = todayLocal();
    const date = savedDate && savedDate >= today ? savedDate : today;
    // The stored opener was chosen for the stored date. If the app rolled
    // forward to a new day, yesterday's opener is not today's -- leave it
    // empty and let the Toast pull suggest one from today's clock-ins.
    if (savedGrillOpener && date === savedDate) setGrillOpener(savedGrillOpener);
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
    setGrillOpener('');
    setToastStatus({ kind: 'idle' });
  }, [selectedDate]);

  // Auto-fill the opener (highest Grill preference among the early clock-ins;
  // rule in buildRosterDiff) -- but only into an EMPTY slot or one pointing at
  // somebody no longer on today's roster. A person's explicit pick for today
  // always survives a refresh; the functional update reads the current value
  // so callers can stay keyed on the date alone. Called from BOTH pull
  // outcomes: an applied diff and the far more common "nothing changed"
  // refresh -- the opener question exists every morning either way.
  const fillOpener = useCallback((diff: RosterDiff) => {
    if (!diff.suggestedGrillOpenerId) return;
    const onToday = new Set(diff.next.map((r) => r.id));
    setGrillOpener((prev) => (prev && onToday.has(prev) ? prev : diff.suggestedGrillOpenerId!));
  }, []);

  const applyDiff = useCallback((diff: RosterDiff) => {
    setWorkingToday(diff.next);
    saveRoster(diff.next, false);
    setShiftByStaffId(diff.shiftByStaffId);
    setOpenerCandidates(diff.openerCandidates);
    fillOpener(diff);
    setPendingDiff(null);
    setIsSaved(false);
    // No status line here on purpose. "6 on the lunch rush" said nothing the
    // heading's own "· 6 staff" did not already say, and a strip that speaks
    // on every success is a strip nobody reads when it finally has bad news.
    // The empty-schedule and error messages below still speak.
    setToastStatus({ kind: 'idle' });
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

        // Toast named these people by GUID. Turn the GUIDs into humans using
        // the mapping My Forefathers already maintains, creating staff records
        // for anyone this app has never heard of -- without a record the
        // generator cannot place them at a position, so resolving the name is
        // not enough on its own.
        //
        // Additive only, and best-effort: if the database is unreachable the
        // pull still works off whatever links were set by hand.
        let effectiveStaff = staff;
        let note: string | null = null;
        try {
          const guidsToday = new Set(
            shifts.map((s) => s.employeeGuid).filter((g): g is string => Boolean(g)),
          );
          const linkRes = await fetch('/api/links');
          const linkBody = await linkRes.json();
          const links: EmployeeLink[] = Array.isArray(linkBody?.links) ? linkBody.links : [];
          if (linkRes.ok && links.length > 0) {
            const applied = applyEmployeeLinks(staff, links, guidsToday);
            if (applied.changed) {
              saveStaff(applied.staff);
              setStaffRoster(applied.staff);
              effectiveStaff = applied.staff;
              const bits: string[] = [];
              if (applied.created.length > 0) {
                bits.push(
                  `added ${applied.created.length} from Toast (${applied.created
                    .map((m) => m.name)
                    .join(', ')})`,
                );
              }
              if (applied.attached.length > 0) {
                bits.push(`linked ${applied.attached.length} existing`);
              }
              note = bits.join(' · ');
            }
            if (applied.ambiguous.length > 0) {
              const names = applied.ambiguous.map((a) => a.name).join(', ');
              note = [note, `couldn’t link ${names} — duplicate names in Staff`]
                .filter(Boolean)
                .join(' · ');
            }
          }
        } catch {
          // Leave effectiveStaff alone; manual links still apply.
        }
        setLinkNote(note);

        const diff = buildRosterDiff(shifts, roster, effectiveStaff);
        setUnlinkedShifts(diff.unlinked);

        const unchanged =
          diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;

        if (unchanged) {
          setShiftByStaffId(diff.shiftByStaffId);
          setOpenerCandidates(diff.openerCandidates);
          fillOpener(diff);
          setToastStatus({ kind: 'idle' });
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
          applyDiff(diff);
        }
      } catch (e) {
        setToastStatus({
          kind: 'error',
          message: 'Could not reach the Toast endpoint.',
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [applyDiff, fillOpener],
  );

  // The point of the whole feature: open the app, the crew is already there.
  useEffect(() => {
    if (!hydrated) return;
    // There used to be a `linkedCount === 0` bail here, on the reasoning that
    // a roster with no Toast links could not resolve anything. That is no
    // longer true: the links now come from the Forefathers database at pull
    // time, and a fresh browser legitimately starts with zero of them -- which
    // is exactly the state that made the feature look broken. The data-loss
    // guards (`isRosterProtected` above, `needsConfirmation` in the pull) are
    // what protect the roster, not this.
    if (rosterEdited) return;               // a person disagreed; leave it alone
    if (autoPulled.current.has(selectedDate)) return;
    autoPulled.current.add(selectedDate);
    pullFromToast(selectedDate, workingToday, staffRoster, false);
    // Deliberately keyed on the date only: re-running on every roster keystroke
    // would re-fetch Toast while someone is mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, selectedDate, rosterEdited]);

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

    // Re-saving a day must not throw away the rotation already generated for
    // it: that grid is a week of fairness memory, and the generator rewrites
    // it in a moment anyway.
    const previous = history.find(h => h.date === selectedDate) as
      { schedule?: unknown } | undefined;
    history = history.filter(h => h.date !== selectedDate);
    history.push({
      date: selectedDate,
      staff: workingToday,
      grillOpener,
      ...(previous?.schedule !== undefined ? { schedule: previous.schedule } : {}),
    });
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
              {prettyDate}
              {workingToday.length > 0 && (
                <span className="text-gray-500 font-medium"> · {workingToday.length} staff</span>
              )}
            </h2>
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
          {/* The two settings that change what Generate produces. They used to
              live in cards below the fold, which meant the slow-day toggle got
              missed on exactly the slow days it exists for. Both explain
              themselves on hover -- see <Hint>. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Hint text="Runs the rotation with a single griller instead of two during the rush.">
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-full border-2 px-3 py-1.5
                            text-sm font-bold transition-colors ${
                              oneGrillerOnly
                                ? 'border-red-400 bg-red-50 text-red-800'
                                : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                            }`}
              >
                <input
                  type="checkbox"
                  checked={oneGrillerOnly}
                  onChange={(e) => setOneGrillerOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-400 bg-white accent-red-600 focus:ring-red-500"
                />
                Slow Day? One Griller Only
              </label>
            </Hint>

            <Hint text="Cooked meat before opening (9am–10am). Kept off Grill and Fries from 11am–12pm.">
              <span
                className={`flex items-center gap-2 rounded-full border-2 bg-white py-1 pl-3 pr-1.5
                            transition-colors ${
                              grillOpener ? 'border-red-400' : 'border-gray-300'
                            }`}
              >
                <label
                  htmlFor="grill-opener"
                  className="cursor-pointer whitespace-nowrap text-sm font-bold text-gray-700"
                >
                  Who Opened Grill?
                </label>
                <select
                  id="grill-opener"
                  value={grillOpener}
                  onChange={(e) => setGrillOpener(e.target.value)}
                  className="rounded-full bg-transparent px-2 py-1 text-sm font-medium text-gray-900
                             focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">None selected</option>
                  {/* Early clock-ins first, with their start times: the opener
                      is almost always one of them, so the likely answers lead
                      and the rest of the roster follows as a fallback. */}
                  {openerCandidates.map((c) => (
                    <option key={c.staffId} value={c.staffId}>
                      {c.name} · in at {formatHHMM(c.startHHMM)}
                    </option>
                  ))}
                  {allStaff
                    .filter((staff) => !openerCandidates.some((c) => c.staffId === staff.id))
                    .map((staff) => (
                      <option key={staff.id} value={staff.id}>{staff.name}</option>
                    ))}
                </select>
              </span>
            </Hint>
          </div>

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

          {linkNote && (
            <p className="text-xs text-gray-600">
              From the Forefathers roster: {linkNote}.
            </p>
          )}

          {rosterEdited && (
            <p className="text-xs text-gray-600">
              You&apos;ve edited this roster, so it won&apos;t refresh on its own. Press Refresh to
              see what Toast says.
            </p>
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
                off the list below. The Forefathers roster has no Toast link for{' '}
                {unlinkedShifts.length === 1 ? 'them' : 'them'} either, so nobody can resolve{' '}
                {unlinkedShifts.length === 1 ? 'this one' : 'these'} automatically — pair{' '}
                {unlinkedShifts.length === 1 ? 'them' : 'them'} here, or have it fixed in My
                Forefathers so every device gets it.
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
                  onClick={() => applyDiff(pendingDiff)}
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
                    <td className="px-6 py-4 whitespace-nowrap text-base font-semibold text-gray-900">
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
                        className="rounded p-1.5 text-red-600 hover:bg-red-50 hover:text-red-800 disabled:opacity-40"
                        disabled={isSaved}
                        aria-label={`Remove ${staff.name}`}
                        title={`Remove ${staff.name}`}
                      >
                        {/* Trash can, inline: one glyph is not worth an icon library. */}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-5 w-5"
                          aria-hidden="true"
                        >
                          <path d="M3 6h18" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
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
              + Add employee
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

    </div>
  );
}

/**
 * A control that explains itself the instant you point at it.
 *
 * Deliberately NOT the native `title` attribute: browsers sit on that for
 * roughly a second before showing anything, and a hint you have to wait for
 * is a hint nobody waits for. This paints in 75ms.
 *
 * `focus-within` matters as much as `hover` -- these wrap a checkbox and a
 * select, both of which people reach by Tab, and a mouse-only hint leaves
 * keyboard users with a bare label. `aria-describedby` ties the text to the
 * control so it is announced rather than merely drawn.
 */
function Hint({ text, children }: { text: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <span className="group relative inline-flex">
      <span aria-describedby={id} className="inline-flex">{children}</span>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2
                   rounded-md bg-gray-900 px-3 py-2 text-xs font-medium leading-snug text-white
                   shadow-lg opacity-0 transition-opacity duration-75
                   group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
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
    return <span className="ml-2 text-sm text-gray-500">{formatRawRange(shift.raw)}</span>;
  }
  return (
    <span
      className="ml-2 text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5"
      title={`Toast has this shift as ${formatRawRange(shift.raw)}, which does not fit any of the four duration options. Closest match shown.`}
    >
      ⚠ {formatRawRange(shift.raw)}
    </span>
  );
}
