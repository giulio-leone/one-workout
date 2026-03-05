import { getExerciseRepo } from '@giulio-leone/core';
import type { ExerciseSearchFilters } from '@giulio-leone/core/repositories';
import { createId, toSlug } from '@giulio-leone/lib-shared/utils';
import type {
  CreateExerciseInput,
  ExerciseQueryParams,
  ExerciseRelationInput,
  ExerciseTranslationInput,
  UpdateExerciseInput,
} from '@giulio-leone/schemas/exercise';
import type { LocalizedExercise, ExerciseTranslationView } from '@giulio-leone/types';
import type { Operation } from 'fast-json-patch';
import { compare } from 'fast-json-patch';
import { SimpleCache } from '@giulio-leone/lib-shared';

const DEFAULT_LOCALE = 'en';
// Cache disabilitata per debug e consistenza dati
const LIST_CACHE_TTL_MS = 0;
const EXERCISE_CACHE_TTL_MS = 1000 * 60 * 10; // 10 minuti
const MAX_LIST_PAGE_SIZE = 100;

// Internal types matching the shape returned by the repository
interface ExerciseTranslationRow {
  locale: string;
  name: string;
  shortName: string | null;
  description: string | null;
  searchTerms: string[];
}

interface ExerciseWithRelations {
  id: string;
  slug: string;
  exerciseTypeId: string | null;
  overview: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  keywords: string[];
  instructions: string[];
  exerciseTips: string[];
  variations: string[];
  approvalStatus: string;
  approvedAt: Date | null;
  isUserGenerated: boolean;
  version: number;
  exercise_translations: ExerciseTranslationRow[];
  exercise_types: { name: string } | null;
  exercise_muscles: Array<{
    muscleId: string;
    role: string;
    muscles: { name: string; slug: string } | null;
  }>;
  exercise_body_parts: Array<{
    bodyPartId: string;
    body_parts: { name: string; slug: string } | null;
  }>;
  exercise_equipments: Array<{
    equipmentId: string;
    equipments: { name: string; slug: string } | null;
  }>;
  relatedFrom: Array<{
    toId: string;
    relation: string;
    exercises_exercise_relations_toIdToexercises?: { id: string; slug: string } | null;
  }>;
  relatedTo: Array<{
    fromId: string;
    relation: string;
    exercises_exercise_relations_fromIdToexercises?: { id: string; slug: string } | null;
  }>;
}

interface ExerciseListRow {
  id: string;
  slug: string;
  exerciseTypeId: string | null;
  approvalStatus: string;
  approvedAt: Date | null;
  isUserGenerated: boolean;
  version: number;
  imageUrl: string | null;
  videoUrl: string | null;
  overview: string | null;
  keywords: string[];
  exercise_translations: Array<{
    locale: string;
    name: string;
    shortName: string | null;
  }>;
  exercise_types: { name: string } | null;
  exercise_muscles: Array<{
    role: string;
    muscleId: string;
    muscles: { name: string; slug: string } | null;
  }>;
  exercise_equipments: Array<{
    equipmentId: string;
    equipments: { name: string; slug: string } | null;
  }>;
  exercise_body_parts: Array<{
    bodyPartId: string;
    body_parts: { name: string; slug: string } | null;
  }>;
}

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
  approvalStatus: string;
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
    role: string;
  }>;
  bodyParts: string[]; // IDs
  equipments: string[]; // IDs
  relatedFrom: Array<{
    toId: string;
    relation: string;
  }>;
}

// Remote local interfaces in favor of @onecoach/types equivalents
// export interface ExerciseTranslationView { ... }
// export interface LocalizedExercise { ... }

// SSOT: Usa direttamente ExercisesResponse<LocalizedExercise> da lib-api
// Nessuna duplicazione - tutti i service devono usare i tipi da lib-api come unica fonte di verità
import type { ExercisesResponse } from '@giulio-leone/lib-api';

