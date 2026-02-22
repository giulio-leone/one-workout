/**
 * Mock for @giulio-leone/lib-shared used in tests.
 * Provides only the functions used by one-workout calculators.
 */

export function kgToLbs(kg: number | null | undefined): number {
  if (kg === null || kg === undefined || Number.isNaN(kg) || kg < 0) {
    return 0;
  }
  return kg * 2.20462;
}

export function lbsToKg(lbs: number | null | undefined): number {
  if (lbs === null || lbs === undefined || Number.isNaN(lbs) || lbs < 0) {
    return 0;
  }
  return lbs / 2.20462;
}

export function createId(): string {
  return 'mock-' + Math.random().toString(36).slice(2, 11);
}

