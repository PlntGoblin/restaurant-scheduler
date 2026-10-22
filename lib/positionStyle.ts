/**
 * One color voice per station TYPE, used anywhere a position pill renders.
 *
 * The mapping is color theory doing actual work, not decoration: hot stations
 * are warm (Grill red, Fries orange), front-of-house is cool (Expo blue,
 * P.O.S. slate), Lobby/Dish is green. On the printed sheet taped by the line,
 * "where am I this hour" resolves by color before anyone reads a name.
 *
 * Tailwind's scanner needs every class name written out in full, which is why
 * this is a lookup table of complete strings and not string-building.
 */
import type { Position } from '@/lib/types';

const PILL: Record<Position, string> = {
  'Grill 1': 'bg-gradient-to-b from-red-500 to-red-700 shadow-red-950/50',
  'Grill 2': 'bg-gradient-to-b from-red-500 to-red-700 shadow-red-950/50',
  Fries: 'bg-gradient-to-b from-amber-500 to-orange-600 shadow-orange-950/50',
  'P.O.S.': 'bg-gradient-to-b from-slate-600 to-slate-800 shadow-slate-950/50',
  'Expo 1': 'bg-gradient-to-b from-blue-500 to-blue-700 shadow-blue-950/50',
  'Expo 2': 'bg-gradient-to-b from-blue-500 to-blue-700 shadow-blue-950/50',
  'Lobby/Dish 1': 'bg-gradient-to-b from-emerald-500 to-emerald-700 shadow-emerald-950/50',
  'Lobby/Dish 2': 'bg-gradient-to-b from-emerald-500 to-emerald-700 shadow-emerald-950/50',
};

const DOT: Record<Position, string> = {
  'Grill 1': 'bg-red-600',
  'Grill 2': 'bg-red-600',
  Fries: 'bg-orange-500',
  'P.O.S.': 'bg-slate-600',
  'Expo 1': 'bg-blue-600',
  'Expo 2': 'bg-blue-600',
  'Lobby/Dish 1': 'bg-emerald-600',
  'Lobby/Dish 2': 'bg-emerald-600',
};

export function positionPill(position: Position): string {
  return PILL[position] ?? PILL['P.O.S.'];
}

export function positionDot(position: Position): string {
  return DOT[position] ?? DOT['P.O.S.'];
}
