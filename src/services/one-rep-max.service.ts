import { logError } from '@giulio-leone/lib-shared';
import { ServiceRegistry, REPO_TOKENS } from '@giulio-leone/core';
import type { IExerciseRepository, IUserRepository, OneRepMaxVersion } from '@giulio-leone/core/repositories';

import type {
  UserOneRepMaxWithExercise,
  UpsertOneRepMaxInput,
  OneRepMaxServiceResult,
} from '@giulio-leone/types/workout';
import { createId } from '@giulio-leone/lib-core';

function getExerciseRepo(): IExerciseRepository {
  return ServiceRegistry.getInstance().resolve<IExerciseRepository>(REPO_TOKENS.EXERCISE);
}

function getUserRepo(): IUserRepository {
  return ServiceRegistry.getInstance().resolve<IUserRepository>(REPO_TOKENS.USER);
}

/**
 * One Rep Max Service
 *
 * CRUD operations per massimali 1RM degli utenti
 * Implementa SRP e segue pattern consistente con altri services
 *
 * NOMENCLATURA:
 * - catalogExerciseId: ID dell'esercizio nel catalogo (usato nell'app)
 * - exerciseId: Nome della colonna nel DB Prisma (mappato da catalogExerciseId)
 */

export class OneRepMaxService {
  /**
   * Ottiene tutti i massimali di un utente
   */
  static async getByUserId(
    userId: string
  ): Promise<OneRepMaxServiceResult<UserOneRepMaxWithExercise[]>> {
    try {
      const maxes = await getExerciseRepo().findUserMaxesWithExercises({ userId });

      const normalized: UserOneRepMaxWithExercise[] = maxes.map((max) => ({
        ...max,
        oneRepMax: Number(max.oneRepMax),
      })) as UserOneRepMaxWithExercise[];

      return { success: true, data: normalized };
    } catch (error: unknown) {
      logError('Errore', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Errore nel recupero dei massimali',
      };
    }
  }

  /**
   * Ottiene il massimale per un esercizio specifico
   */
  static async getByExercise(
    userId: string,
    exerciseId: string,
    _actor?: unknown
  ): Promise<OneRepMaxServiceResult<UserOneRepMaxWithExercise | null>> {
    try {
      const max = await getExerciseRepo().findMaxByExercise(exerciseId, { userId }, true);

      const normalized: UserOneRepMaxWithExercise | null = max
        ? ({
            ...max,
            oneRepMax: Number(max.oneRepMax),
          } as UserOneRepMaxWithExercise)
        : null;

      return { success: true, data: normalized };
    } catch (error: unknown) {
      logError('Errore', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Errore nel recupero del massimale',
      };
    }
  }

  /**
   * Crea o aggiorna un massimale (upsert)
   */
  static async upsert(
    userId: string,
    input: UpsertOneRepMaxInput
  ): Promise<OneRepMaxServiceResult<UserOneRepMaxWithExercise>> {
    try {
      // Validazione userId
      if (!userId || userId.trim() === '') {
        return {
          success: false,
          error: 'User ID non valido',
        };
      }

      // Verifica che l'utente esista nel database
      const user = await getUserRepo().findById(userId);

      if (!user) {
        return {
          success: false,
          error: 'Utente non trovato nel database',
        };
      }

      // Validazione input
      if (input.oneRepMax <= 0 || input.oneRepMax > 1000) {
        return {
          success: false,
          error: 'Il massimale deve essere compreso tra 0.01 e 1000 kg',
        };
      }

      if (!input.catalogExerciseId || input.catalogExerciseId.trim() === '') {
        return {
          success: false,
          error: 'ID esercizio catalogo richiesto',
        };
      }

      // Verifica che l'esercizio esista
      const exercise = await getExerciseRepo().findExerciseById(input.catalogExerciseId);

      if (!exercise) {
        return {
          success: false,
          error: 'Esercizio non trovato',
        };
      }

      const repo = getExerciseRepo();
      // Trova il massimale esistente per salvare la versione corrente
      const existingMax = await repo.findMaxByExercise(input.catalogExerciseId, { userId });

      // Se esiste già e i valori sono cambiati, salva la versione corrente
      if (existingMax) {
        const hasChanges =
          Number(existingMax.oneRepMax) !== input.oneRepMax ||
          existingMax.notes !== (input.notes ?? null);

        if (hasChanges) {
          // Salva la versione corrente prima di aggiornare
          await repo.createOneRepMaxVersion({
            id: createId(),
            maxId: existingMax.id,
            userId: existingMax.userId ?? userId,
            exerciseId: existingMax.exerciseId,
            oneRepMax: existingMax.oneRepMax,
            notes: existingMax.notes,
            version: existingMax.version,
            createdBy: userId,
          });

          // Incrementa il numero di versione
          const newVersion = existingMax.version + 1;

          // Aggiorna il massimale con la nuova versione
          const max = await repo.updateOneRepMaxFull(existingMax.id, {
            oneRepMax: input.oneRepMax,
            notes: input.notes ?? null,
            version: newVersion,
            lastUpdated: new Date(),
            visibility: input.visibility ?? existingMax.visibility,
            assignedToUserId: input.assignedToUserId ?? existingMax.assignedToUserId,
            assignedByCoachId: input.assignedByCoachId ?? existingMax.assignedByCoachId,
          });

          const normalized: UserOneRepMaxWithExercise = {
            ...max,
            oneRepMax: Number(max.oneRepMax),
          } as UserOneRepMaxWithExercise;

          // NOTE: Weight recalculation is now handled explicitly via API /api/workout/[id]/recalculate-weights
          // called by the frontend after 1RM save, to avoid race conditions and ensure sync updates.

          return { success: true, data: normalized };
        } else {
          // Nessun cambiamento — re-fetch with exercise include for the response
          const fullMax = await repo.findMaxByExercise(input.catalogExerciseId, { userId }, true);

          const normalized: UserOneRepMaxWithExercise = {
            ...(fullMax ?? existingMax),
            oneRepMax: Number((fullMax ?? existingMax).oneRepMax),
          } as UserOneRepMaxWithExercise;

          // Nessun cambiamento: non serve ricalcolare i pesi
          return { success: true, data: normalized };
        }
      }

      // Se non esiste, crea nuovo massimale (versione 1)
      const max = await repo.createOneRepMaxFull({
        id: createId(),
        userId,
        exerciseId: input.catalogExerciseId,
        oneRepMax: input.oneRepMax,
        notes: input.notes ?? null,
        version: 1,
        visibility: input.visibility ?? 'PRIVATE',
        assignedToUserId: input.assignedToUserId ?? null,
        assignedByCoachId: input.assignedByCoachId ?? null,
      });

      const normalized: UserOneRepMaxWithExercise = {
        ...max,
        oneRepMax: Number(max.oneRepMax),
      } as UserOneRepMaxWithExercise;

      // NOTE: Weight recalculation is now handled explicitly via API /api/workout/[id]/recalculate-weights
      // called by the frontend after 1RM save, to avoid race conditions and ensure sync updates.

      return { success: true, data: normalized };
    } catch (err: unknown) {
      const errAny = err as { code?: string; meta?: Record<string, unknown> };
      if (errAny.code) {
        logError('Database error', err);

        if (errAny.code === 'P2002') {
          return {
            success: false,
            error: 'Esiste già un massimale per questo esercizio',
          };
        }

        // Foreign key constraint violation
        if (errAny.code === 'P2003') {
          const field = (errAny.meta?.field_name as string) || 'relazione';
          if (field.includes('userId')) {
            return {
              success: false,
              error: 'Utente non trovato nel database. Effettua il login di nuovo.',
            };
          }
          if (field.includes('exerciseId')) {
            return {
              success: false,
              error: 'Esercizio non trovato nel database',
            };
          }
          return {
            success: false,
            error: `Errore di integrità referenziale: ${field}`,
          };
        }
      }

      return {
        success: false,
        error: err instanceof Error ? err.message : 'Errore nel salvataggio del massimale',
      };
    }
  }

