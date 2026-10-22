'use client';

/**
 * Toast Link -- pairs each staff member with their Toast employee record.
 *
 * Toast's join key is the employee GUID, and this screen is the only place it
 * ever gets set. Suggestions come from name matching, but NOTHING links
 * itself: Toast returns legal names ("Antoinette", "John") where this app
 * shows chosen ones ("Toni", "Jack"), so a name is a hint and a human is the
 * decision. A wrong link puts somebody on the schedule who is not working.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { StaffMember } from '@/lib/types';
import { suggestLinks, type ToastEmployeeDTO } from '@/lib/toast/match';
import { loadStaff, saveStaff, staffFromToastEmployee } from '@/lib/toast/roster';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; employees: ToastEmployeeDTO[] }
  | { status: 'error'; message: string; detail?: string };

export default function ToastLink() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [savedNote, setSavedNote] = useState<string>('');

  useEffect(() => {
    setStaff(loadStaff());
  }, []);

  const reload = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const res = await fetch('/api/toast/employees');
      const body = await res.json();
      if (!res.ok) {
        setState({ status: 'error', message: body?.error ?? `Request failed (${res.status})`, detail: body?.detail });
        return;
      }
      setState({ status: 'ready', employees: body.employees ?? [] });
    } catch (e) {
      setState({
        status: 'error',
        message: 'Could not reach the Toast endpoint.',
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Memoised so the identity is stable: a fresh [] on every render would
  // re-run every useMemo below it and recompute the whole match each keystroke.
  const employees = useMemo(
    () => (state.status === 'ready' ? state.employees : []),
    [state],
  );

  const byGuid = useMemo(
    () => new Map(employees.map((e) => [e.guid, e])),
    [employees],
  );

  const match = useMemo(
    () => suggestLinks(employees, staff.map((s) => ({ id: s.id, name: s.name }))),
    [employees, staff],
  );

  /** staffId for each already-linked GUID, so a GUID is never claimed twice. */
  const guidOwner = useMemo(() => {
    const owners = new Map<string, StaffMember>();
    for (const s of staff) for (const g of s.toastGuids ?? []) owners.set(g, s);
    return owners;
  }, [staff]);

  const persist = (next: StaffMember[], note: string) => {
    setStaff(next);
    saveStaff(next);
    setSavedNote(note);
  };

  const setGuids = (staffId: string, guids: string[], note: string) => {
    persist(
      staff.map((s) => (s.id === staffId ? { ...s, toastGuids: guids } : s)),
      note,
    );
  };

  /** Claim a GUID for one person and take it off anyone else holding it. */
  const linkGuids = (staffId: string, guids: string[]) => {
    const claiming = new Set(guids);
    const next = staff.map((s) => {
      if (s.id === staffId) return { ...s, toastGuids: guids };
      const kept = (s.toastGuids ?? []).filter((g) => !claiming.has(g));
      return kept.length === (s.toastGuids ?? []).length ? s : { ...s, toastGuids: kept };
    });
    const name = staff.find((s) => s.id === staffId)?.name ?? 'Staff member';
    persist(next, `Linked ${name} to ${guids.length} Toast record${guids.length === 1 ? '' : 's'}.`);
  };

  const addFromToast = (employee: ToastEmployeeDTO) => {
    persist([...staff, staffFromToastEmployee(employee)], `Added ${employee.displayName} to the roster.`);
  };

  const linkedCount = staff.filter((s) => (s.toastGuids ?? []).length > 0).length;
  const unmatched = match.unmatchedToastGuids
    .map((g) => byGuid.get(g))
    .filter((e): e is ToastEmployeeDTO => Boolean(e))
    .filter((e) => !guidOwner.has(e.guid));

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl p-6">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Toast Link</h2>
            <p className="text-gray-600 mt-2 max-w-3xl">
              Pair each person with their Toast record once &mdash; after that, the schedule fills
              itself in.
            </p>
            <p className="text-sm text-gray-500 mt-2 max-w-3xl">
              Toast uses legal names, so confirm each match.
            </p>
          </div>
          <button
            onClick={reload}
            className="shrink-0 px-4 py-2 bg-red-600 text-white rounded-md text-sm font-bold hover:bg-red-700"
          >
            Refresh
          </button>
        </div>

        {state.status === 'ready' && (
          <p className="mt-4 text-sm font-medium text-gray-700">
            {employees.length} in Toast &middot; {linkedCount} of {staff.length} linked
          </p>
        )}

        {state.status === 'loading' && (
          <p className="mt-4 text-sm font-medium text-gray-600">Loading employees from Toast&hellip;</p>
        )}

        {state.status === 'error' && (
          <div className="mt-4 rounded-md border-2 border-red-300 bg-red-50 p-4">
            <p className="text-sm font-bold text-red-800">{state.message}</p>
            {state.detail && (
              <p className="text-xs text-red-700 mt-1 font-mono break-all">{state.detail}</p>
            )}
          </div>
        )}

        {savedNote && (
          <p className="mt-4 text-sm font-bold text-green-700">{savedNote}</p>
        )}
      </div>

      {staff.length === 0 ? (
        <div className="glass rounded-2xl p-6">
          <p className="text-sm font-medium text-orange-600">
            No staff members yet. Add them in Staff Management, or add them straight from Toast below.
          </p>
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-xl font-bold text-gray-900">Your staff</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Staff member</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Toast record</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white/40 divide-y divide-gray-200">
                {staff.map((s) => {
                  const guids = s.toastGuids ?? [];
                  const linked = guids.map((g) => byGuid.get(g)).filter((e): e is ToastEmployeeDTO => Boolean(e));
                  const suggestion = match.suggestions.get(s.id);
                  const ambiguous = match.ambiguous.get(s.id);

                  return (
                    <tr key={s.id}>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900 whitespace-nowrap">{s.name}</td>
                      <td className="px-6 py-4 text-sm">
                        {guids.length > 0 ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 text-green-700 font-bold">
                              Linked
                              {guids.length > 1 && (
                                <span className="font-medium text-gray-600">({guids.length} stores)</span>
                              )}
                            </span>
                            <div className="text-gray-600">
                              {linked.length > 0
                                ? linked.map((e) => e.legalName).join(', ')
                                : 'GUID not in the current Toast employee list'}
                            </div>
                          </div>
                        ) : ambiguous ? (
                          <div className="text-amber-800">
                            <span className="font-bold">Several people share that name.</span>{' '}
                            Pick the right one:
                            <div className="mt-2 flex flex-wrap gap-2">
                              {ambiguous.candidates.map((c) => (
                                <button
                                  key={c.guid}
                                  onClick={() => linkGuids(s.id, [c.guid])}
                                  className="px-3 py-1 bg-amber-600 text-white rounded text-xs font-bold hover:bg-amber-700"
                                >
                                  {c.legalName}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : suggestion ? (
                          <div className="text-gray-700">
                            <span className="font-medium">Suggested: </span>
                            <span className="font-bold text-gray-900">{suggestion.legalName}</span>
                            {suggestion.guids.length > 1 && (
                              <span className="text-gray-600"> ({suggestion.guids.length} stores)</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-500">No name match in Toast</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-sm whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {suggestion && guids.length === 0 && (
                            <button
                              onClick={() => linkGuids(s.id, suggestion.guids)}
                              className="px-3 py-1 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700"
                            >
                              Confirm link
                            </button>
                          )}
                          <select
                            value=""
                            onChange={(e) => e.target.value && linkGuids(s.id, [e.target.value])}
                            className="px-2 py-1 text-xs font-medium text-gray-900 bg-white border-2 border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                            disabled={employees.length === 0}
                          >
                            <option value="">{guids.length > 0 ? 'Change to…' : 'Pick manually…'}</option>
                            {employees.map((e) => {
                              const owner = guidOwner.get(e.guid);
                              return (
                                <option key={e.guid} value={e.guid}>
                                  {e.legalName}
                                  {e.chosenName ? ` ("${e.chosenName}")` : ''}
                                  {owner && owner.id !== s.id ? ` — linked to ${owner.name}` : ''}
                                </option>
                              );
                            })}
                          </select>
                          {guids.length > 0 && (
                            <button
                              onClick={() => setGuids(s.id, [], `Unlinked ${s.name}.`)}
                              className="text-red-600 hover:text-red-900 text-xs font-bold"
                            >
                              Unlink
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {unmatched.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-xl font-bold text-gray-900">
              In Toast, not in your roster ({unmatched.length})
            </h3>
            <p className="text-gray-600 mt-1 text-sm">
              Added staff start qualified on every position at preference 3 so they can be scheduled
              right away. Tune that in Staff Management.
            </p>
          </div>
          <ul className="divide-y divide-gray-200">
            {unmatched.map((e) => (
              <li key={e.guid} className="px-6 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-gray-900">{e.displayName}</p>
                  {e.chosenName && (
                    <p className="text-xs text-gray-500">Legal name in Toast: {e.legalName}</p>
                  )}
                </div>
                <button
                  onClick={() => addFromToast(e)}
                  className="shrink-0 px-4 py-2 bg-red-600 text-white rounded-md text-xs font-bold hover:bg-red-700"
                >
                  Add to roster
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
