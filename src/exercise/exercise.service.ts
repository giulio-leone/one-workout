import { prisma } from '@giulio-leone/lib-core';
import { createId, toSlug } from '@giulio-leone/lib-shared/utils';
import type {
  CreateExerciseInput,
  ExerciseQueryParams,
  ExerciseRelationInput,
  ExerciseTranslationInput,
  UpdateExerciseInput,
} from '@giulio-leone/schemas/exercise';
import { ExerciseApprovalStatus, ExerciseRelationType, MuscleRole, Prisma } from '@prisma/client';
import type { LocalizedExercise, ExerciseTranslationView } from '@giulio-leone/types';
import type { Operation } from 'fast-json-patch';
import { compare } from 'fast-json-patch';
import { SimpleCache, toPrismaJsonValue } from '@giulio-leone/lib-shared';

const DEFAULT_LOCALE = 'en';
// Cache disabilitata per debug e consistenza dati
const LIST_CACHE_TTL_MS = 0;
const EXERCISE_CACHE_TTL_MS = 1000 * 60 * 10; // 10 minuti
const MAX_LIST_PAGE_SIZE = 100;

const EXERCISE_INCLUDE = {
  exercise_translations: true,
  exercise_types: true, // Include per ottenere il nome
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
  relatedTo: {
    include: {
      exercises_exercise_relations_fromIdToexercises: {
        select: {
          id: true,
          slug: true,
        },
      },
    },
  },
} satisfies Prisma.exercisesInclude;

// Selezione ottimizzata per la lista
const EXERCISE_LIST_SELECT = {
  id: true,
  slug: true,
  exerciseTypeId: true,
  approvalStatus: true,
  approvedAt: true,
  isUserGenerated: true,
  version: true,
  imageUrl: true,
  videoUrl: true,
  overview: true,
  keywords: true,
  // Campi pesanti esclusi: instructions, exerciseTips, variations
  exercise_translations: {
    select: {
      locale: true,
      name: true,
      shortName: true,
      // description e searchTerms esclusi se non necessari
    },
  },
  exercise_types: {
    select: { name: true },
  },
  exercise_muscles: {
    select: {
      role: true,
      muscleId: true,
      muscles: { select: { name: true, slug: true } },
    },
  },
  exercise_equipments: {
    select: {
      equipmentId: true,
      equipments: { select: { name: true, slug: true } },
    },
  },
  exercise_body_parts: {
    select: {
      bodyPartId: true,
      body_parts: { select: { name: true, slug: true } },
    },
  },
} satisfies Prisma.exercisesSelect;

type ExerciseWithRelations = Prisma.exercisesGetPayload<{ include: typeof EXERCISE_INCLUDE }>;
type ExerciseListRow = Prisma.exercisesGetPayload<{ select: typeof EXERCISE_LIST_SELECT }>;
type TransactionClient = Prisma.TransactionClient;

interface ExerciseSnapshot {
  slug: string;
  exerciseTypeId: string | null;
  overview: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  keywords: string[];
  instructions: string[];
  exerciseTips: string[];
  variations: string[];
  approvalStatus: ExerciseApprovalStatus;
  isUserGenerated: boolean;
  translations: Record<
    string,
    {
      name: string;
      shortName?: string | null;
      description?: string | null;
      searchTerms: string[];
    }
  >;
  muscles: Array<{
    id: string; // ID instead of name
    role: MuscleRole;
  }>;
  bodyParts: string[]; // IDs
  equipments: string[]; // IDs
  relatedFrom: Array<{
    toId: string;
    relation: ExerciseRelationType;
  }>;
}

// Remote local interfaces in favor of @onecoach/types equivalents
// export interface ExerciseTranslationView { ... }
// export interface LocalizedExercise { ... }

// SSOT: Usa direttamente ExercisesResponse<LocalizedExercise> da lib-api
// Nessuna duplicazione - tutti i service devono usare i tipi da lib-api come unica fonte di verità
import type { ExercisesResponse } from '@giulio-leone/lib-api';

import { logger } from '@giulio-leone/lib-core';
// Tipo helper per garantire che page, pageSize, total siano sempre presenti
// Questo è compatibile con ExercisesResponse che li ha opzionali
// NOTA: Questo è un tipo interno al service, non un'interfaccia pubblica duplicata
type ExerciseListResult = Omit<ExercisesResponse, 'data'> & {
  data: LocalizedExercise[];
  page: number;
  pageSize: number;
  total: number;
};

interface SearchResultRow {
  id: string;
  rank: number;
  has_locale: boolean;
}

const listCache = new SimpleCache<string, ExerciseListResult>({
  max: 200,
  ttl: LIST_CACHE_TTL_MS,
});

const exerciseCache = new SimpleCache<string, LocalizedExercise>({
  max: 400,
  ttl: EXERCISE_CACHE_TTL_MS,
});

// Type for normalized translation input
type NormalizedTranslationInput = {
  locale: string;
  name: string;
  shortName: string | null;
  description: string | null;
  searchTerms: string[];
};