  /**
   * Ottiene la cronologia delle versioni di un massimale
   * @param catalogExerciseId - ID dell'esercizio nel catalogo
   */
  static async getVersions(
    userId: string,
    catalogExerciseId: string
  ): Promise<OneRepMaxServiceResult<OneRepMaxVersion[]>> {
    try {
      const max = await getExerciseRepo().findMaxByExercise(catalogExerciseId, { userId });

      if (!max) {
        return {
          success: false,
          error: 'Massimale non trovato',
        };
      }

      const versions = await getExerciseRepo().findVersionsByMaxId(max.id);

      const normalized: OneRepMaxVersion[] = versions.map((v) => ({
        ...v,
        oneRepMax: Number(v.oneRepMax),
      }));

      return { success: true, data: normalized };
    } catch (error: unknown) {
      logError('Errore', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Errore nel recupero delle versioni',
      };
    }
  }

  /**
   * Elimina un massimale
   * @param catalogExerciseId - ID dell'esercizio nel catalogo
   */
  static async delete(
    userId: string,
    catalogExerciseId: string,
    _actor?: unknown
  ): Promise<OneRepMaxServiceResult<void>> {
    try {
      const existing = await getExerciseRepo().findMaxByExercise(catalogExerciseId, { userId });
      if (!existing) {
        return {
          success: false,
          error: 'Massimale non trovato',
        };
      }
      await getExerciseRepo().deleteOneRepMax(existing.id);
      return { success: true };
    } catch (err: unknown) {
      const errAny = err as { code?: string };
      if (errAny.code === 'P2025') {
        return {
          success: false,
          error: 'Massimale non trovato',
        };
      }
      logError('Errore', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Errore nell'eliminazione del massimale",
      };
    }
  }

  /**
   * Ottiene i massimali per più esercizi contemporaneamente (batch lookup)
   * @param catalogExerciseIds - Array di ID degli esercizi nel catalogo
   */
  static async getBatchByExercises(
    userId: string,
    catalogExerciseIds: string[]
  ): Promise<OneRepMaxServiceResult<Map<string, { oneRepMax: number; exerciseId: string; [key: string]: unknown }>>> {
    try {
      const maxes = await getExerciseRepo().findOneRepMaxMany({
        userId,
        exerciseId: { in: catalogExerciseIds },
      });

      const map = new Map<string, { oneRepMax: number; exerciseId: string; [key: string]: unknown }>();
      for (const max of maxes) {
        const normalized = {
          ...max,
          oneRepMax: Number(max.oneRepMax),
        };
        map.set(max.exerciseId, normalized);
      }

      return { success: true, data: map };
    } catch (error: unknown) {
      logError('Errore', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Errore nel recupero batch dei massimali',
      };
    }
  }
}
