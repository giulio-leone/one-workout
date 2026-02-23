/**
 * One Rep Max Service
 *
 * CRUD operations per massimali 1RM degli utenti
 * Implementa SRP e segue pattern consistente con altri services
 *
 * NOMENCLATURA:
 * - catalogExerciseId: ID dell'esercizio nel catalogo (exercises.id)
 *
 * La validazione usa lo schema Zod centralizzato da @onecoach/schemas
 */

import { prisma } from '@giulio-leone/lib-core';
import type {
  UserOneRepMax,
  UserOneRepMaxWithExercise,
  UserOneRepMaxVersion,
} from '@giulio-leone/types';
import { Prisma } from '@prisma/client';
import { createId } from '@giulio-leone/lib-shared';
import { OneRepMaxInputSchema, type OneRepMaxInput } from '@giulio-leone/schemas';

import { logger } from '@giulio-leone/lib-core';
/**
 * Input per creare/aggiornare un massimale
 */
export interface UpsertOneRepMaxInput {
  /** ID dell'esercizio nel catalogo database */
  catalogExerciseId: string;
  oneRepMax: number;
  notes?: string | null;
}

/**
 * Result type per operazioni service
 */
export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class OneRepMaxService {
  /**
   * Valida l'input usando lo schema Zod centralizzato.
   *
   * @returns OneRepMaxInput validato o null con errore
   */
  private static validateInput(input: UpsertOneRepMaxInput): {
    valid: OneRepMaxInput | null;
    error?: string;
  } {
    const result = OneRepMaxInputSchema.safeParse(input);

    if (!result.success) {
      const firstIssue = result.error.issues?.[0];
      return {
        valid: null,
        error: firstIssue?.message || 'Input non valido',
      };
    }

    return { valid: result.data };
  }

  /**
   * Ottiene tutti i massimali di un utente
   */
  static async getByUserId(userId: string): Promise<ServiceResult<UserOneRepMaxWithExercise[]>> {
    try {
      if (!prisma) {
        logger.error('[OneRepMaxService] Prisma client not available');
        return {
          success: false,
          error: 'Database connection error: Prisma client not initialized',
        };
      }

      if (typeof prisma.user_one_rep_max === 'undefined') {
        logger.error('[OneRepMaxService] userOneRepMax model not available in Prisma client');
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

      const normalized: UserOneRepMaxWithExercise[] = maxes.map((max) => ({
        ...max,
        oneRepMax: Number(max.oneRepMax),
      })) as UserOneRepMaxWithExercise[];

      return { success: true, data: normalized };
    } catch (error: unknown) {
      logger.error('[OneRepMaxService.getByUserId]', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Errore nel recupero dei massimali',
      };
    }
  }

  /**
   * Ottiene il massimale per un esercizio specifico
   *
   * @param catalogExerciseId - ID dell'esercizio nel catalogo (alias: exerciseId per retrocompatibilità)
   */
  static async getByExercise(
    userId: string,
    catalogExerciseId: string
  ): Promise<ServiceResult<UserOneRepMaxWithExercise | null>> {
    try {
      const max = await prisma.user_one_rep_max.findFirst({
        where: {
          userId,
          exerciseId: catalogExerciseId,
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

      const normalized: UserOneRepMaxWithExercise | null = max
        ? ({
            ...max,
            oneRepMax: Number(max.oneRepMax),
          } as UserOneRepMaxWithExercise)
        : null;

      return { success: true, data: normalized };
    } catch (error: unknown) {
      logger.error('[OneRepMaxService.getByExercise]', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Errore nel recupero del massimale',
      };
    }
  }

  /**
   * Crea o aggiorna un massimale (upsert)
   *
   * La validazione è centralizzata nello schema Zod.
   */
  static async upsert(
    userId: string,
    input: UpsertOneRepMaxInput
  ): Promise<ServiceResult<UserOneRepMaxWithExercise>> {
    try {
      // Validazione userId
      if (!userId || userId.trim() === '') {
        return {
          success: false,
          error: 'User ID non valido',
        };
      }

      // Validazione input con schema Zod
      const { valid: validatedInput, error: validationError } = this.validateInput(input);
      if (!validatedInput) {
        return {
          success: false,
          error: validationError || 'Input non valido',
        };
      }

      // Usa catalogExerciseId dallo schema validato
      const catalogExerciseId = validatedInput.catalogExerciseId;

      // Verifica esistenza utente
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

      // Verifica esistenza esercizio nel catalogo
      const exercise = await prisma.exercises.findUnique({
        where: { id: catalogExerciseId },
      });

      if (!exercise) {
        return {
          success: false,
          error: `Esercizio non trovato nel catalogo (ID: ${catalogExerciseId})`,
        };
      }

      const existingMax = await prisma.user_one_rep_max.findFirst({
        where: {
          userId,
          exerciseId: catalogExerciseId,
        },
      });

      if (existingMax) {
        const hasChanges =
          Number(existingMax.oneRepMax) !== validatedInput.oneRepMax ||
          existingMax.notes !== (validatedInput.notes ?? null);

        if (hasChanges) {
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

          const newVersion = existingMax.version + 1;

          const max = await prisma.user_one_rep_max.update({
            where: {
              id: existingMax.id,
            },
            data: {
              oneRepMax: validatedInput.oneRepMax,
              notes: validatedInput.notes ?? null,
              version: newVersion,
              lastUpdated: new Date(),
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

          return { success: true, data: normalized };
        } else {
          const normalized: UserOneRepMaxWithExercise = {
            ...existingMax,
            oneRepMax: Number(existingMax.oneRepMax),
          } as UserOneRepMaxWithExercise;

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
            (normalized as Record<string, unknown>).exercise = {
              id: exerciseData.id,
              slug: exerciseData.slug,
              translations: exerciseData.exercise_translations.map((t) => ({
                name: t.name,
                locale: t.locale,
              })),
            };
          }

          return { success: true, data: normalized };
        }
      }

      const max = await prisma.user_one_rep_max.create({
        data: {
          id: createId(),
          userId,
          exerciseId: catalogExerciseId,
          oneRepMax: validatedInput.oneRepMax,
          notes: validatedInput.notes ?? null,
          version: 1,
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

      return { success: true, data: normalized };
    } catch (error: unknown) {
      if (error instanceof Error) {
        const prismaError = error as Prisma.PrismaClientKnownRequestError;

        if (prismaError.code === 'P2002') {
          return {
            success: false,
            error: 'Esiste già un massimale per questo esercizio',
          };
        }
        if (prismaError.code === 'P2003') {
          const field = (prismaError.meta?.field_name as string) || 'relazione';
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

      logger.error('[OneRepMaxService.upsert]', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Errore nel salvataggio del massimale',
      };
    }
  }

  /**
   * Ottiene la cronologia delle versioni di un massimale
   *
   * @param catalogExerciseId - ID dell'esercizio nel catalogo
   */
  static async getVersions(
    userId: string,
    catalogExerciseId: string
  ): Promise<ServiceResult<UserOneRepMaxVersion[]>> {
    try {
      const max = await prisma.user_one_rep_max.findFirst({
        where: {
          userId,
          exerciseId: catalogExerciseId,
        },
      });

      if (!max) {
        return {
          success: false,
          error: 'Massimale non trovato',
        };
      }

      const versions = await prisma.user_one_rep_max_versions.findMany({
        where: { maxId: max.id },
        orderBy: { version: 'desc' },
      });

      const normalized: UserOneRepMaxVersion[] = versions.map((v) => ({
        ...v,
        oneRepMax: Number(v.oneRepMax),
      })) as UserOneRepMaxVersion[];

      return { success: true, data: normalized };
    } catch (error: unknown) {
      logger.error('[OneRepMaxService.getVersions]', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Errore nel recupero delle versioni',
      };
    }
  }

  /**
   * Elimina un massimale
   *
   * @param catalogExerciseId - ID dell'esercizio nel catalogo
   */
  static async delete(userId: string, catalogExerciseId: string): Promise<ServiceResult<void>> {
    try {
      const existing = await prisma.user_one_rep_max.findFirst({
        where: { userId, exerciseId: catalogExerciseId },
      });
      if (!existing) {
        return {
          success: false,
          error: 'Massimale non trovato',
        };
      }

      await prisma.user_one_rep_max.delete({
        where: { id: existing.id },
      });
      return { success: true };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return {
          success: false,
          error: 'Massimale non trovato',
        };
      }
      logger.error('[OneRepMaxService.delete]', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Errore nell'eliminazione del massimale",
      };
    }
  }

  /**
   * Ottiene i massimali per più esercizi contemporaneamente (batch lookup)
   *
   * @param catalogExerciseIds - Array di ID esercizi dal catalogo
   */
  static async getBatchByExercises(
    userId: string,
    catalogExerciseIds: string[]
  ): Promise<ServiceResult<Map<string, UserOneRepMax>>> {
    try {
      const maxes = await prisma.user_one_rep_max.findMany({
        where: {
          userId,
          exerciseId: { in: catalogExerciseIds },
        },
      });

      const map = new Map<string, UserOneRepMax>();
      for (const max of maxes) {
        const normalized = {
          ...max,
          oneRepMax: Number(max.oneRepMax),
        } as UserOneRepMax;
        map.set(max.exerciseId, normalized);
      }

      return { success: true, data: map };
    } catch (error: unknown) {
      logger.error('[OneRepMaxService.getBatchByExercises]', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Errore nel recupero batch dei massimali',
      };
    }
  }
}
