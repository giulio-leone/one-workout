/**
 * Exercise Admin Service
 *
 * Utility dedicate alla gestione avanzata del catalogo esercizi:
 * - Import/export in formato JSON con deduplica
 * - Operazioni batch (CRUD) e automazioni AI
 */

import { prisma } from '@giulio-leone/lib-core';
import { ExerciseService } from './exercise.service';
import { toSlug } from '@giulio-leone/lib-shared';
import {
  createExerciseSchema,
  updateExerciseSchema,
  type CreateExerciseInput,
  type UpdateExerciseInput,
  type ExerciseRelationInput,
} from '@giulio-leone/schemas';
import { validateExerciseTypeByName } from '@giulio-leone/lib-core';

import { z } from 'zod';
type ExerciseApprovalStatus = 'APPROVED' | 'PENDING';
type ExerciseRelationType = NonNullable<ExerciseRelationInput['relation']>;
type MuscleRole = NonNullable<CreateExerciseInput['muscles']>[number]['role'];

type ExportExercise = {
  id: string;
  slug: string;
  approvalStatus: ExerciseApprovalStatus;
  approvedAt: Date | null;
  version: number;
  isUserGenerated: boolean;
  createdAt: Date;
  updatedAt: Date;
  exerciseTypeId: string | null;
  overview: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  keywords: string[];
  instructions: string[];
  exerciseTips: string[];
  variations: string[];
  exercise_translations: Array<{
    locale: string;
    name: string;
    shortName: string | null;
    description: string | null;
    searchTerms: string[] | null;
  }>;
  exercise_muscles: Array<{
    muscleId: string;
    role: MuscleRole;
  }>;
  exercise_body_parts: Array<{ bodyPartId: string }>;
  exercise_equipments: Array<{ equipmentId: string }>;
  relatedFrom: Array<{ toId: string; relation: ExerciseRelationType }>;
};

const DEFAULT_LOCALE = 'en';
const DEFAULT_APPROVED_STATUS: ExerciseApprovalStatus = 'APPROVED';
const DEFAULT_PENDING_STATUS: ExerciseApprovalStatus = 'PENDING';

/**
 * Schema per import payload (estende createExerciseSchema con campi admin)
 * Usa SOLO ID (non nomi) per garantire coerenza e evitare incompatibilità
 *
 * IMPORTANTE: translations, muscles, e bodyPartIds sono OBBLIGATORI (ereditati da createExerciseSchema)
 */
const exerciseImportExtension = z.object({
  approvalStatus: z.enum(['APPROVED', 'PENDING']).optional(),
});

// Intersezione: mantiene i campi obbligatori da createExerciseSchema (translations, muscles, bodyPartIds)
// Nota: Zod intersection mantiene i requisiti più restrittivi, quindi i campi obbligatori da createExerciseSchema
// rimangono obbligatori anche se sono opzionali in exerciseImportExtension
const exerciseImportSchemaBase = z.intersection(
  createExerciseSchema as import('zod').ZodTypeAny,
  exerciseImportExtension
);

// Validazione esplicita per assicurarsi che i campi obbligatori siano sempre presenti
export const exerciseImportSchema = exerciseImportSchemaBase.superRefine((data: any, ctx) => {
  // Verifica translations
  if (!data.translations || !Array.isArray(data.translations) || data.translations.length === 0) {
    ctx.addIssue({
      code: 'custom',
      message: 'translations è obbligatorio e deve contenere almeno una traduzione',
      path: ['translations'],
    });
  }

  // Verifica muscles
  if (!data.muscles || !Array.isArray(data.muscles) || data.muscles.length === 0) {
    ctx.addIssue({
      code: 'custom',
      message: 'muscles è obbligatorio e deve contenere almeno un muscolo',
      path: ['muscles'],
    });
  }

  // Verifica bodyPartIds
  if (!data.bodyPartIds || !Array.isArray(data.bodyPartIds) || data.bodyPartIds.length === 0) {
    ctx.addIssue({
      code: 'custom',
      message: 'bodyPartIds è obbligatorio e deve contenere almeno una parte del corpo',
      path: ['bodyPartIds'],
    });
  }

  // Verifica exerciseTypeId (obbligatorio)
  if (!data.exerciseTypeId || data.exerciseTypeId.trim() === '') {
    ctx.addIssue({
      code: 'custom',
      message: 'exerciseTypeId è obbligatorio e non può essere vuoto',
      path: ['exerciseTypeId'],
    });
  }

  // Verifica che tutte le traduzioni abbiano il nome
  if (data.translations && Array.isArray(data.translations)) {
    data.translations.forEach((translation: { name?: string; locale?: string }, index: number) => {
      if (!translation.name || translation.name.trim() === '') {
        ctx.addIssue({
          code: 'custom',
          message: `Il nome è obbligatorio per la traduzione in ${translation.locale || 'locale sconosciuto'}`,
          path: ['translations', index, 'name'],
        });
      }
    });
  }
});

