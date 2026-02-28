import { prisma } from '@giulio-leone/lib-core';
import type { ProgressionParams } from './workout-progression.service';
import type { WorkoutTemplateType } from '@giulio-leone/types';
import { toPrismaJsonValue, fromPrismaJson } from '@giulio-leone/lib-shared';

const PROGRESSION_TEMPLATE_TYPE: WorkoutTemplateType = 'week';

export interface ProgressionTemplateData extends ProgressionParams {
  name: string;
  description?: string;
}

export class ProgressionTemplateService {
  /**
   * Create a new progression template
   */
  static async create(userId: string, data: ProgressionTemplateData) {
    const { name, description, ...params } = data;

    return prisma.workout_templates.create({
      data: {
        userId,
        name,
        description,
        type: PROGRESSION_TEMPLATE_TYPE,
        data: toPrismaJsonValue(params),
        category: 'progression',
        isPublic: false, // Private by default
      },
    });
  }

  /**
   * List progression templates for a user
   */
  static async list(userId: string) {
    const templates = await prisma.workout_templates.findMany({
      where: {
        userId,
        type: PROGRESSION_TEMPLATE_TYPE,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return templates.map((t: any) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      params: fromPrismaJson<ProgressionParams>(t.data)!,
    }));
  }

  /**
   * Delete a progression template
   */
  static async delete(userId: string, templateId: string) {
    return prisma.workout_templates.delete({
      where: {
        id: templateId,
        userId, // Ensure ownership
      },
    });
  }

  /**
   * Get a specific template
   */
  static async get(userId: string, templateId: string) {
    const template = await prisma.workout_templates.findUnique({
      where: {
        id: templateId,
        userId,
      },
    });

    if (!template) return null;

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      params: fromPrismaJson<ProgressionParams>(template.data)!,
    };
  }
}
