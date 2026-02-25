import { prisma, createId } from '@giulio-leone/lib-core';
import { logger, toPrismaJsonValue } from '@giulio-leone/lib-shared';
import type { Prisma } from '@prisma/client';
import type { WorkoutProgram } from '@giulio-leone/types/workout';

/**
 * Upserts a workout program for a given user.
 * Pure domain logic — no Next.js dependencies.
 */
export async function upsertWorkoutProgramForUser(
  userId: string,
  program: WorkoutProgram
): Promise<{ success: boolean; id: string }> {
  if (program.id) {
    const existing = await prisma.workout_programs.findUnique({
      where: { id: program.id },
      select: { userId: true },
    });

    if (existing && existing.userId !== userId) {
      throw new Error('Unauthorized: you do not own this program');
    }
  }

  const id = program.id || createId();

  const data: Prisma.workout_programsUncheckedCreateInput = {
    id,
    userId,
    name: program.name,
    description: program.description,
    difficulty: program.difficulty,
    durationWeeks: program.durationWeeks,
    goals: program.goals,
    status: program.status || 'DRAFT',
    weeks: toPrismaJsonValue(program.weeks as unknown[]),
    metadata: (program.metadata || {}) as Prisma.InputJsonValue,
    version: (program.version || 0) + 1,
    updatedAt: new Date(),
  };

  await prisma.workout_programs.upsert({
    where: { id },
    create: { ...data, createdAt: new Date() },
    update: data,
  });

  return { success: true, id };
}
