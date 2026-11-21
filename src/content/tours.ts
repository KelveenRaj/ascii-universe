/**
 * Guided tours: a path through the places, one question at a time. A tour never says anything
 * factual itself. Each step names a body and which of its cited facts to show (by label), so every
 * number on screen still comes from the body's own sources (tests/tours.test.ts checks the labels
 * exist). `prompt` is only the question that leads into the facts.
 */
export interface TourStep {
  bodyId: string;
  /** The lead-in question, in the voice of a curious visitor. */
  prompt: string;
  /** Labels of the body's facts to show, in order. */
  facts: string[];
}

export interface Tour {
  id: string;
  title: string;
  /** One line for the picker. */
  blurb: string;
  steps: TourStep[];
}

export const TOURS: readonly Tour[] = [
  {
    id: 'dark-heart',
    title: 'WHAT SITS AT THE CENTRE?',
    blurb: 'From home to the black hole in the middle',
    steps: [
      {
        bodyId: 'milky-way',
        prompt: 'Start from home. How far is the middle?',
        facts: ['SUN TO CENTRE', 'GALACTIC YEAR'],
      },
      {
        bodyId: 'sgr-a-star',
        prompt: 'What is in there?',
        facts: ['MASS', 'HORIZON'],
      },
      {
        bodyId: 'sgr-a-star',
        prompt: 'You cannot see it. How do we know it is there?',
        facts: ['STAR S2', 'DISCOVERED'],
      },
      {
        bodyId: 'sgr-a-star',
        prompt: 'Can you take its picture?',
        facts: ['FIRST IMAGE', 'RING SIZE'],
      },
      {
        bodyId: 'sgr-a-star',
        prompt: 'Does it just sit there?',
        facts: ['FEEDING', 'FLARES'],
      },
    ],
  },
  {
    id: 'solar-walk',
    title: 'A WALK OUT FROM THE SUN',
    blurb: 'Five stops, from the Sun to Saturn',
    steps: [
      { bodyId: 'sun', prompt: 'How big is the thing in the middle?', facts: ['RADIUS', 'POWER'] },
      { bodyId: 'mercury', prompt: 'And the closest planet?', facts: ['YEAR', 'DAY'] },
      { bodyId: 'earth', prompt: 'Home, then.', facts: ['DAY', 'TILT'] },
      { bodyId: 'jupiter', prompt: 'How big can a planet get?', facts: ['MASS', 'DAY'] },
      {
        bodyId: 'saturn',
        prompt: 'The one with the rings. What is it made of?',
        facts: ['DENSITY', 'MOONS'],
      },
    ],
  },
  {
    id: 'where-are-we',
    title: 'WHERE ARE WE?',
    blurb: 'Our place in the Milky Way',
    steps: [
      {
        bodyId: 'milky-way',
        prompt: 'What does our galaxy look like?',
        facts: ['TYPE', 'DIAMETER', 'ARMS'],
      },
      {
        bodyId: 'milky-way',
        prompt: 'Where do we sit in it?',
        facts: ['SUN TO CENTRE', 'GALACTIC YEAR'],
      },
      {
        bodyId: 'solar-system',
        prompt: 'And what is around the Sun?',
        facts: ['PLANETS', 'SUN'],
      },
    ],
  },
];

export const findTour = (id: string): Tour | undefined => TOURS.find((t) => t.id === id);
