import { pick, randInt, type Rng } from '@/world/rng';

const START = ['', 'K', 'V', 'Z', 'T', 'S', 'M', 'R', 'D', 'N', 'L', 'X', 'C', 'B', 'G', 'H', 'Q'];
const VOWEL = ['A', 'E', 'I', 'O', 'U', 'AE', 'IA', 'OR', 'AR', 'EL', 'Y'];
const MID = ['L', 'R', 'N', 'S', 'TH', 'V', 'K', 'X', 'M', 'D', 'Z', 'SH', 'NT', 'RN', 'ST'];
const END = ['', '', 'N', 'S', 'X', 'R', 'TH', 'L', 'IS', 'ON', 'US', 'IA', 'AX', 'OR'];
const SUFFIX = ['', '', '', '', ' PRIME', ' MAJOR', ' MINOR', ' II', ' III', ' IV', ' B'];

/**
 * A made-up star name from syllables, e.g. "KAEROS", "VELTHIA II". Uses only what the 8×8 font
 * draws (capitals, spaces), at most 16 characters.
 */
export function starName(rng: Rng): string {
  let name = pick(rng, START) + pick(rng, VOWEL);
  const middles = randInt(rng, 0, 2);
  for (let i = 0; i < middles; i++) name += pick(rng, MID) + pick(rng, VOWEL);
  name += pick(rng, END);
  if (name.length < 3) name += pick(rng, MID) + pick(rng, VOWEL);
  return (name + pick(rng, SUFFIX)).slice(0, 16).trim();
}
