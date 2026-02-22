/**
 * Workout Template Service
 *
 * Servizio unificato per gestione template workout (Exercise, Day, Week)
 * Segue principi SOLID: Single Responsibility, Open/Closed, DRY
 */

import { prisma } from '@giulio-leone/lib-core';
import { Prisma } from '@prisma/client';
import { createId } from '@giulio-leone/lib-shared/id-generator';
import { toPrismaJsonValue, fromPrismaJson } from '@giulio-leone/lib-shared';
import { logger } from '@giulio-leone/lib-core';
import type {
  WorkoutTemplate,
  WorkoutTemplateType,
  Exercise,
  WorkoutDay,
  WorkoutWeek,
} from '@giulio-leone/types';

interface ListTemplatesOptions {
  type?: WorkoutTemplateType;
  category?: string;
  tags?: string[];
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'lastUsedAt' | 'usageCount' | 'name';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Validazione template data in base al tipo
 */
function validateTemplateData(
  type: WorkoutTemplateType,
  data: Exercise | WorkoutDay | WorkoutWeek
): void {
  switch (type) {
    case 'exercise': {
      const exercise = data as Exercise;
      if (!exercise.setGroups || exercise.setGroups.length === 0) {
        throw new Error("L'esercizio deve contenere almeno una serie");
      }
      break;
    }
    case 'day': {
      const day = data as WorkoutDay;
      if (!day.exercises || day.exercises.length === 0) {
        throw new Error('Il giorno deve contenere almeno un esercizio');
      }
      break;
    }
    case 'week': {
      const week = data as WorkoutWeek;
      if (!week.days || week.days.length === 0) {
        throw new Error('La settimana deve contenere almeno un giorno');
      }
      break;
    }
    default:
      throw new Error(`Tipo template non valido: ${type}`);
  }
}

export class WorkoutTemplateService {
  /**
   * Crea nuovo template
   */
  static async createTemplate(
    userId: string,
    data: {
      type: WorkoutTemplateType;
      name: string;
      description?: string;
      category?: string;
      tags?: string[];
      data: Exercise | WorkoutDay | WorkoutWeek;
      isPublic?: boolean;
    }
  ): Promise<WorkoutTemplate> {
    // Validazione nome
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Il nome del template è obbligatorio');
    }

    // Validazione tipo
    if (!['exercise', 'day', 'week'].includes(data.type)) {
      throw new Error("Il tipo deve essere 'exercise', 'day' o 'week'");
    }

    // Validazione data
    validateTemplateData(data.type, data.data);

    // Validazione tags (max 10)
    if (data.tags && data.tags.length > 10) {
      throw new Error('Massimo 10 tags consentiti');
    }

    const template = await prisma.workout_templates.create({
      data: {
        id: createId(),
        userId,
        type: data.type,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        category: data.category?.trim() || null,
        tags: data.tags || [],
        data: toPrismaJsonValue(data.data),
        isPublic: data.isPublic || false,
        usageCount: 0,
        lastUsedAt: null,
      },
    });

    return this.mapToWorkoutTemplate(template);
  }

  /**
   * Lista template con filtri avanzati
   */
  static async listTemplates(
    userId: string,
    options: ListTemplatesOptions = {}
  ): Promise<WorkoutTemplate[]> {
    const where: Prisma.workout_templatesWhereInput = {
      userId,
    };

    // Filtro tipo
    if (options.type) {
      where.type = options.type;
    }

    // Filtro categoria
    if (options.category) {
      where.category = options.category;
    }

    // Filtro tags (almeno uno deve matchare)
    if (options.tags && options.tags.length > 0) {
      where.tags = {
        hasSome: options.tags,
      };
    }

    // Ricerca su nome/descrizione
    if (options.search && options.search.length >= 2) {
      where.OR = [
        { name: { contains: options.search, mode: 'insensitive' } },
        { description: { contains: options.search, mode: 'insensitive' } },
        { tags: { has: options.search } },
      ];
    }

    // Ordinamento
    let orderBy:
      | Prisma.workout_templatesOrderByWithRelationInput
      | Prisma.workout_templatesOrderByWithRelationInput[];
    const sortBy = options.sortBy || 'lastUsedAt';
    const sortOrder = options.sortOrder || 'desc';

    switch (sortBy) {
      case 'createdAt':
        orderBy = { createdAt: sortOrder };
        break;
      case 'lastUsedAt':
        // Usare ordinamento singolo, Prisma gestisce null automaticamente
        // Per desc: null vengono alla fine, per asc: null vengono all'inizio
        orderBy = { lastUsedAt: sortOrder };
        break;
      case 'usageCount':
        orderBy = [{ usageCount: sortOrder }, { createdAt: 'desc' }];
        break;
      case 'name':
        orderBy = [{ name: sortOrder }, { createdAt: 'desc' }];
        break;
      default:
        // Default: ordina per createdAt
        orderBy = { createdAt: 'desc' };
    }

    try {
      const templates = await prisma.workout_templates.findMany({
        where,
        orderBy,
        take: options.limit || 50,
        skip: options.offset || 0,
      });

      return templates.map(
        (t: Prisma.workout_templatesGetPayload<Prisma.workout_templatesDefaultArgs>) =>
          this.mapToWorkoutTemplate(t)
      );
    } catch (error: unknown) {
      logger.error('[WorkoutTemplateService] Error listing templates:', error);
      logger.error('[WorkoutTemplateService] where clause:', JSON.stringify(where, null, 2));
      logger.error('[WorkoutTemplateService] orderBy:', JSON.stringify(orderBy, null, 2));
      logger.error('[WorkoutTemplateService] options:', JSON.stringify(options, null, 2));
      throw error;
    }
  }

