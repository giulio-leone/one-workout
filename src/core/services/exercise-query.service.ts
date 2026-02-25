import { prisma } from '@giulio-leone/lib-core';
import { logger } from '@giulio-leone/lib-shared';

/**
 * Fetches exercises with translations, muscles, and equipment.
 * Pure domain query — no Next.js dependencies.
 */
export async function queryExercises(query?: string, locale: string = 'it') {
  try {
    const exercises = await prisma.exercises.findMany({
      where: query
        ? {
            OR: [
              { slug: { contains: query, mode: 'insensitive' } },
              {
                exercise_translations: {
                  some: {
                    name: { contains: query, mode: 'insensitive' },
                    locale,
                  },
                },
              },
            ],
          }
        : undefined,
      take: 50,
      include: {
        exercise_translations: {
          where: { locale },
        },
        exercise_muscles: {
          include: {
            muscles: {
              include: {
                muscle_translations: {
                  where: { locale },
                },
              },
            },
          },
        },
        exercise_equipments: {
          include: {
            equipments: {
              include: {
                equipment_translations: {
                  where: { locale },
                },
              },
            },
          },
        },
      },
    });

    return exercises.map((ex) => {
      const translation = ex.exercise_translations?.[0];

      const muscleGroups = ex.exercise_muscles?.map((em) => em.muscles.slug) ?? [];

      const equipment =
        ex.exercise_equipments?.map(
          (eq) => eq.equipments.equipment_translations?.[0]?.name || eq.equipments.name
        ) ?? [];

      return {
        id: ex.id,
        catalogExerciseId: ex.id,
        name: translation?.name || ex.slug,
        description: translation?.description || '',
        category: 'strength',
        muscleGroups,
        setGroups: [],
        notes: '',
        typeLabel: 'Strength',
        repRange: '8-12',
        formCues: ex.instructions,
        equipment: equipment,
        videoUrl: ex.videoUrl || undefined,
      };
    });
  } catch (error: unknown) {
    logger.error('Error fetching exercises:', error);
    return [];
  }
}
