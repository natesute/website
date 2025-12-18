import type { PageState } from '../content/pages';

/**
 * Genome vectors defining RD parameter regimes for each page state.
 * These values control the visual character of patterns.
 */
export interface Genome {
  name: string;
  feed: number;       // f - feed rate (background)
  kill: number;       // k - kill rate (background)
  textFeed: number;   // f for text regions
  textKill: number;   // k for text regions
}

// Background: Zero activity - pure void
// Text: Self-sustaining coral/fingerprint patterns
export const GENOMES: Record<PageState, Genome> = {
  home: {
    name: 'home',
    feed: 0.000,      // No reaction in background
    kill: 0.100,      // Instant kill
    textFeed: 0.055,  // Coral regime
    textKill: 0.062,
  },
  projects: {
    name: 'projects',
    feed: 0.000,
    kill: 0.100,
    textFeed: 0.055,
    textKill: 0.062,
  },
  'about me': {
    name: 'about me',
    feed: 0.000,
    kill: 0.100,
    textFeed: 0.055,
    textKill: 0.062,
  },
  writings: {
    name: 'writings',
    feed: 0.000,
    kill: 0.100,
    textFeed: 0.055,
    textKill: 0.062,
  },
  contacts: {
    name: 'contacts',
    feed: 0.000,
    kill: 0.100,
    textFeed: 0.055,
    textKill: 0.062,
  },
};

/**
 * Interpolate between two genomes
 */
export function lerpGenome(a: Genome, b: Genome, t: number): Genome {
  return {
    name: t < 0.5 ? a.name : b.name,
    feed: a.feed + (b.feed - a.feed) * t,
    kill: a.kill + (b.kill - a.kill) * t,
    textFeed: a.textFeed + (b.textFeed - a.textFeed) * t,
    textKill: a.textKill + (b.textKill - a.textKill) * t,
  };
}

/**
 * Easing function for smooth transitions
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