/**
 * Schema per piano AI (CRUD batch)
 */
export const exerciseAiPlanSchema = z.object({
  create: z.array(exerciseImportSchema).default([]),
  update: z
    .array(
      z.object({
        slug: z.string().trim().min(1),
        data: updateExerciseSchema as import('zod').ZodTypeAny,
      })
    )
    .default([]),
  delete: z.array(z.object({ slug: z.string().trim().min(1) })).default([]),
  approve: z
    .array(
      z.object({
        slug: z.string().trim().min(1),
        status: z.enum(['APPROVED', 'PENDING']).default(DEFAULT_APPROVED_STATUS),
      })
    )
    .default([]),
  summary: z.string().optional(),
});

const EXERCISE_EXPORT_INCLUDE = {
  exercise_translations: true,
  exercise_types: true, // Include exerciseType relation to get the name
  exercise_muscles: {
    include: {
      muscles: true,
    },
  },
  exercise_body_parts: {
    include: {
      body_parts: true,
    },
  },
  exercise_equipments: {
    include: {
      equipments: true,
    },
  },
  relatedFrom: {
    include: {
      exercises_exercise_relations_toIdToexercises: {
        select: {
          id: true,
          slug: true,
        },
      },
    },
  },
} as const;

export type ExerciseImportPayload = z.infer<typeof createExerciseSchema> & {
  approvalStatus?: ExerciseApprovalStatus;
};
export type ExerciseAiPlan = z.infer<typeof exerciseAiPlanSchema>;

interface RelationReference {
  slug: string;
  relation: ExerciseRelationType;
  direction: 'outbound' | 'bidirectional';
}

interface NormalizedImportRecord {
  slug: string;
  createInput: CreateExerciseInput;
  updateInput: UpdateExerciseInput;
  relationRefs: RelationReference[];
  approvalStatus?: ExerciseApprovalStatus;
}

export interface ExerciseExportRecord {
  id: string;
  slug: string;
  approvalStatus: ExerciseApprovalStatus;
  approvedAt: string | null;
  version: number;
  isUserGenerated: boolean;
  createdAt: string;
  updatedAt: string;
  exerciseTypeId: string | null;
  overview: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  keywords: string[];
  instructions: string[];
  exerciseTips: string[];
  variations: string[];
  translations: Array<{
    locale: string;
    name: string;
    shortName: string | null;
    description: string | null;
    searchTerms: string[];
  }>;
  muscles: Array<{ id: string; role: MuscleRole }>;
  bodyPartIds: string[];
  equipmentIds: string[];
  relatedExercises: Array<{
    id: string;
    relation: ExerciseRelationType;
    direction: 'outbound' | 'bidirectional';
  }>;
}

export interface ExerciseImportResult {
  created: number;
  updated: number;
  skipped: number;
  createdItems: Array<{ id: string; slug: string }>;
  updatedItems: Array<{ id: string; slug: string }>;
  skippedSlugs: string[];
  errors: Array<{ slug: string; reason: string }>;
}

export interface ExerciseAiExecutionResult {
  summary?: string;
  createResult: ExerciseImportResult | null;
  updateResult: Array<{
    slug: string;
    success: boolean;
    error?: string;
  }>;
  deleteResult: Array<{
    slug: string;
    success: boolean;
    error?: string;
  }>;
  approvalResult: Array<{
    slug: string;
    status: ExerciseApprovalStatus;
    success: boolean;
    error?: string;
  }>;
  plan: ExerciseAiPlan;
}

