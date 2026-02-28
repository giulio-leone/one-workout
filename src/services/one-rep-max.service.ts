import { logError, logger as sharedLogger } from '@giulio-leone/lib-shared';
import { prisma } from '@giulio-leone/lib-core';

import { Prisma, Visibility } from '@prisma/client';
import type { user_one_rep_max as UserOneRepMax } from '@prisma/client';
import type {
  UserOneRepMaxWithExercise,
  UserOneRepMaxVersion,
  UpsertOneRepMaxInput,
  OneRepMaxServiceResult,
} from '@giulio-leone/types/workout';
import { createId } from '@giulio-leone/lib-core';

const serviceLogger = sharedLogger.child('OneRepMax');

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
      // Verifica che prisma sia disponibile
      if (!prisma) {
        serviceLogger.error('Prisma client not available');
        return {
          success: false,
          error: 'Database connection error: Prisma client not initialized',
        };
      }

      // Verifica che il model sia disponibile (potrebbe non esserlo dopo hot reload)
      if (typeof prisma.user_one_rep_max === 'undefined') {
        serviceLogger.error('userOneRepMax model not available in Prisma client');
        serviceLogger.debug('Available models:', {
          models: Object.keys(prisma)
            .filter((k: any) => typeof k === 'string' && !k.startsWith('$'))
            .join(', '),
        });
        return {
          success: false,
          error: 'Database model not available. Please restart the development server.',
        };
      }

      const maxes = await prisma.user_one_rep_max.findMany({
        where: { userId },
        include: {
          exercises: {
            include: {
              exercise_translations: {
                where: { locale: 'it' },
                take: 1,
              },
            },
          },
        },
        orderBy: { lastUpdated: 'desc' },
      });

      // Convert Decimal to number for JSON serialization
      type MaxRecord = (typeof maxes)[number];
      const normalized: UserOneRepMaxWithExercise[] = maxes.map((max: MaxRecord) => ({
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
      const where: Prisma.user_one_rep_maxWhereUniqueInput = {
        userId_exerciseId: {
          userId,
          exerciseId,
        },
      };

      const max = await prisma.user_one_rep_max.findUnique({
        where,
        include: {
          exercises: {
            include: {
              exercise_translations: {
                where: { locale: 'it' },
                take: 1,
              },
            },
          },
        },
      });

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
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { id: true },
      });

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
      const exercise = await prisma.exercises.findUnique({
        where: { id: input.catalogExerciseId },
      });

      if (!exercise) {
        return {
          success: false,
          error: 'Esercizio non trovato',
        };
      }

      // Trova il massimale esistente per salvare la versione corrente
      const existingMax = await prisma.user_one_rep_max.findUnique({
        where: {
          userId_exerciseId: {
            userId,
            exerciseId: input.catalogExerciseId,
          },
        },
      });

      // Se esiste già e i valori sono cambiati, salva la versione corrente
      if (existingMax) {
        const hasChanges =
          Number(existingMax.oneRepMax) !== input.oneRepMax ||
          existingMax.notes !== (input.notes ?? null);

        if (hasChanges) {
          // Salva la versione corrente prima di aggiornare
          await prisma.user_one_rep_max_versions.create({
            data: {
              id: createId(),
              maxId: existingMax.id,
              userId: existingMax.userId ?? userId,
              exerciseId: existingMax.exerciseId,
              oneRepMax: existingMax.oneRepMax,
              notes: existingMax.notes,
              version: existingMax.version,
              createdBy: userId,
            },
          });

          // Incrementa il numero di versione
          const newVersion = existingMax.version + 1;

          // Aggiorna il massimale con la nuova versione
          const max = await prisma.user_one_rep_max.update({
            where: {
              userId_exerciseId: {
                userId,
                exerciseId: input.catalogExerciseId,
              },
            },
            data: {
              oneRepMax: input.oneRepMax,
              notes: input.notes ?? null,
              version: newVersion,
              lastUpdated: new Date(),
              visibility: (input.visibility ?? existingMax.visibility) as Visibility,
              assignedToUserId: input.assignedToUserId ?? existingMax.assignedToUserId,
              assignedByCoachId: input.assignedByCoachId ?? existingMax.assignedByCoachId,
            },
            include: {
              exercises: {
                include: {
                  exercise_translations: {
                    where: { locale: 'it' },
                    take: 1,
                  },
                },
              },
            },
          });

          const normalized: UserOneRepMaxWithExercise = {
            ...max,
            oneRepMax: Number(max.oneRepMax),
          } as UserOneRepMaxWithExercise;

          // NOTE: Weight recalculation is now handled explicitly via API /api/workout/[id]/recalculate-weights
          // called by the frontend after 1RM save, to avoid race conditions and ensure sync updates.

          return { success: true, data: normalized };
        } else {
          // Nessun cambiamento, ritorna il massimale esistente
          const normalized: UserOneRepMaxWithExercise = {
            ...existingMax,
            oneRepMax: Number(existingMax.oneRepMax),
          } as UserOneRepMaxWithExercise;

          // Aggiungi exercise se necessario
          const exerciseData = await prisma.exercises.findUnique({
            where: { id: existingMax.exerciseId },
            include: {
              exercise_translations: {
                where: { locale: 'it' },
                take: 1,
              },
            },
          });

          if (exerciseData) {
            (normalized as unknown as Record<string, unknown>).exercise = {
              id: exerciseData.id,
              slug: exerciseData.slug,
              translations: exerciseData.exercise_translations.map((t: any) => ({
                name: t.name,
                locale: t.locale,
              })),
            };
          }

          // Nessun cambiamento: non serve ricalcolare i pesi
          return { success: true, data: normalized };
        }
      }

      // Se non esiste, crea nuovo massimale (versione 1)
      const max = await prisma.user_one_rep_max.create({
        data: {
          id: createId(),
          userId,
          exerciseId: input.catalogExerciseId,
          oneRepMax: input.oneRepMax,
          notes: input.notes ?? null,
          version: 1,
          visibility: (input.visibility ?? 'PRIVATE') as Visibility,
          assignedToUserId: input.assignedToUserId ?? null,
          assignedByCoachId: input.assignedByCoachId ?? null,
        },
        include: {
          exercises: {
            include: {
              exercise_translations: {
                where: { locale: 'it' },
                take: 1,
              },
            },
          },
        },
      });

      const normalized: UserOneRepMaxWithExercise = {
        ...max,
        oneRepMax: Number(max.oneRepMax),
      } as UserOneRepMaxWithExercise;

      // NOTE: Weight recalculation is now handled explicitly via API /api/workout/[id]/recalculate-weights
      // called by the frontend after 1RM save, to avoid race conditions and ensure sync updates.

      return { success: true, data: normalized };
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        logError('Prisma error', err);

        if (err.code === 'P2002') {
          return {
            success: false,
            error: 'Esiste già un massimale per questo esercizio',
          };
        }

        // Foreign key constraint violation
        if (err.code === 'P2003') {
          const field = (err.meta?.field_name as string) || 'relazione';
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
  ): Promise<OneRepMaxServiceResult<UserOneRepMaxVersion[]>> {
    try {
      // Trova il massimale corrente
      const max = await prisma.user_one_rep_max.findUnique({
        where: {
          userId_exerciseId: {
            userId,
            exerciseId: catalogExerciseId,
          },
        },
      });

      if (!max) {
        return {
          success: false,
          error: 'Massimale non trovato',
        };
      }

      // Recupera tutte le versioni
      const versions = await prisma.user_one_rep_max_versions.findMany({
        where: { maxId: max.id },
        orderBy: { version: 'desc' },
      });

      // Normalizza Decimal a number
      type VersionRecord = (typeof versions)[number];
      const normalized: UserOneRepMaxVersion[] = versions.map((v: VersionRecord) => ({
        ...v,
        oneRepMax: Number(v.oneRepMax),
      })) as UserOneRepMaxVersion[];

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
      await prisma.user_one_rep_max.delete({
        where: {
          userId_exerciseId: {
            userId,
            exerciseId: catalogExerciseId,
          },
        },
      });
      return { success: true };
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
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
  ): Promise<OneRepMaxServiceResult<Map<string, UserOneRepMax>>> {
    try {
      const maxes = await prisma.user_one_rep_max.findMany({
        where: {
          userId,
          exerciseId: { in: catalogExerciseIds },
        },
      });

      const map = new Map<string, UserOneRepMax>();
      for (const max of maxes) {
        // Per batch lookup non includiamo exercise, solo normalizziamo oneRepMax
        // Usiamo cast a unknown per aggirare il problema Decimal vs number
        const normalized = {
          ...max,
          oneRepMax: Number(max.oneRepMax),
        } as unknown as UserOneRepMax;
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
