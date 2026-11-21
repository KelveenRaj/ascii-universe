import { createStore } from 'zustand/vanilla';
import { findTour, type Tour, type TourStep } from '@/content/tours';
import { navigationStore } from '@/state/navigation';

/** The guided tour in progress (infographics mode only), or none. Not saved. */
export interface TourState {
  tourId: string | null;
  step: number;
  start: (tourId: string) => void;
  next: () => void;
  prev: () => void;
  exit: () => void;
}

/** Moves the view to the step's body, with its card open. */
function show(step: TourStep) {
  const nav = navigationStore.getState();
  nav.goTo(step.bodyId);
  nav.setInfo(true);
}

export const tourStore = createStore<TourState>()((set, get) => ({
  tourId: null,
  step: 0,
  start: (tourId) => {
    const tour = findTour(tourId);
    if (!tour) return;
    navigationStore.getState().setWorld(false);
    set({ tourId, step: 0 });
    show(tour.steps[0]);
  },
  next: () => {
    const tour = currentTour();
    if (!tour) return;
    const step = get().step + 1;
    if (step >= tour.steps.length) return get().exit();
    set({ step });
    show(tour.steps[step]);
  },
  prev: () => {
    const tour = currentTour();
    if (!tour || get().step === 0) return;
    const step = get().step - 1;
    set({ step });
    show(tour.steps[step]);
  },
  exit: () => set({ tourId: null, step: 0 }),
}));

export const currentTour = (): Tour | undefined => {
  const id = tourStore.getState().tourId;
  return id ? findTour(id) : undefined;
};

// taking off, or going anywhere the tour didn't send you (the map, a link), ends it: it is a way of
// looking, and its card only makes sense at the step's own body
navigationStore.subscribe((s) => {
  const tour = currentTour();
  if (!tour) return;
  if (s.world || s.bodyId !== tour.steps[tourStore.getState().step]?.bodyId) {
    tourStore.getState().exit();
  }
});