export class ExerciseService {
  static async list(
    options: ExerciseQueryParams & { includeTranslations?: boolean }
  ): Promise<ExerciseListResult> {
    const sanitized = this.sanitizeListOptions(options);
    const cacheKey = this.buildListCacheKey(sanitized);
    const cached = listCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const { locale, page, pageSize, search, includeTranslations: _includeTranslations, ...filters } = sanitized;

    if (search) {
      const total = await this.countSearchFullText(search, { locale, filters });

      if (total === 0) {
        return {
          data: [],
          page,
          pageSize,
          total,
        };
      }

      const searchResults = await this.searchFullText(search, {
        locale,
        limit: pageSize,
        offset: (page - 1) * pageSize,
        filters,
      });

      const pageIds = searchResults.map((row) => row.id);

      const exercises = await prisma.exercises.findMany({
        where: {
          id: { in: pageIds },
        },
        select: EXERCISE_LIST_SELECT,
      });

      const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
      const localized = pageIds
        .map((id) => exerciseById.get(id))
        .filter((exercise): exercise is ExerciseListRow => Boolean(exercise))
        .map((exercise) => this.mapListRowToLocalized(exercise, locale));

      const result: ExerciseListResult = {
        data: localized,
        page,
        pageSize,
        total,
      };

      // Cache disabilitata
      // listCache.set(cacheKey, result);
      return result;
    }

    const where = this.buildWhereClause(filters);
    const [total, exercises] = await prisma.$transaction([
      prisma.exercises.count({ where }),
      prisma.exercises.findMany({
        where,
        select: EXERCISE_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const data = exercises.map((exercise) => this.mapListRowToLocalized(exercise, locale));

    const result: ExerciseListResult = {
      data,
      page,
      pageSize,
      total,
    };

    // Cache disabilitata
    // listCache.set(cacheKey, result);
    return result;
  }

  static async search(
    term: string,
    options: Omit<ExerciseQueryParams, 'search'>
  ): Promise<LocalizedExercise[]> {
    const { locale, page, pageSize, ...filters } = this.sanitizeListOptions({
      ...options,
      search: term,
    });
    const searchResults = await this.searchFullText(term, {
      locale,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      filters,
    });

    // Note: search() method returns just the paginated slice as LocalizedExercise[] without total count
    // This maintains backward compatibility with the existing method signature
    const uniqueIds = Array.from(new Set(searchResults.map((row) => row.id)));
    const pageIds = uniqueIds; // searchFullText now returns paginated results directly without extra duplicates

    if (!pageIds.length) {
      return [];
    }

    // Usa select ottimizzata anche per la ricerca
    const exercises = await prisma.exercises.findMany({
      where: { id: { in: pageIds } },
      select: EXERCISE_LIST_SELECT,
    });

    const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));

    return pageIds
      .map((id) => exerciseById.get(id))
      .filter((exercise): exercise is ExerciseListRow => Boolean(exercise))
      .map((exercise) => this.mapListRowToLocalized(exercise, locale));
  }

  static async getById(
    id: string,
    locale: string = DEFAULT_LOCALE,
    options: { includeTranslations?: boolean; includeUnapproved?: boolean } = {}
  ): Promise<LocalizedExercise | null> {
    const normalizedLocale = this.normalizeLocale(locale);
    const includeTranslations = options.includeTranslations ?? false;
    const cacheKey = this.buildExerciseCacheKey(id, normalizedLocale, includeTranslations);
    const cached = exerciseCache.get(cacheKey);
    if (cached) {
      if (options.includeUnapproved || cached.approvalStatus === ExerciseApprovalStatus.APPROVED) {
        return cached;
      }
      exerciseCache.delete(cacheKey);
    }

    const exercise = await prisma.exercises.findUnique({
      where: {
        id,
        ...(options.includeUnapproved ? {} : { approvalStatus: ExerciseApprovalStatus.APPROVED }),
      },
      include: EXERCISE_INCLUDE,
    });

    if (!exercise) {
      return null;
    }

    const localized = this.mapExerciseToLocalized(exercise, normalizedLocale, includeTranslations);
    exerciseCache.set(cacheKey, localized);
    return localized;
  }

  static async getBySlug(
    slug: string,
    locale: string = DEFAULT_LOCALE,
    options: { includeTranslations?: boolean; includeUnapproved?: boolean } = {}
  ): Promise<LocalizedExercise | null> {
    const normalizedLocale = this.normalizeLocale(locale);
    const includeTranslations = options.includeTranslations ?? false;

    const exercise = await prisma.exercises.findUnique({
      where: {
        slug,
        ...(options.includeUnapproved ? {} : { approvalStatus: ExerciseApprovalStatus.APPROVED }),
      },
      include: EXERCISE_INCLUDE,
    });

    if (!exercise) {
      return null;
    }

    const localized = this.mapExerciseToLocalized(exercise, normalizedLocale, includeTranslations);
    const cacheKey = this.buildExerciseCacheKey(exercise.id, normalizedLocale, includeTranslations);
    exerciseCache.set(cacheKey, localized);
    return localized;
  }

  static async create(
    payload: CreateExerciseInput,
    options: { userId?: string; autoApprove?: boolean } = {}
  ): Promise<LocalizedExercise> {
    const data = this.prepareCreateData(payload, options);

    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.exercises.create({
        data: {
          ...data.exercise,
          exercise_translations: { create: data.translations },
          exercise_muscles: { createMany: { data: data.muscles } },
          exercise_body_parts: { createMany: { data: data.bodyParts, skipDuplicates: true } },
          exercise_equipments: { createMany: { data: data.equipments, skipDuplicates: true } },
        },
        include: EXERCISE_INCLUDE,
      });

      if (data.related.length > 0) {
        await tx.exercise_relations.createMany({ data: data.related });
      }

      const snapshot = this.buildSnapshot(created);
      await this.recordVersion(tx, created.id, created.version, null, snapshot, options.userId, {
        event: 'CREATE',
      });

      return created;
    });

    this.invalidateCaches();
    return this.mapExerciseToLocalized(result, DEFAULT_LOCALE, false);
  }

