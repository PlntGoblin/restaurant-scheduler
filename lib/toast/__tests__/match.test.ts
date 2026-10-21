import { describe, expect, it } from 'vitest';
import { norm, suggestLinks, toEmployeeDTO, type ToastEmployee } from '../match';

const emp = (guid: string, firstName: string, lastName: string, chosenName?: string): ToastEmployee =>
  ({ guid, firstName, lastName, chosenName: chosenName ?? null });

const dto = (...args: Parameters<typeof emp>) => toEmployeeDTO(emp(...args));

describe('norm', () => {
  it('reduces punctuation, case and spacing to one key', () => {
    expect(norm("O'Brien-Smith")).toBe('obriensmith');
    expect(norm('Toni', ' McBride ')).toBe(norm('toni', 'mcbride'));
  });
});

describe('toEmployeeDTO', () => {
  it('shows the chosen name but keeps the legal one for disambiguation', () => {
    const d = dto('g1', 'Antoinette', 'McBride', 'Toni');
    expect(d.displayName).toBe('Toni McBride');
    expect(d.legalName).toBe('Antoinette McBride');
  });

  it('falls back to the legal first name when there is no chosen one', () => {
    expect(dto('g1', 'Dana', 'Reyes').displayName).toBe('Dana Reyes');
  });
});

describe('suggestLinks', () => {
  it('matches a chosen name against a legal Toast record', () => {
    // The single most common reason a match is missed: the app says "Toni",
    // Toast says "Antoinette".
    const result = suggestLinks([dto('g1', 'Antoinette', 'McBride', 'Toni')], [
      { id: 's1', name: 'Toni McBride' },
    ]);
    expect(result.suggestions.get('s1')?.guids).toEqual(['g1']);
    expect(result.unmatchedToastGuids).toEqual([]);
  });

  it('matches on the legal name too', () => {
    const result = suggestLinks([dto('g1', 'Antoinette', 'McBride', 'Toni')], [
      { id: 's1', name: 'Antoinette McBride' },
    ]);
    expect(result.suggestions.get('s1')?.guids).toEqual(['g1']);
  });

  it('still resolves someone whose chosen name equals their first name', () => {
    // Two identical keys used to land the same record in the bucket twice,
    // look ambiguous, and get skipped. That silently dropped two real people.
    const result = suggestLinks([dto('g1', 'Jake', 'Vitton', 'Jake')], [
      { id: 's1', name: 'Jake Vitton' },
    ]);
    expect(result.ambiguous.size).toBe(0);
    expect(result.suggestions.get('s1')?.guids).toEqual(['g1']);
  });

  it('returns every GUID a person has, not just one', () => {
    // One human has a different GUID per store they can work. Keeping one
    // loses their shifts the day they cover elsewhere.
    const result = suggestLinks(
      [dto('tempe', 'Kile', 'Crump'), dto('mesa', 'Kile', 'Crump'), dto('chandler', 'Kile', 'Crump')],
      [{ id: 's1', name: 'Kile Crump' }],
    );
    expect(result.suggestions.get('s1')?.guids).toEqual(['chandler', 'mesa', 'tempe']);
    expect(result.unmatchedToastGuids).toEqual([]);
  });

  it('reports two different humans with one name as ambiguous instead of guessing', () => {
    const result = suggestLinks(
      [dto('g1', 'Chris', 'Nguyen'), dto('g2', 'Christine', 'Nguyen', 'Chris')],
      [{ id: 's1', name: 'Chris Nguyen' }],
    );
    expect(result.suggestions.has('s1')).toBe(false);
    expect(result.ambiguous.get('s1')?.candidates.map((c) => c.legalName).sort())
      .toEqual(['Chris Nguyen', 'Christine Nguyen']);
    // Neither is claimed, so both stay available for a manual link.
    expect(result.unmatchedToastGuids.sort()).toEqual(['g1', 'g2']);
  });

  it('lists a Toast employee nobody is named after as unmatched', () => {
    const result = suggestLinks([dto('g9', 'New', 'Hire')], [{ id: 's1', name: 'Toni McBride' }]);
    expect(result.unmatchedToastGuids).toEqual(['g9']);
    expect(result.suggestions.size).toBe(0);
  });

  it('leaves a staff member with no Toast counterpart alone', () => {
    const result = suggestLinks([dto('g1', 'Dana', 'Reyes')], [{ id: 's1', name: 'Former Employee' }]);
    expect(result.suggestions.size).toBe(0);
    expect(result.ambiguous.size).toBe(0);
  });
});
