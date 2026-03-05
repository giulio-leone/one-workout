/**
 * Type Helpers
 *
 * Utility functions per type conversion e validation
 */ import { logger } from '@giulio-leone/lib-core/logger.service';

/**
 * Converte un valore sconosciuto in numero, con fallback
 */
export function ensureNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

/**
 * Converte un valore sconosciuto in stringa, con fallback
 */
export function ensureString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value);
}

/**
 * Converte un valore sconosciuto in array, con fallback ad array vuoto
 */
export function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Converte un valore sconosciuto in array di stringhe
 */
export function ensureArrayOfStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry: unknown) => String(entry)).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((piece: string) => piece.trim())
      .filter(Boolean);
  }

  return [];
}

/**
 * Parse JSON se il valore è una stringa, altrimenti ritorna il valore stesso
 */
export function parseJsonIfString<T>(value: unknown): T | null {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch (_error: unknown) {
      logger.warn('Failed to parse JSON string value', { error: _error });
      return null;
    }
  }

  if (value && typeof value === 'object') {
    return value as T;
  }

  return null;
}

/**
 * Estrae il primo numero da una stringa o valore
 */
export function parseFirstNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const match = value.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const parsed = Number.parseFloat(match[0]);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}