interface ImportOptions {
  userId?: string;
  autoApprove?: boolean;
  mergeExisting?: boolean;
  sharedContext?: { metadata?: { createdExerciseTypes?: Record<string, string> } };
  onProgress?: (current: number, total: number) => void;
}

export class ExerciseAdminService {
  /**
   * Esporta l'intero catalogo esercizi (opzionalmente includendo quelli non approvati)
   */
  static async exportAll(
    options: { includeUnapproved?: boolean } = {}
  ): Promise<ExerciseExportRecord[]> {
    const exercises = await prisma.exercises.findMany({
      where: options.includeUnapproved ? {} : { approvalStatus: DEFAULT_APPROVED_STATUS },
      include: EXERCISE_EXPORT_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });

    return exercises.map((exercise: any) => this.formatExportRecord(exercise));
  }

  /**
   * Importa esercizi evitando duplicati (basato su slug) con supporto merge
   */
  static async import(
    records: ExerciseImportPayload[],
    options: ImportOptions = {}
  ): Promise<ExerciseImportResult> {
    const summary: ExerciseImportResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      createdItems: [],
      updatedItems: [],
      skippedSlugs: [],
      errors: [],
    };

    if (records.length === 0) {
      return summary;
    }

    const normalizedRecords = await Promise.all(
      records.map((record: any) => this.normalizeImportRecord(record, options.sharedContext))
    );
    const slugCache = new Map<string, string>();

    for (let i = 0; i < normalizedRecords.length; i++) {
      const record = normalizedRecords[i];
      if (!record) continue;

      options.onProgress?.(i + 1, normalizedRecords.length);
      try {
        // ensureTaxonomy non serve più - la validazione è già fatta in normalizeImportRecord
        // Gli ID sono già validati e pronti all'uso

        const relationAdditions = await this.resolveRelations(record.relationRefs, slugCache);
        record.createInput.relatedExercises = this.mergeRelations(
          record.createInput.relatedExercises,
          relationAdditions
        );
        record.updateInput.relatedExercises = this.mergeRelations(
          record.updateInput.relatedExercises,
          relationAdditions
        );

        const existing = await prisma.exercises.findUnique({
          where: { slug: record.slug },
          select: { id: true, approvalStatus: true },
        });

        if (!existing) {
          const targetStatus =
            record.approvalStatus ??
            (options.autoApprove ? DEFAULT_APPROVED_STATUS : DEFAULT_PENDING_STATUS);

          const created = await ExerciseService.create(record.createInput, {
            userId: options.userId,
            autoApprove: targetStatus === DEFAULT_APPROVED_STATUS,
          });

          slugCache.set(record.slug, created.id);
          summary.created += 1;
          summary.createdItems.push({ id: created.id, slug: created.slug });

          if (targetStatus !== created.approvalStatus && options.userId) {
            await ExerciseService.setApprovalStatus(created.id, targetStatus, {
              userId: options.userId,
            });
          }

          continue;
        }

        if (options.mergeExisting === false) {
          summary.skipped += 1;
          summary.skippedSlugs.push(record.slug);
          continue;
        }

        const updated = await ExerciseService.update(existing.id, record.updateInput, {
          userId: options.userId,
          includeTranslations: true,
        });

        slugCache.set(record.slug, updated.id);
        summary.updated += 1;
        summary.updatedItems.push({ id: updated.id, slug: updated.slug });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        summary.errors.push({
          slug: record.slug,
          reason: errorMessage,
        });
      }
    }

    options.onProgress?.(normalizedRecords.length, normalizedRecords.length);

