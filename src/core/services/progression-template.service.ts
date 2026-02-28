import { ServiceRegistry, REPO_TOKENS } from '@giulio-leone/core';
import type { IWorkoutTemplateRepository } from '@giulio-leone/core/repositories';
import type { ProgressionParams } from './workout-progression.service';
import type { WorkoutTemplateType } from '@giulio-leone/types';

const PROGRESSION_TEMPLATE_TYPE: WorkoutTemplateType = 'week';

function getTemplateRepo(): IWorkoutTemplateRepository {
  return ServiceRegistry.getInstance().resolve<IWorkoutTemplateRepository>(REPO_TOKENS.WORKOUT_TEMPLATE);
}

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

    return getTemplateRepo().create({
      userId,
      name,
      description,
      type: PROGRESSION_TEMPLATE_TYPE,
      data: params,
      category: 'progression',
      isPublic: false,
    });
  }

  /**
   * List progression templates for a user
   */
  static async list(userId: string) {
    const templates = await getTemplateRepo().findByUser(userId, {
      type: PROGRESSION_TEMPLATE_TYPE,
    });

    return templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      params: t.data as ProgressionParams,
    }));
  }

  /**
   * Delete a progression template
   */
  static async delete(userId: string, templateId: string) {
    const repo = getTemplateRepo();
    const existing = await repo.findFirst({ id: templateId, userId });
    if (!existing) throw new Error('Template not found');
    await repo.delete(templateId);
    return existing;
  }

  /**
   * Get a specific template
   */
  static async get(userId: string, templateId: string) {
    const template = await getTemplateRepo().findByIdForUser(templateId, userId);

    if (!template) return null;

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      params: template.data as ProgressionParams,
    };
  }
}