import { logger } from '@giulio-leone/lib-core/logger.service';
// Tipo helper per garantire che page, pageSize, total siano sempre presenti
// Questo è compatibile con ExercisesResponse che li ha opzionali
// NOTA: Questo è un tipo interno al service, non un'interfaccia pubblica duplicata
type ExerciseListResult = Omit<ExercisesResponse, 'data'> & {
  data: LocalizedExercise[];
  page: number;
  pageSize: number;
  total: number;
};

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
      const repo = getExerciseRepo();
      const searchFilters: ExerciseSearchFilters = {
        includeUnapproved: filters.includeUnapproved,
        approvalStatus: filters.approvalStatus,
        exerciseTypeId: filters.exerciseTypeId,
        muscleIds: filters.muscleIds,
        bodyPartIds: filters.bodyPartIds,
        equipmentIds: filters.equipmentIds,
      };
      const total = await repo.countSearchExercisesFullText(search, {
        locale,
        filters: searchFilters,
      });

      if (total === 0) {
        return {
          data: [],
          page,
          pageSize,
          total,
        };
      }

      const searchResults = await repo.searchExercisesFullText(search, {
        locale,
        limit: pageSize,
        offset: (page - 1) * pageSize,
        filters: searchFilters,
      });

      const pageIds = searchResults.map((row: any) => row.id);

      const exercises = await repo.findExercisesByIdsForList(pageIds);

      const exerciseById = new Map(exercises.map((exercise: any) => [exercise.id, exercise]));
      const localized = pageIds
        .map((id: any) => exerciseById.get(id))
        .filter((exercise): exercise is ExerciseListRow => Boolean(exercise))
        .map((exercise: any) => this.mapListRowToLocalized(exercise, locale));

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
    const { count: total, items: exercises } = await getExerciseRepo().findExercisesPage(
      where,
      (page - 1) * pageSize,
      pageSize,
    );

    const data = exercises.map((exercise: any) => this.mapListRowToLocalized(exercise, locale));

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
    const repo = getExerciseRepo();
    const searchFilters: ExerciseSearchFilters = {
      includeUnapproved: filters.includeUnapproved,
      approvalStatus: filters.approvalStatus,
      exerciseTypeId: filters.exerciseTypeId,
      muscleIds: filters.muscleIds,
      bodyPartIds: filters.bodyPartIds,
      equipmentIds: filters.equipmentIds,
    };
    const searchResults = await repo.searchExercisesFullText(term, {
      locale,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      filters: searchFilters,
    });

    // Note: search() method returns just the paginated slice as LocalizedExercise[] without total count
    // This maintains backward compatibility with the existing method signature
    const uniqueIds = Array.from(new Set(searchResults.map((row: any) => row.id)));
    const pageIds = uniqueIds; // searchFullText now returns paginated results directly without extra duplicates

    if (!pageIds.length) {
      return [];
    }

    // Usa select ottimizzata anche per la ricerca
    const exercises = await repo.findExercisesByIdsForList(pageIds);

    const exerciseById = new Map(exercises.map((exercise: any) => [exercise.id, exercise]));

    return pageIds
      .map((id: any) => exerciseById.get(id))
      .filter((exercise): exercise is ExerciseListRow => Boolean(exercise))
      .map((exercise: any) => this.mapListRowToLocalized(exercise, locale));
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
      if (options.includeUnapproved || cached.approvalStatus === 'APPROVED') {
        return cached;
      }
      exerciseCache.delete(cacheKey);
    }

    const raw = await getExerciseRepo().findExerciseWithRelations({
      id,
      ...(options.includeUnapproved ? {} : { approvalStatus: 'APPROVED' }),
    });

    if (!raw) {
      return null;
    }
    const exercise = raw as unknown as ExerciseWithRelations;

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

    const raw = await getExerciseRepo().findExerciseWithRelations({
      slug,
      ...(options.includeUnapproved ? {} : { approvalStatus: 'APPROVED' }),
    });

    if (!raw) {
      return null;
    }
    const exercise = raw as unknown as ExerciseWithRelations;

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

    const result = await getExerciseRepo().createExerciseWithRelationsTx({
      exerciseData: {
        ...data.exercise,
        exercise_translations: { create: data.translations },
        exercise_muscles: { createMany: { data: data.muscles } },
        exercise_body_parts: { createMany: { data: data.bodyParts, skipDuplicates: true } },
        exercise_equipments: { createMany: { data: data.equipments, skipDuplicates: true } },
      },
      related: data.related,
    });

    const created = result as unknown as ExerciseWithRelations;
    const snapshot = this.buildSnapshot(created);
    await this.recordVersion(created.id, created.version, null, snapshot, options.userId, {
      event: 'CREATE',
    });

    this.invalidateCaches();
    return this.mapExerciseToLocalized(created, DEFAULT_LOCALE, false);
  }

  static async update(
    id: string,
    payload: UpdateExerciseInput,
    options: { userId?: string; locale?: string; includeTranslations?: boolean } = {}
  ): Promise<LocalizedExercise> {
    const normalizedLocale = this.normalizeLocale(options.locale ?? DEFAULT_LOCALE);

    const repo = getExerciseRepo();

    // Fetch existing for prepareUpdateData (needs approvalStatus)
    const existingRaw = await repo.findExerciseWithRelations({ id });
    if (!existingRaw) {
      throw new Error('Exercise non trovato');
    }
    const existing = existingRaw as unknown as ExerciseWithRelations;
    const updateData = this.prepareUpdateData(payload, existing, options.userId);

    // Prepare translation operations for the repository
    let translationUpserts:
      | Array<{
          where: Record<string, unknown>;
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }>
      | undefined;
    let translationDeleteWhere: Record<string, unknown> | undefined;

    if (updateData.translations) {
      // Deduplicate translations by locale (keep first occurrence)
      const seenLocales = new Set<string>();
      const uniqueTranslations = updateData.translations.filter((translation: any) => {
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

      const locales = uniqueTranslations.map((translation: any) => translation.locale);
      translationUpserts = uniqueTranslations.map((translation: any) => ({
        where: { exerciseId_locale: { exerciseId: id, locale: translation.locale } },
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
      }));
      translationDeleteWhere = { exerciseId: id, locale: { notIn: locales } };
    }

    const { previous, updated } = await repo.updateExerciseWithRelationsTx(id, {
      exerciseUpdate: updateData.exercise ?? undefined,
      translationUpserts,
      translationDeleteWhere,
      muscleItems: updateData.muscles,
      bodyPartItems: updateData.bodyParts,
      equipmentItems: updateData.equipments,
      relationItems: updateData.related,
    });

    // Record version
    const prev = previous as unknown as ExerciseWithRelations;
    const upd = updated as unknown as ExerciseWithRelations;
    const previousSnapshot = this.buildSnapshot(prev);
    const snapshot = this.buildSnapshot(upd);
    const diff = compare(previousSnapshot, snapshot) as Operation[];

    await this.recordVersion(id, upd.version, previousSnapshot, snapshot, options.userId, {
      event: 'UPDATE',
      changes: diff.length,
    });

    const result = upd;

    this.invalidateCaches();
    return this.mapExerciseToLocalized(
      result,
      normalizedLocale,
      options.includeTranslations ?? false
    );
  }

  static async setApprovalStatus(
    id: string,
    status: string,
    options: { userId: string }
  ): Promise<LocalizedExercise> {
    const isApproved = status === 'APPROVED';
    const approvedAt = isApproved ? new Date() : null;
    const approvedById = isApproved ? options.userId : null;

    const { previous, updated } = await getExerciseRepo().setApprovalStatusTx(id, {
      approvalStatus: status,
      approvedAt,
      approvedById,
    });

    const prev = previous as unknown as ExerciseWithRelations;
    const upd = updated as unknown as ExerciseWithRelations;
    const previousSnapshot = this.buildSnapshot(prev);
    const snapshot = this.buildSnapshot(upd);

    await this.recordVersion(
      id,
      upd.version,
      previousSnapshot,
      snapshot,
      options.userId,
      {
        event: 'APPROVAL',
        approvalStatus: status,
      }
    );

    const result = upd;

    this.invalidateCaches();
    return this.mapExerciseToLocalized(result, DEFAULT_LOCALE, true);
  }

  static async delete(id: string): Promise<{ id: string; slug: string }> {
    const deleted = await getExerciseRepo().deleteExercise(id);

    this.invalidateCaches();
    return deleted;
  }

  static async deleteMany(ids: string[]): Promise<{ deleted: number }> {
    if (!ids.length) {
      return { deleted: 0 };
    }

    const count = await getExerciseRepo().deleteExercises(ids);

    this.invalidateCaches();
    return { deleted: count };
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
          .filter((value: any) => Boolean(value))
          .map((value: any) => value.trim().toLowerCase())
          .filter((value: any) => value.length > 0)
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
    const exact = translations.find((translation: any) => translation.locale === normalizedLocale);
    if (exact) {
      return { translation: exact, fallbackLocale: null };
    }

    const [language] = normalizedLocale.split('-');
    if (!language) {
      const english = translations.find((translation: any) => translation.locale === DEFAULT_LOCALE);
      if (english) {
        return { translation: english, fallbackLocale: english.locale };
      }
      return { translation: null, fallbackLocale: null };
    }
    const sameLanguage = translations.find((translation: any) =>
      translation.locale.startsWith(language)
    );
    if (sameLanguage) {
      return { translation: sameLanguage, fallbackLocale: sameLanguage.locale };
    }

    const english = translations.find((translation: any) => translation.locale === DEFAULT_LOCALE);
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
      approvalStatus: exercise.approvalStatus as LocalizedExercise['approvalStatus'],
      approvedAt: exercise.approvedAt ?? null,
      isUserGenerated: exercise.isUserGenerated,
      version: exercise.version,
      locale,
      translation,
      fallbackLocale,
      translations: includeTranslations ? translations : undefined,
      muscles: exercise.exercise_muscles
        .map((entry: any) => ({
          id: entry.muscleId, // ID per uso interno (admin form)
          name: entry.muscles?.name ?? entry.muscleId,
          slug: entry.muscles?.slug ?? entry.muscleId,
          role: entry.role,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      bodyParts: exercise.exercise_body_parts
        .map((entry: any) => ({
          id: entry.bodyPartId, // ID per uso interno (admin form)
          name: entry.body_parts?.name ?? entry.bodyPartId,
          slug: entry.body_parts?.slug ?? entry.bodyPartId,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      equipments: exercise.exercise_equipments
        .map((entry: any) => ({
          id: entry.equipmentId, // ID per uso interno (admin form)
          name: entry.equipments?.name ?? entry.equipmentId,
          slug: entry.equipments?.slug ?? entry.equipmentId,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      related: [
        ...exercise.relatedFrom.map((relation: any) => ({
          id: relation.toId,
          slug: relation.exercises_exercise_relations_toIdToexercises?.slug ?? relation.toId,
          relation: relation.relation,
          direction: 'outbound' as const,
        })),
        ...exercise.relatedTo.map((relation: any) => ({
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
      approvalStatus: exercise.approvalStatus as LocalizedExercise['approvalStatus'],
      approvedAt: exercise.approvedAt ?? null,
      isUserGenerated: exercise.isUserGenerated,
      version: exercise.version,
      locale,
      translation,
      fallbackLocale,
      translations: translations,
      muscles: exercise.exercise_muscles
        .map((entry: any) => ({
          id: entry.muscleId,
          name: entry.muscles?.name ?? entry.muscleId,
          slug: entry.muscles?.slug ?? entry.muscleId,
          role: entry.role,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      bodyParts: exercise.exercise_body_parts
        .map((entry: any) => ({
          id: entry.bodyPartId,
          name: entry.body_parts?.name ?? entry.bodyPartId,
          slug: entry.body_parts?.slug ?? entry.bodyPartId,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      equipments: exercise.exercise_equipments
        .map((entry: any) => ({
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
      .map((translation: any) => ({
        locale: translation.locale.toLowerCase(),
        name: translation.name,
        shortName: translation.shortName ?? null,
        description: translation.description ?? null,
        searchTerms: this.sanitizeArray(translation.searchTerms ?? []),
      }))
      .sort((a, b) => a.locale.localeCompare(b.locale));

    const translationMap: ExerciseSnapshot['translations'] = translations.reduce((acc: any, translation: any) => {
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
        .map((muscle: any) => ({
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
        .map((bodyPart: any) => bodyPart.bodyPartId)
        .sort((a, b) => a.localeCompare(b)),
      equipments: exercise.exercise_equipments
        .map((equipment: any) => equipment.equipmentId)
        .sort((a, b) => a.localeCompare(b)),
      relatedFrom: exercise.relatedFrom
        .map((relation: any) => ({
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
    exerciseId: string,
    version: number,
    previousSnapshot: ExerciseSnapshot | null,
    snapshot: ExerciseSnapshot,
    userId?: string,
    metadata?: Record<string, unknown>
  ) {
    const diff = compare(previousSnapshot ?? {}, snapshot) as Operation[];

    await getExerciseRepo().recordExerciseVersion({
      exerciseId,
      version,
      diff,
      baseVersion: previousSnapshot ? version - 1 : null,
      metadata: {
        ...(metadata ?? {}),
        diffSize: diff.length,
      },
      createdById: userId ?? null,
    });
  }

  private static invalidateCaches() {
    listCache.clear();
    exerciseCache.clear();
  }

  private static buildWhereClause(filters: Partial<ExerciseQueryParams>) {
    const where: Record<string, unknown> = {};

    if (!filters.includeUnapproved) {
      where.approvalStatus = 'APPROVED';
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

  private static prepareCreateData(
    payload: CreateExerciseInput,
    options: { userId?: string; autoApprove?: boolean }
  ) {
    // Normalize and deduplicate translations by locale (keep first occurrence)
    const normalizedTranslations = payload.translations.map(
      this.normalizeTranslationInput.bind(this)
    );
    const seenLocales = new Set<string>();
    const translations = normalizedTranslations.filter((translation: any) => {
      const locale = translation.locale.toLowerCase();
      if (seenLocales.has(locale)) {
        logger.warn(`[ExerciseService] Duplicate translation locale "${locale}" removed`);
        return false;
      }
      seenLocales.add(locale);
      return true;
    });

    const englishTranslation = translations.find((translation: any) => translation.locale === DEFAULT_LOCALE
    );

    if (!englishTranslation) {
      throw new Error('È richiesta una traduzione in inglese');
    }

    const slug =
      payload.slug?.trim() ||
      toSlug((englishTranslation as Record<string, unknown>).name as string);

    const exerciseId = createId();

    const approvalStatus = options.autoApprove
      ? 'APPROVED'
      : 'PENDING';

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
      translations: translations.map((translation: any) => ({
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
      muscles: payload.muscles.map((muscle: any) => ({
        muscleId: muscle.id,
        role: muscle.role,
      })),
      bodyParts: payload.bodyPartIds.map((bodyPartId: any) => ({
        bodyPartId,
      })),
      equipments: (payload.equipmentIds ?? []).map((equipmentId: any) => ({
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
    const exerciseUpdate: Record<string, unknown> = {};

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
        payload.approvalStatus === 'APPROVED' ? new Date() : null;
      if (payload.approvalStatus === 'APPROVED' && userId) {
        (exerciseUpdate as Record<string, unknown>).approvedById = userId;
      } else {
        (exerciseUpdate as Record<string, unknown>).approvedById = null;
      }
    }

    const hasExerciseUpdates = Reflect.ownKeys(exerciseUpdate).length > 0;

    return {
      exercise: hasExerciseUpdates ? exerciseUpdate : null,
      translations: payload.translations?.map(this.normalizeTranslationInput.bind(this)),
      muscles: payload.muscles?.map((muscle: any) => ({
        exerciseId: existing.id,
        muscleId: muscle.id,
        role: muscle.role,
      })),
      bodyParts: payload.bodyPartIds?.map((bodyPartId: any) => ({
        exerciseId: existing.id,
        bodyPartId,
      })),
      equipments: payload.equipmentIds?.map((equipmentId: any) => ({
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
  ): Record<string, unknown>[] {
    if (!relations.length) {
      return [];
    }

    const normalizedRelations = relations.map((relation: any) => ({
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