  /**
   * Recupera template per ID
   */
  static async getTemplateById(id: string, userId: string): Promise<WorkoutTemplate | null> {
    const template = await prisma.workout_templates.findFirst({
      where: {
        id,
        OR: [{ userId }, { isPublic: true }],
      },
    });

    if (!template) return null;

    return this.mapToWorkoutTemplate(template);
  }

  /**
   * Aggiorna template
   */
  static async updateTemplate(
    id: string,
    userId: string,
    data: {
      name?: string;
      description?: string;
      category?: string;
      tags?: string[];
      data?: Exercise | WorkoutDay | WorkoutWeek;
      isPublic?: boolean;
    }
  ): Promise<WorkoutTemplate> {
    // Verifica esistenza e proprietà
    const existing = await prisma.workout_templates.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new Error('Template non trovato o non autorizzato');
    }

    // Validazione data se fornita
    if (data.data) {
      validateTemplateData(existing.type, data.data);
    }

    // Validazione tags
    if (data.tags && data.tags.length > 10) {
      throw new Error('Massimo 10 tags consentiti');
    }

    const updateData: Prisma.workout_templatesUpdateInput = {};

    if (data.name !== undefined) {
      updateData.name = data.name.trim();
    }
    if (data.description !== undefined) {
      updateData.description = data.description?.trim() || null;
    }
    if (data.category !== undefined) {
      updateData.category = data.category?.trim() || null;
    }
    if (data.tags !== undefined) {
      updateData.tags = data.tags;
    }
    if (data.data !== undefined) {
      updateData.data = toPrismaJsonValue(data.data);
    }
    if (data.isPublic !== undefined) {
      updateData.isPublic = data.isPublic;
    }

    const updated = await prisma.workout_templates.update({
      where: { id },
      data: updateData,
    });

    return this.mapToWorkoutTemplate(updated);
  }

  /**
   * Elimina template
   */
  static async deleteTemplate(id: string, userId: string): Promise<void> {
    const existing = await prisma.workout_templates.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new Error('Template non trovato o non autorizzato');
    }

    await prisma.workout_templates.delete({
      where: { id },
    });
  }

  /**
   * Incrementa contatore utilizzi
   */
  static async incrementUsage(id: string): Promise<void> {
    await prisma.workout_templates.update({
      where: { id },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
  }

  /**
   * Mappa da Prisma a WorkoutTemplate
   */
  private static mapToWorkoutTemplate(
    template: Prisma.workout_templatesGetPayload<Prisma.workout_templatesDefaultArgs>
  ): WorkoutTemplate {
    return {
      id: template.id,
      type: template.type as WorkoutTemplateType,
      name: template.name,
      description: template.description || undefined,
      category: template.category || undefined,
      tags: template.tags,
      data: fromPrismaJson<Exercise | WorkoutDay | WorkoutWeek>(template.data)!,
      isPublic: template.isPublic,
      usageCount: template.usageCount,
      lastUsedAt: template.lastUsedAt?.toISOString(),
      userId: template.userId || '',
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    };
  }

  /**
   * Ottiene lista categorie disponibili
   */
  static getAvailableCategories(): string[] {
    return [
      'push',
      'pull',
      'legs',
      'upper-body',
      'lower-body',
      'full-body',
      'cardio',
      'strength',
      'hypertrophy',
      'endurance',
      'mobility',
      'warmup',
      'cooldown',
    ];
  }
}