    return summary;
  }

  /**
   * Normalizza payload di import generando slug e campi coerenti
   */
  private static async normalizeImportRecord(
    payload: ExerciseImportPayload,
    sharedContext?: { metadata?: { createdExerciseTypes?: Record<string, string> } }
  ): Promise<NormalizedImportRecord> {
    // Validate required fields early
    if (
      !payload.translations ||
      !Array.isArray(payload.translations) ||
      payload.translations.length === 0
    ) {
      throw new Error('Ogni esercizio deve avere almeno una traduzione');
    }

    const legacyMuscleField =
      (payload as Record<string, unknown>).muscleGroup ??
      (payload as Record<string, unknown>).muscleGroups;
    if (legacyMuscleField !== undefined) {
      throw new Error(
        'I campi legacy "muscleGroup" o "muscleGroups" non sono supportati. Fornisci "muscles": [{ id, role }] e "bodyPartIds".'
      );
    }

    if (!payload.muscles || !Array.isArray(payload.muscles) || payload.muscles.length === 0) {
      throw new Error('Ogni esercizio deve avere almeno un muscolo');
    }

    if (
      !payload.bodyPartIds ||
      !Array.isArray(payload.bodyPartIds) ||
      payload.bodyPartIds.length === 0
    ) {
      throw new Error('Ogni esercizio deve avere almeno una parte del corpo');
    }

    const translations = payload.translations.map(
      (translation: ExerciseImportPayload['translations'][number]) => ({
        ...translation,
        locale: translation.locale.toLowerCase(),
        shortName: translation.shortName ?? undefined,
        description: translation.description ?? undefined,
        searchTerms: translation.searchTerms ?? [],
      })
    );

    const english = translations.find((translation: any) => translation.locale === DEFAULT_LOCALE);
    if (!english) {
      throw new Error("È necessaria una traduzione in inglese per importare l'esercizio");
    }

    const slug = payload.slug?.trim() || toSlug(english.name);

    // Valida e normalizza exerciseTypeId: OBBLIGATORIO - verifica se è un ID valido o converte da nome
    if (
      !payload.exerciseTypeId ||
      payload.exerciseTypeId === null ||
      payload.exerciseTypeId.trim() === ''
    ) {
      throw new Error('exerciseTypeId è obbligatorio e non può essere vuoto');
    }

    const providedId = payload.exerciseTypeId.trim();
    let exerciseTypeId: string;

    // Verifica se è un ID valido nel database
    const existingType = await prisma.exercise_types.findUnique({
      where: { id: providedId },
      select: { id: true },
    });

    if (existingType) {
      // È un ID valido
      exerciseTypeId = providedId;
    } else {
      // Non è un ID valido, prova a convertirlo da nome
      // Usa il servizio di validazione metadata
      const convertedId = await validateExerciseTypeByName(providedId, sharedContext);
      if (!convertedId) {
        throw new Error(
          `exerciseTypeId non valido: "${providedId}" non è né un ID esistente né un nome valido di exercise type`
        );
      }
      exerciseTypeId = convertedId;
    }

    // Muscoli: usa solo ID (obbligatorio)
    const muscles = payload.muscles.map((muscle: any) => ({
      id: muscle.id, // ID è obbligatorio, non più opzionale
      role: muscle.role,
    }));

    // BodyParts: usa solo bodyPartIds (obbligatorio)
    const bodyPartIds = payload.bodyPartIds || [];

    // Equipment: usa solo equipmentIds (opzionale)
    const equipmentIds = payload.equipmentIds || undefined;

    // Related exercises: usa solo ID
    const relatedWithIds = payload.relatedExercises
      ? payload.relatedExercises.map(
          (relation: NonNullable<CreateExerciseInput['relatedExercises']>[number]) => ({
            id: relation.id,
            relation: relation.relation,
            direction: relation.direction ?? 'outbound',
          })
        )
      : [];

    const createInput: CreateExerciseInput = {
      slug,
      exerciseTypeId,
      overview: payload.overview ?? undefined,
      imageUrl: payload.imageUrl ?? undefined,
      videoUrl: payload.videoUrl ?? undefined,
      keywords: payload.keywords ?? [],
      instructions: payload.instructions ?? [],
      exerciseTips: payload.exerciseTips ?? [],
      variations: payload.variations ?? [],
      translations,
      muscles,
      bodyPartIds,
      equipmentIds,
      relatedExercises: relatedWithIds.length ? relatedWithIds : undefined,
      isUserGenerated: payload.isUserGenerated ?? undefined,
    };

    // Rimossa logica legacy relatedBySlug - usa solo relatedExercises con ID
    const relationRefs: RelationReference[] = [];

    const updateInput: UpdateExerciseInput = {
      slug,
      exerciseTypeId,
      overview: payload.overview ?? undefined,
      imageUrl: payload.imageUrl ?? undefined,
      videoUrl: payload.videoUrl ?? undefined,
      keywords: payload.keywords ?? undefined,
      instructions: payload.instructions ?? undefined,
      exerciseTips: payload.exerciseTips ?? undefined,
      variations: payload.variations ?? undefined,
      translations,
      muscles: createInput.muscles,
      bodyPartIds: createInput.bodyPartIds,
      equipmentIds: createInput.equipmentIds,
      relatedExercises: createInput.relatedExercises,
      isUserGenerated: payload.isUserGenerated ?? undefined,
      approvalStatus: payload.approvalStatus ?? undefined,
    };

    return {
      slug,
      createInput,
      updateInput,
      relationRefs,
      approvalStatus: payload.approvalStatus ?? undefined,
    };
  }

  /**
   * Risolve le relazioni basate su slug → ID
   */
  private static async resolveRelations(
    relations: RelationReference[],
    slugCache: Map<string, string>
  ): Promise<ExerciseRelationInput[]> {
    if (relations.length === 0) {
      return [];
    }

    const resolved: ExerciseRelationInput[] = [];

    for (const relation of relations) {
      if (!relation.slug) {
        continue;
      }

      const cachedId = slugCache.get(relation.slug);
      let targetId = cachedId;

      if (!targetId) {
        const existing = await prisma.exercises.findUnique({
          where: { slug: relation.slug },
          select: { id: true },
        });
        if (existing) {
          targetId = existing.id;
          slugCache.set(relation.slug, existing.id);
        }
      }

      if (!targetId) {
        continue;
      }

      resolved.push({
        id: targetId,
        relation: relation.relation,
        direction: relation.direction,
      });
    }

    return resolved;
  }

  /**
   * Unisce relazioni rimuovendo duplicati
   */
  private static mergeRelations(
    base: ExerciseRelationInput[] | undefined,
    additions: ExerciseRelationInput[]
  ): ExerciseRelationInput[] | undefined {
    if (!additions.length && !base?.length) {
      return base;
    }

    const dedup = new Map<string, ExerciseRelationInput>();

    const upsert = (relation: ExerciseRelationInput) => {
      const key = `${relation.id}:${relation.relation}:${relation.direction ?? 'outbound'}`;
      if (!dedup.has(key)) {
        dedup.set(key, {
          id: relation.id,
          relation: relation.relation,
          direction: relation.direction ?? 'outbound',
        });
      }
    };

    base?.forEach(upsert);
    additions.forEach(upsert);

    return Array.from(dedup.values());
  }

  /**
   * Mappa esercizio (con relazioni) in record esportabile
   */
  private static formatExportRecord(exercise: ExportExercise): ExerciseExportRecord {
    return {
      id: exercise.id,
      slug: exercise.slug,
      approvalStatus: exercise.approvalStatus,
      approvedAt: exercise.approvedAt ? exercise.approvedAt.toISOString() : null,
      version: exercise.version,
      isUserGenerated: exercise.isUserGenerated,
      createdAt: exercise.createdAt.toISOString(),
      updatedAt: exercise.updatedAt.toISOString(),
      exerciseTypeId: exercise.exerciseTypeId ?? null,
      overview: exercise.overview ?? null,
      imageUrl: exercise.imageUrl ?? null,
      videoUrl: exercise.videoUrl ?? null,
      keywords: [...exercise.keywords],
      instructions: [...exercise.instructions],
      exerciseTips: [...exercise.exerciseTips],
      variations: [...exercise.variations],
      translations: exercise.exercise_translations.map((translation: any) => ({
        locale: translation.locale.toLowerCase(),
        name: translation.name,
        shortName: translation.shortName ?? null,
        description: translation.description ?? null,
        searchTerms: translation.searchTerms ?? [],
      })),
      muscles: exercise.exercise_muscles.map((muscle: any) => ({
        id: muscle.muscleId,
        role: muscle.role,
      })),
      bodyPartIds: exercise.exercise_body_parts.map((bodyPart: any) => bodyPart.bodyPartId),
      equipmentIds: exercise.exercise_equipments.map((equipment: any) => equipment.equipmentId),
      relatedExercises: exercise.relatedFrom.map((relation: any) => ({
        id: relation.toId,
        relation: relation.relation,
        direction: 'outbound' as const,
      })),
    };
  }
}