  static async update(
    id: string,
    payload: UpdateExerciseInput,
    options: { userId?: string; locale?: string; includeTranslations?: boolean } = {}
  ): Promise<LocalizedExercise> {
    const normalizedLocale = this.normalizeLocale(options.locale ?? DEFAULT_LOCALE);

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.exercises.findUnique({
        where: { id },
        include: EXERCISE_INCLUDE,
      });

      if (!existing) {
        throw new Error('Exercise non trovato');
      }

      const previousSnapshot = this.buildSnapshot(existing);
      const updateData = this.prepareUpdateData(payload, existing, options.userId);

      if (updateData.exercise) {
        await tx.exercises.update({
          where: { id },
          data: updateData.exercise,
        });
      }

      if (updateData.translations) {
        // Deduplicate translations by locale (keep first occurrence)
        const seenLocales = new Set<string>();
        const uniqueTranslations = updateData.translations.filter((translation) => {
          const locale = translation.locale.toLowerCase();
          if (seenLocales.has(locale)) {
            logger.warn(
              `[ExerciseService] Duplicate translation locale "${locale}" removed during update for exercise "${id}"`
            );
            return false;
          }
          seenLocales.add(locale);
          return true;
        });

        const locales = uniqueTranslations.map((translation) => translation.locale);
        await Promise.all(
          uniqueTranslations.map((translation) =>
            tx.exercise_translations.upsert({
              where: {
                exerciseId_locale: {
                  exerciseId: id,
                  locale: translation.locale,
                },
              },
              create: {
                id: createId(),
                exerciseId: id,
                ...translation,
                updatedAt: new Date(),
              },
              update: {
                name: translation.name,
                shortName: translation.shortName ?? null,
                description: translation.description ?? null,
                searchTerms: translation.searchTerms,
              },
            })
          )
        );

        await tx.exercise_translations.deleteMany({
          where: {
            exerciseId: id,
            locale: { notIn: locales },
          },
        });
      }

      if (updateData.muscles) {
        await tx.exercise_muscles.deleteMany({ where: { exerciseId: id } });
        if (updateData.muscles.length) {
          await tx.exercise_muscles.createMany({ data: updateData.muscles });
        }
      }

      if (updateData.bodyParts) {
        await tx.exercise_body_parts.deleteMany({ where: { exerciseId: id } });
        if (updateData.bodyParts.length) {
          await tx.exercise_body_parts.createMany({
            data: updateData.bodyParts,
            skipDuplicates: true,
          });
        }
      }

      if (updateData.equipments) {
        await tx.exercise_equipments.deleteMany({ where: { exerciseId: id } });
        if (updateData.equipments.length) {
          await tx.exercise_equipments.createMany({
            data: updateData.equipments,
            skipDuplicates: true,
          });
        }
      }

      if (updateData.related) {
        await tx.exercise_relations.deleteMany({ where: { fromId: id } });
        if (updateData.related.length) {
          await tx.exercise_relations.createMany({ data: updateData.related });
        }
      }

      const updated = await tx.exercises.findUnique({
        where: { id },
        include: EXERCISE_INCLUDE,
      });

      if (!updated) {
        throw new Error("Errore nell'aggiornamento dell'esercizio");
      }

      const snapshot = this.buildSnapshot(updated);
      const diff = compare(previousSnapshot, snapshot) as Operation[];
      const baseVersion = updated.version;
      const newVersion = baseVersion + 1;

      await tx.exercises.update({
        where: { id },
        data: { version: newVersion },
      });

      await this.recordVersion(tx, id, newVersion, previousSnapshot, snapshot, options.userId, {
        event: 'UPDATE',
        changes: diff.length,
      });

      // Ottimizzazione: evitiamo una terza query pesante
      // Aggiorniamo manualmente la versione nell'oggetto già recuperato
      return { ...updated, version: newVersion };
    });

    this.invalidateCaches();
    return this.mapExerciseToLocalized(
      result,
      normalizedLocale,
      options.includeTranslations ?? false
    );
  }

  static async setApprovalStatus(
    id: string,
    status: ExerciseApprovalStatus,
    options: { userId: string }
  ): Promise<LocalizedExercise> {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.exercises.findUnique({
        where: { id },
        include: EXERCISE_INCLUDE,
      });

      if (!existing) {
        throw new Error('Exercise non trovato');
      }

      const previousSnapshot = this.buildSnapshot(existing);

      const isApproved = status === ExerciseApprovalStatus.APPROVED;
      const approvedAt = isApproved ? new Date() : null;
      const approvedById = isApproved ? options.userId : null;

      const updated = await tx.exercises.update({
        where: { id },
        data: {
          approvalStatus: status,
          approvedAt,
          approvedById,
          version: existing.version + 1,
        },
        include: EXERCISE_INCLUDE,
      });

      const snapshot = this.buildSnapshot(updated);

      await this.recordVersion(
        tx,
        id,
        updated.version,
        previousSnapshot,
        snapshot,
        options.userId,
        {
          event: 'APPROVAL',
          approvalStatus: status,
        }
      );

      return updated;
    });

    this.invalidateCaches();
    return this.mapExerciseToLocalized(result, DEFAULT_LOCALE, true);
  }

  static async delete(id: string): Promise<{ id: string; slug: string }> {
    // Ottimizzazione: non invalidare tutta la cache, ma solo le chiavi rilevanti se possibile
    // Per ora manteniamo invalidateCaches per sicurezza ma è un punto di miglioramento
    const deleted = await prisma.exercises.delete({
      where: { id },
      select: { id: true, slug: true },
    });

    this.invalidateCaches();
    return deleted;
  }

  static async deleteMany(ids: string[]): Promise<{ deleted: number }> {
    if (!ids.length) {
      return { deleted: 0 };
    }

    const result = await prisma.exercises.deleteMany({
      where: { id: { in: ids } },
    });

    this.invalidateCaches();
    return { deleted: result.count };
  }

  private static sanitizeListOptions(
    options: ExerciseQueryParams & { includeTranslations?: boolean }
  ) {
    const pageSize = Math.min(options.pageSize ?? 20, MAX_LIST_PAGE_SIZE);
    return {
      ...options,
      pageSize,
      locale: this.normalizeLocale(options.locale ?? DEFAULT_LOCALE),
      includeTranslations: options.includeTranslations ?? false,
    };
  }

  private static normalizeLocale(locale: string): string {
    return locale.toLowerCase();
  }

  private static buildExerciseCacheKey(id: string, locale: string, includeTranslations: boolean) {
    return `exercise:${id}:${locale}:${includeTranslations ? 'all' : 'single'}`;
  }

  private static buildListCacheKey(options: ReturnType<typeof this.sanitizeListOptions>) {
    return `list:${JSON.stringify(options)}`;
  }

  private static sanitizeArray(values?: string[]): string[] {
    if (!values?.length) {
      return [];
    }
    return Array.from(
      new Set(
        values
          .filter((value) => Boolean(value))
          .map((value) => value.trim().toLowerCase())
          .filter((value) => value.length > 0)
      )
    );
  }

  private static pickTranslation(
    translations: ExerciseTranslationView[],
    locale: string
  ): { translation: ExerciseTranslationView | null; fallbackLocale: string | null } {
    if (!translations.length) {
      return { translation: null, fallbackLocale: null };
    }

    const normalizedLocale = this.normalizeLocale(locale);
    const exact = translations.find((translation) => translation.locale === normalizedLocale);
    if (exact) {
      return { translation: exact, fallbackLocale: null };
    }

    const [language] = normalizedLocale.split('-');
    if (!language) {
      const english = translations.find((translation) => translation.locale === DEFAULT_LOCALE);
      if (english) {
        return { translation: english, fallbackLocale: english.locale };
      }
      return { translation: null, fallbackLocale: null };
    }
    const sameLanguage = translations.find((translation) =>
      translation.locale.startsWith(language)
    );
    if (sameLanguage) {
      return { translation: sameLanguage, fallbackLocale: sameLanguage.locale };
    }

    const english = translations.find((translation) => translation.locale === DEFAULT_LOCALE);
    if (english) {
      return { translation: english, fallbackLocale: english.locale };
    }

    const firstTranslation = translations[0];
    if (!firstTranslation) {
      throw new Error('No translations available');
    }
    return { translation: firstTranslation, fallbackLocale: firstTranslation.locale };
  }

  private static mapExerciseToLocalized(
    exercise: ExerciseWithRelations,
    locale: string,
    includeTranslations: boolean
  ): LocalizedExercise {
    const translations = exercise.exercise_translations
      .map<ExerciseTranslationView>((translation) => ({
        locale: translation.locale.toLowerCase(),
        name: translation.name,
        shortName: translation.shortName ?? null,
        description: translation.description ?? null,
        searchTerms: translation.searchTerms ?? [],
      }))
      .sort((a, b) => a.locale.localeCompare(b.locale));

    const { translation, fallbackLocale } = this.pickTranslation(translations, locale);

    return {
      id: exercise.id,
      slug: exercise.slug,
      name: translation?.name ?? exercise.slug,
      exerciseTypeId: exercise.exerciseTypeId ?? null,
      exerciseTypeName: exercise.exercise_types?.name ?? null,
      overview: exercise.overview,
      imageUrl: exercise.imageUrl,
      videoUrl: exercise.videoUrl,
      keywords: [...exercise.keywords],
      instructions: [...exercise.instructions],
      exerciseTips: [...exercise.exerciseTips],
      variations: [...exercise.variations],
      approvalStatus: exercise.approvalStatus,
      approvedAt: exercise.approvedAt ?? null,
      isUserGenerated: exercise.isUserGenerated,
      version: exercise.version,
      locale,
      translation,
      fallbackLocale,
      translations: includeTranslations ? translations : undefined,
      muscles: exercise.exercise_muscles
        .map((entry) => ({
          id: entry.muscleId, // ID per uso interno (admin form)
          name: entry.muscles?.name ?? entry.muscleId,
          slug: entry.muscles?.slug ?? entry.muscleId,
          role: entry.role,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      bodyParts: exercise.exercise_body_parts
        .map((entry) => ({
          id: entry.bodyPartId, // ID per uso interno (admin form)
          name: entry.body_parts?.name ?? entry.bodyPartId,
          slug: entry.body_parts?.slug ?? entry.bodyPartId,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      equipments: exercise.exercise_equipments
        .map((entry) => ({
          id: entry.equipmentId, // ID per uso interno (admin form)
          name: entry.equipments?.name ?? entry.equipmentId,
          slug: entry.equipments?.slug ?? entry.equipmentId,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      related: [
        ...exercise.relatedFrom.map((relation) => ({
          id: relation.toId,
          slug: relation.exercises_exercise_relations_toIdToexercises?.slug ?? relation.toId,
          relation: relation.relation,
          direction: 'outbound' as const,
        })),
        ...exercise.relatedTo.map((relation) => ({
          id: relation.fromId,
          slug: relation.exercises_exercise_relations_fromIdToexercises?.slug ?? relation.fromId,
          relation: relation.relation,
          direction: 'inbound' as const,
        })),
      ].sort((a, b) => {
        const relationCompare = a.relation.localeCompare(b.relation);
        if (relationCompare !== 0) {
          return relationCompare;
        }
        return a.slug.localeCompare(b.slug);
      }),
    };
  }

  private static mapListRowToLocalized(
    exercise: ExerciseListRow,
    locale: string
  ): LocalizedExercise {
    const translations = exercise.exercise_translations
      .map<ExerciseTranslationView>((translation) => ({
        locale: translation.locale.toLowerCase(),
        name: translation.name,
        shortName: translation.shortName ?? null,
        description: null, // Non caricato nella lista
        searchTerms: [], // Non caricato nella lista
      }))
      .sort((a, b) => a.locale.localeCompare(b.locale));

    const { translation, fallbackLocale } = this.pickTranslation(translations, locale);

    return {
      id: exercise.id,
      slug: exercise.slug,
      name: translation?.name ?? exercise.slug,
      exerciseTypeId: exercise.exerciseTypeId ?? null,
      exerciseTypeName: exercise.exercise_types?.name ?? null,
      overview: exercise.overview,
      imageUrl: exercise.imageUrl,
      videoUrl: exercise.videoUrl,
      keywords: [...exercise.keywords],
      instructions: [], // Non caricato
      exerciseTips: [], // Non caricato
      variations: [], // Non caricato
      approvalStatus: exercise.approvalStatus,
      approvedAt: exercise.approvedAt ?? null,
      isUserGenerated: exercise.isUserGenerated,
      version: exercise.version,
      locale,
      translation,
      fallbackLocale,
      translations: translations,
      muscles: exercise.exercise_muscles
        .map((entry) => ({
          id: entry.muscleId,
          name: entry.muscles?.name ?? entry.muscleId,
          slug: entry.muscles?.slug ?? entry.muscleId,
          role: entry.role,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      bodyParts: exercise.exercise_body_parts
        .map((entry) => ({
          id: entry.bodyPartId,
          name: entry.body_parts?.name ?? entry.bodyPartId,
          slug: entry.body_parts?.slug ?? entry.bodyPartId,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      equipments: exercise.exercise_equipments
        .map((entry) => ({
          id: entry.equipmentId,
          name: entry.equipments?.name ?? entry.equipmentId,
          slug: entry.equipments?.slug ?? entry.equipmentId,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      related: [], // Non caricato
    };
  }

  private static buildSnapshot(exercise: ExerciseWithRelations): ExerciseSnapshot {
    const translations = exercise.exercise_translations
      .map((translation) => ({
        locale: translation.locale.toLowerCase(),
        name: translation.name,
        shortName: translation.shortName ?? null,
        description: translation.description ?? null,
        searchTerms: this.sanitizeArray(translation.searchTerms ?? []),
      }))
      .sort((a, b) => a.locale.localeCompare(b.locale));

    const translationMap: ExerciseSnapshot['translations'] = translations.reduce(
      (acc, translation) => {
        acc[translation.locale] = {
          name: translation.name,
          shortName: translation.shortName,
          description: translation.description,
          searchTerms: translation.searchTerms,
        };
        return acc;
      },
      {} as ExerciseSnapshot['translations']
    );

    return {
      slug: exercise.slug,
      exerciseTypeId: exercise.exerciseTypeId ?? null,
      overview: exercise.overview ?? null,
      imageUrl: exercise.imageUrl ?? null,
      videoUrl: exercise.videoUrl ?? null,
      keywords: [...exercise.keywords].sort(),
      instructions: [...exercise.instructions],
      exerciseTips: [...exercise.exerciseTips],
      variations: [...exercise.variations],
      approvalStatus: exercise.approvalStatus,
      isUserGenerated: exercise.isUserGenerated,
      translations: translationMap,
      muscles: exercise.exercise_muscles
        .map((muscle) => ({
          id: muscle.muscleId,
          role: muscle.role,
        }))
        .sort((a, b) => {
          const idCompare = a.id.localeCompare(b.id);
          if (idCompare !== 0) {
            return idCompare;
          }
          return a.role.localeCompare(b.role);
        }),
      bodyParts: exercise.exercise_body_parts
        .map((bodyPart) => bodyPart.bodyPartId)
        .sort((a, b) => a.localeCompare(b)),
      equipments: exercise.exercise_equipments
        .map((equipment) => equipment.equipmentId)
        .sort((a, b) => a.localeCompare(b)),
      relatedFrom: exercise.relatedFrom
        .map((relation) => ({
          toId: relation.toId,
          relation: relation.relation,
        }))
        .sort((a, b) => {
          const relationCompare = a.relation.localeCompare(b.relation);
          if (relationCompare !== 0) {
            return relationCompare;
          }
          return a.toId.localeCompare(b.toId);
        }),
    };
  }

  private static async recordVersion(
    tx: TransactionClient,
    exerciseId: string,
    version: number,
    previousSnapshot: ExerciseSnapshot | null,
    snapshot: ExerciseSnapshot,
    userId?: string,
    metadata?: Prisma.JsonObject
  ) {
    const diff = compare(previousSnapshot ?? {}, snapshot) as Operation[];

    await tx.exercise_versions.create({
      data: {
        exerciseId,
        version,
        diff: toPrismaJsonValue(diff as unknown[]),
        baseVersion: previousSnapshot ? version - 1 : null,
        metadata: {
          ...(metadata ?? {}),
          diffSize: diff.length,
        },
        createdById: userId ?? null,
      },
    });
  }

  private static invalidateCaches() {
    listCache.clear();
    exerciseCache.clear();
  }

  private static buildWhereClause(filters: Partial<ExerciseQueryParams>) {
    const where: Prisma.exercisesWhereInput = {};

    if (!filters.includeUnapproved) {
      where.approvalStatus = ExerciseApprovalStatus.APPROVED;
    }

    if (filters.approvalStatus) {
      where.approvalStatus = filters.approvalStatus;
    }

    if (filters.exerciseTypeId) {
      where.exerciseTypeId = filters.exerciseTypeId;
    }

    if (filters.muscleIds?.length) {
      where.exercise_muscles = {
        some: {
          muscleId: { in: filters.muscleIds },
        },
      };
    }

    if (filters.bodyPartIds?.length) {
      where.exercise_body_parts = {
        some: {
          bodyPartId: { in: filters.bodyPartIds },
        },
      };
    }

    if (filters.equipmentIds?.length) {
      where.exercise_equipments = {
        some: {
          equipmentId: { in: filters.equipmentIds },
        },
      };
    }

    return where;
  }

  private static async countSearchFullText(
    term: string,
    options: {
      locale: string;
      filters: Partial<ExerciseQueryParams>;
    }
  ): Promise<number> {
    const whereClause = this.getSearchConditions(term, options.locale, options.filters);

    // Using a subquery because of the GROUP BY in the full text search logic
    const result = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint as count FROM (
        SELECT e.id
        FROM "exercises" e
        INNER JOIN "exercise_translations" et ON et."exerciseId" = e.id
        WHERE ${whereClause}
        GROUP BY e.id
      ) as sub
    `);

    return Number(result[0]?.count ?? 0);
  }

  private static async searchFullText(
    term: string,
    options: {
      locale: string;
      limit: number;
      offset: number;
      filters: Partial<ExerciseQueryParams>;
    }
  ): Promise<SearchResultRow[]> {
    const query = term.trim();
    if (!query) {
      return [];
    }

    // Use dynamic to_tsvector (like Food service) instead of indexed column
    // This is more reliable as it doesn't require a pre-populated column
    const preparedTerm = query.replace(/[:!&|']/g, ' ');
    const whereClause = this.getSearchConditions(term, options.locale, options.filters);

    const rows = await prisma.$queryRaw<SearchResultRow[]>(Prisma.sql`
      SELECT
        e.id AS id,
        MAX(CASE WHEN et."locale" = ${options.locale} THEN 1 ELSE 0 END)::boolean AS has_locale,
        MAX(
          ts_rank_cd(
            to_tsvector('italian', et.name || ' ' || COALESCE(et.description, '')),
            plainto_tsquery('italian', ${preparedTerm})
          ) * CASE 
            WHEN et."locale" = ${options.locale} THEN 2.0
            WHEN et."locale" = ${DEFAULT_LOCALE} THEN 1.0
            ELSE 0.5
          END
        ) AS rank
      FROM "exercises" e
      INNER JOIN "exercise_translations" et ON et."exerciseId" = e.id
      WHERE ${whereClause}
      GROUP BY e.id
      ORDER BY rank DESC, e."createdAt" DESC
      LIMIT ${options.limit} OFFSET ${options.offset}
    `);

    return rows;
  }

  private static getSearchConditions(
    term: string,
    locale: string,
    filters: Partial<ExerciseQueryParams>
  ): Prisma.Sql {
    const query = term.trim();
    const preparedTerm = query.replace(/[:!&|']/g, ' ');

    const conditions: Prisma.Sql[] = [
      Prisma.sql`(et."locale" = ${locale} OR et."locale" = ${DEFAULT_LOCALE})`,
      Prisma.sql`to_tsvector('italian', et.name || ' ' || COALESCE(et.description, '')) @@ plainto_tsquery('italian', ${preparedTerm})`,
    ];

    if (!filters.includeUnapproved) {
      conditions.push(Prisma.sql`e."approvalStatus" = 'APPROVED'::"ExerciseApprovalStatus"`);
    }

    if (filters.approvalStatus) {
      conditions.push(
        Prisma.sql`e."approvalStatus" = ${filters.approvalStatus}::"ExerciseApprovalStatus"`
      );
    }

    if (filters.exerciseTypeId) {
      conditions.push(Prisma.sql`e."exerciseTypeId" = ${filters.exerciseTypeId}`);
    }

    if (filters.muscleIds?.length) {
      const arraySql = Prisma.sql`ARRAY[${Prisma.join(
        filters.muscleIds.map((muscleId: unknown) => Prisma.sql`${muscleId}`)
      )}]::text[]`;
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "exercise_muscles" em WHERE em."exerciseId" = e.id AND em."muscleId" = ANY(${arraySql}))`
      );
    }

    if (filters.bodyPartIds?.length) {
      const arraySql = Prisma.sql`ARRAY[${Prisma.join(
        filters.bodyPartIds.map((partId: unknown) => Prisma.sql`${partId}`)
      )}]::text[]`;
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "exercise_body_parts" eb WHERE eb."exerciseId" = e.id AND eb."bodyPartId" = ANY(${arraySql}))`
      );
    }

    if (filters.equipmentIds?.length) {
      const arraySql = Prisma.sql`ARRAY[${Prisma.join(
        filters.equipmentIds.map((equipmentId: unknown) => Prisma.sql`${equipmentId}`)
      )}]::text[]`;
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "exercise_equipments" ee WHERE ee."exerciseId" = e.id AND ee."equipmentId" = ANY(${arraySql}))`
      );
    }

    return Prisma.join(conditions, ' AND ');
  }

  private static prepareCreateData(
    payload: CreateExerciseInput,
    options: { userId?: string; autoApprove?: boolean }
  ) {
    // Normalize and deduplicate translations by locale (keep first occurrence)
    const normalizedTranslations = payload.translations.map(
      this.normalizeTranslationInput.bind(this)
    );
    const seenLocales = new Set<string>();
    const translations = normalizedTranslations.filter((translation) => {
      const locale = translation.locale.toLowerCase();
      if (seenLocales.has(locale)) {
        logger.warn(`[ExerciseService] Duplicate translation locale "${locale}" removed`);
        return false;
      }
      seenLocales.add(locale);
      return true;
    });

    const englishTranslation = translations.find(
      (translation) => translation.locale === DEFAULT_LOCALE
    );

    if (!englishTranslation) {
      throw new Error('È richiesta una traduzione in inglese');
    }

    const slug =
      payload.slug?.trim() ||
      toSlug((englishTranslation as Record<string, unknown>).name as string);

    const exerciseId = createId();

    const approvalStatus = options.autoApprove
      ? ExerciseApprovalStatus.APPROVED
      : ExerciseApprovalStatus.PENDING;

    return {
      exercise: {
        id: exerciseId,
        slug,
        exerciseTypeId:
          payload.exerciseTypeId ??
          (() => {
            throw new Error('exerciseTypeId è obbligatorio');
          })(),
        overview: payload.overview ?? null,
        imageUrl: payload.imageUrl ?? null,
        videoUrl: payload.videoUrl ?? null,
        keywords: this.sanitizeArray(payload.keywords),
        instructions: payload.instructions ?? [],
        exerciseTips: payload.exerciseTips ?? [],
        variations: payload.variations ?? [],
        approvalStatus,
        approvedAt: options.autoApprove ? new Date() : null,
        approvedById: options.autoApprove ? (options.userId ?? null) : null,
        isUserGenerated: payload.isUserGenerated ?? false,
        createdById: options.userId ?? null,
        updatedAt: new Date(),
      },
      translations: translations.map((translation) => ({
        id: createId(),
        locale: translation.locale,
        name: translation.name,
        shortName: translation.shortName ?? null,
        description: translation.description ?? null,
        searchTerms: translation.searchTerms,
        updatedAt: new Date(),
      })),
      // NOTA: exerciseId NON deve essere incluso quando si usa createMany all'interno di create
      // Prisma lo gestisce automaticamente dalla relazione padre
      muscles: payload.muscles.map((muscle) => ({
        muscleId: muscle.id,
        role: muscle.role,
      })),
      bodyParts: payload.bodyPartIds.map((bodyPartId) => ({
        bodyPartId,
      })),
      equipments: (payload.equipmentIds ?? []).map((equipmentId) => ({
        equipmentId,
      })),
      related: this.prepareRelatedRelations(exerciseId, payload.relatedExercises ?? []),
    };
  }

  private static prepareUpdateData(
    payload: UpdateExerciseInput,
    existing: ExerciseWithRelations,
    userId?: string
  ) {
    const exerciseUpdate: Prisma.exercisesUpdateInput = {};

    if (payload.slug) {
      exerciseUpdate.slug = payload.slug.trim();
    }

    if (payload.exerciseTypeId !== undefined) {
      exerciseUpdate.exercise_types = payload.exerciseTypeId
        ? { connect: { id: payload.exerciseTypeId } }
        : { disconnect: true };
    }

    if (payload.overview !== undefined) {
      exerciseUpdate.overview = payload.overview ?? null;
    }

    if (payload.imageUrl !== undefined) {
      exerciseUpdate.imageUrl = payload.imageUrl ?? null;
    }

    if (payload.videoUrl !== undefined) {
      exerciseUpdate.videoUrl = payload.videoUrl ?? null;
    }

    if (payload.keywords !== undefined) {
      exerciseUpdate.keywords = this.sanitizeArray(payload.keywords);
    }

    if (payload.instructions !== undefined) {
      exerciseUpdate.instructions = payload.instructions;
    }

    if (payload.exerciseTips !== undefined) {
      exerciseUpdate.exerciseTips = payload.exerciseTips;
    }

    if (payload.variations !== undefined) {
      exerciseUpdate.variations = payload.variations;
    }

    if (payload.isUserGenerated !== undefined) {
      exerciseUpdate.isUserGenerated = payload.isUserGenerated;
    }

    if (payload.approvalStatus && payload.approvalStatus !== existing.approvalStatus) {
      exerciseUpdate.approvalStatus = payload.approvalStatus;
      exerciseUpdate.approvedAt =
        payload.approvalStatus === ExerciseApprovalStatus.APPROVED ? new Date() : null;
      if (payload.approvalStatus === ExerciseApprovalStatus.APPROVED && userId) {
        (exerciseUpdate as Record<string, unknown>).approvedById = userId;
      } else {
        (exerciseUpdate as Record<string, unknown>).approvedById = null;
      }
    }

    const hasExerciseUpdates = Reflect.ownKeys(exerciseUpdate).length > 0;

    return {
      exercise: hasExerciseUpdates ? exerciseUpdate : null,
      translations: payload.translations?.map(this.normalizeTranslationInput.bind(this)),
      muscles: payload.muscles?.map((muscle) => ({
        exerciseId: existing.id,
        muscleId: muscle.id,
        role: muscle.role,
      })),
      bodyParts: payload.bodyPartIds?.map((bodyPartId) => ({
        exerciseId: existing.id,
        bodyPartId,
      })),
      equipments: payload.equipmentIds?.map((equipmentId) => ({
        exerciseId: existing.id,
        equipmentId,
      })),
      related: payload.relatedExercises
        ? this.prepareRelatedRelations(existing.id, payload.relatedExercises)
        : null,
    };
  }

  private static normalizeTranslationInput(
    translation: ExerciseTranslationInput
  ): NormalizedTranslationInput {
    return {
      locale: translation.locale.toLowerCase(),
      name: translation.name.trim(),
      shortName: translation.shortName?.trim() ?? null,
      description: translation.description?.trim() ?? null,
      searchTerms: this.sanitizeArray(translation.searchTerms ?? []),
    };
  }

  private static prepareRelatedRelations(
    exerciseId: string,
    relations: ExerciseRelationInput[]
  ): Prisma.exercise_relationsCreateManyInput[] {
    if (!relations.length) {
      return [];
    }

    const normalizedRelations = relations.map((relation) => ({
      id: createId(),
      fromId: exerciseId,
      toId: relation.id,
      relation: relation.relation,
    }));

    return normalizedRelations;
  }
}

// Export singleton instance
export const exerciseService = ExerciseService;
