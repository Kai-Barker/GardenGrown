import type { GrowthStage } from './types';

/**
 * Growth tuning lives here so retuning never means touching catalog entries.
 *
 * Stage art is shared across every plant — one seed image, one sapling image,
 * with the plant's own art as the final stage. That keeps new plants free: they
 * grow correctly the moment they're added to the catalog, with no per-plant art.
 */

export const SEED_IMAGE = require('../../assets/Plants/seed.webp');

// PLACEHOLDER: standing in until real sapling art is drawn. Swapping this one
// line is the entire art migration — nothing else references the sapling image.
export const SAPLING_IMAGE = require('../../assets/Plants/Brussel Sprout.webp');

/**
 * Every image the growth system can substitute in. Warmed at startup so a plant
 * changing stage doesn't stall on decoding art it has never shown before.
 */
export const STAGE_IMAGES = [SEED_IMAGE, SAPLING_IMAGE];

/**
 * Fixed render sizes, in cells, for the pre-mature stages. Without these a stage
 * inherits the plant's own visual box — so an oak's seed would render three
 * cells wide. A seed is the same size whatever it grows into.
 *
 * For reference, a 1x1 plant's mature art renders at 1.5 cells (VISUAL_OVERSIZE).
 */
const SEED_CELLS = 0.75;
const SAPLING_CELLS = 1.25;

/** `hoursRequired` is in hours, so express short demo intervals as fractions. */
const MINUTES = 1 / 60;

/**
 * Demo-speed timings: long enough to watch happen, short enough to show.
 * Raise these to hours/days for a real release.
 */
export const SAPLING_AFTER_MINUTES = 1;
export const MATURE_AFTER_MINUTES = 5;

/**
 * Seed -> mature, for flowers and small plants. A tulip pushing up out of the
 * ground doesn't read as having a distinct sapling phase, so it doesn't get one.
 */
export const simpleGrowth = (matureImage: any): GrowthStage[] => [
  { image: SEED_IMAGE, hoursRequired: 0, visualCells: SEED_CELLS },
  { image: matureImage, hoursRequired: MATURE_AFTER_MINUTES * MINUTES },
];

/**
 * Seed -> sapling -> mature, for trees and the larger woody plants where popping
 * straight from a seed to a full canopy looks abrupt.
 *
 * Stages must stay sorted ascending by `hoursRequired`; `advanceGrowth()` walks
 * them in order and takes the last one whose threshold has passed.
 */
export const woodyGrowth = (matureImage: any): GrowthStage[] => [
  { image: SEED_IMAGE, hoursRequired: 0, visualCells: SEED_CELLS },
  { image: SAPLING_IMAGE, hoursRequired: SAPLING_AFTER_MINUTES * MINUTES, visualCells: SAPLING_CELLS },
  { image: matureImage, hoursRequired: MATURE_AFTER_MINUTES * MINUTES },
];

/**
 * How often the open garden re-checks for stage changes. Ticking only updates
 * React (and writes to Firestore) when a stage actually changes, so this can be
 * frequent without being costly.
 */
export const GROWTH_TICK_MS = 20_000;
