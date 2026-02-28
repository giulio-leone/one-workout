import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServiceRegistry, REPO_TOKENS } from '@giulio-leone/core';
import { WorkoutTemplateService } from '../workout-template.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const USER_ID = 'user-1';
const TEMPLATE_ID = 'tmpl-1';
const now = new Date();

function makeTemplateRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: TEMPLATE_ID,
    userId: USER_ID,
    type: 'exercise',
    name: 'Bench Press Template',
    description: 'A bench press template',
    category: 'strength',
    tags: ['chest', 'push'],
    data: {
      id: 'ex-1',
      name: 'Bench Press',
      setGroups: [{ id: 'sg-1', count: 3, baseSet: { reps: 10, rest: 60, weight: 80 }, sets: [] }],
    },
    isPublic: false,
    usageCount: 0,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeExerciseData() {
  return {
    id: 'ex-1',
    name: 'Bench Press',
    setGroups: [{ id: 'sg-1', count: 3, baseSet: { reps: 10, rest: 60, weight: 80 }, sets: [] }],
  };
}

function makeDayData() {
  return {
    dayNumber: 1,
    dayName: 'Push Day',
    name: 'Push',
    exercises: [makeExerciseData()],
    notes: '',
    targetMuscles: [],
    cooldown: '',
  };
}

function makeWeekData() {
  return {
    weekNumber: 1,
    days: [makeDayData()],
  };
}

// ---------------------------------------------------------------------------
// Mock repository
// ---------------------------------------------------------------------------
function createMockTemplateRepo() {
  return {
    findById: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByUser: vi.fn(),
    findByIdForUser: vi.fn(),
    incrementUsage: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('WorkoutTemplateService', () => {
  let repo: ReturnType<typeof createMockTemplateRepo>;

  beforeEach(() => {
    repo = createMockTemplateRepo();
    ServiceRegistry.__setMock(REPO_TOKENS.WORKOUT_TEMPLATE, repo);
  });

  afterEach(() => {
    ServiceRegistry.__clearAll();
  });

  // =========================================================================
  // createTemplate
  // =========================================================================
  describe('createTemplate', () => {
    it('should create an exercise template', async () => {
      const record = makeTemplateRecord();
      repo.create.mockResolvedValue(record);

      const result = await WorkoutTemplateService.createTemplate(USER_ID, {
        type: 'exercise',
        name: 'Bench Press Template',
        tags: ['chest'],
        data: makeExerciseData() as any,
      });

      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(result.id).toBe(TEMPLATE_ID);
      expect(result.name).toBe('Bench Press Template');
      expect(result.type).toBe('exercise');
    });

    it('should create a day template', async () => {
      const record = makeTemplateRecord({ type: 'day', data: makeDayData() });
      repo.create.mockResolvedValue(record);

      const result = await WorkoutTemplateService.createTemplate(USER_ID, {
        type: 'day',
        name: 'Push Day Template',
        data: makeDayData() as any,
      });

      expect(result.type).toBe('day');
    });

    it('should create a week template', async () => {
      const record = makeTemplateRecord({ type: 'week', data: makeWeekData() });
      repo.create.mockResolvedValue(record);

      const result = await WorkoutTemplateService.createTemplate(USER_ID, {
        type: 'week',
        name: 'Week 1 Template',
        data: makeWeekData() as any,
      });

      expect(result.type).toBe('week');
    });

    it('should throw on empty name', async () => {
      await expect(
        WorkoutTemplateService.createTemplate(USER_ID, {
          type: 'exercise',
          name: '',
          data: makeExerciseData() as any,
        })
      ).rejects.toThrow('Il nome del template è obbligatorio');
    });

    it('should throw on whitespace-only name', async () => {
      await expect(
        WorkoutTemplateService.createTemplate(USER_ID, {
          type: 'exercise',
          name: '   ',
          data: makeExerciseData() as any,
        })
      ).rejects.toThrow('Il nome del template è obbligatorio');
    });

    it('should throw on invalid type', async () => {
      await expect(
        WorkoutTemplateService.createTemplate(USER_ID, {
          type: 'invalid' as any,
          name: 'Test',
          data: makeExerciseData() as any,
        })
      ).rejects.toThrow("Il tipo deve essere 'exercise', 'day' o 'week'");
    });

    it('should throw when tags exceed 10', async () => {
      await expect(
        WorkoutTemplateService.createTemplate(USER_ID, {
          type: 'exercise',
          name: 'Test',
          tags: Array.from({ length: 11 }, (_, i) => `tag-${i}`),
          data: makeExerciseData() as any,
        })
      ).rejects.toThrow('Massimo 10 tags consentiti');
    });

    it('should throw for exercise template without setGroups', async () => {
      await expect(
        WorkoutTemplateService.createTemplate(USER_ID, {
          type: 'exercise',
          name: 'Test',
          data: { id: 'ex-1', name: 'Test', setGroups: [] } as any,
        })
      ).rejects.toThrow("L'esercizio deve contenere almeno una serie");
    });

    it('should throw for day template without exercises', async () => {
      await expect(
        WorkoutTemplateService.createTemplate(USER_ID, {
          type: 'day',
          name: 'Test',
          data: { dayNumber: 1, exercises: [] } as any,
        })
      ).rejects.toThrow('Il giorno deve contenere almeno un esercizio');
    });

    it('should throw for week template without days', async () => {
      await expect(
        WorkoutTemplateService.createTemplate(USER_ID, {
          type: 'week',
          name: 'Test',
          data: { weekNumber: 1, days: [] } as any,
        })
      ).rejects.toThrow('La settimana deve contenere almeno un giorno');
    });

    it('should trim name and description', async () => {
      const record = makeTemplateRecord({ name: 'Trimmed', description: 'Desc' });
      repo.create.mockResolvedValue(record);

      await WorkoutTemplateService.createTemplate(USER_ID, {
        type: 'exercise',
        name: '  Trimmed  ',
        description: '  Desc  ',
        data: makeExerciseData() as any,
      });

      const createArg = repo.create.mock.calls[0][0];
      expect(createArg.name).toBe('Trimmed');
      expect(createArg.description).toBe('Desc');
    });
  });

  // =========================================================================
  // listTemplates
  // =========================================================================
  describe('listTemplates', () => {
    it('should return mapped templates', async () => {
      repo.findByUser.mockResolvedValue([makeTemplateRecord()]);

      const result = await WorkoutTemplateService.listTemplates(USER_ID);

      expect(repo.findByUser).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(TEMPLATE_ID);
    });

    it('should pass filter options to repo', async () => {
      repo.findByUser.mockResolvedValue([]);

      await WorkoutTemplateService.listTemplates(USER_ID, {
        type: 'exercise' as any,
        category: 'strength',
        tags: ['chest'],
        search: 'bench',
        limit: 10,
        offset: 5,
      });

      const args = repo.findByUser.mock.calls[0];
      expect(args[0]).toBe(USER_ID);
      expect(args[1]).toMatchObject({
        type: 'exercise',
        category: 'strength',
        tags: ['chest'],
        search: 'bench',
        take: 10,
        skip: 5,
      });
    });

    it('should ignore search strings shorter than 2 chars', async () => {
      repo.findByUser.mockResolvedValue([]);

      await WorkoutTemplateService.listTemplates(USER_ID, { search: 'a' });

      const opts = repo.findByUser.mock.calls[0][1];
      expect(opts.search).toBeUndefined();
    });
  });

  // =========================================================================
  // getTemplateById
  // =========================================================================
  describe('getTemplateById', () => {
    it('should return mapped template when found', async () => {
      repo.findByIdForUser.mockResolvedValue(makeTemplateRecord());

      const result = await WorkoutTemplateService.getTemplateById(TEMPLATE_ID, USER_ID);

      expect(repo.findByIdForUser).toHaveBeenCalledWith(TEMPLATE_ID, USER_ID);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(TEMPLATE_ID);
    });

    it('should return null when not found', async () => {
      repo.findByIdForUser.mockResolvedValue(null);

      const result = await WorkoutTemplateService.getTemplateById('nonexistent', USER_ID);

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // updateTemplate
  // =========================================================================
  describe('updateTemplate', () => {
    it('should update and return the mapped template', async () => {
      const existing = makeTemplateRecord();
      repo.findByIdForUser.mockResolvedValue(existing);
      repo.update.mockResolvedValue({ ...existing, name: 'Updated' });

      const result = await WorkoutTemplateService.updateTemplate(TEMPLATE_ID, USER_ID, {
        name: 'Updated',
      });

      expect(repo.update).toHaveBeenCalledWith(TEMPLATE_ID, { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('should throw when template is not found', async () => {
      repo.findByIdForUser.mockResolvedValue(null);

      await expect(
        WorkoutTemplateService.updateTemplate('nonexistent', USER_ID, { name: 'x' })
      ).rejects.toThrow('Template non trovato o non autorizzato');
    });

    it('should throw when tags exceed 10 on update', async () => {
      repo.findByIdForUser.mockResolvedValue(makeTemplateRecord());

      await expect(
        WorkoutTemplateService.updateTemplate(TEMPLATE_ID, USER_ID, {
          tags: Array.from({ length: 11 }, (_, i) => `t${i}`),
        })
      ).rejects.toThrow('Massimo 10 tags consentiti');
    });

    it('should validate template data on update', async () => {
      repo.findByIdForUser.mockResolvedValue(makeTemplateRecord({ type: 'exercise' }));

      await expect(
        WorkoutTemplateService.updateTemplate(TEMPLATE_ID, USER_ID, {
          data: { id: 'ex-1', name: 'Bad', setGroups: [] } as any,
        })
      ).rejects.toThrow("L'esercizio deve contenere almeno una serie");
    });
  });

  // =========================================================================
  // deleteTemplate
  // =========================================================================
  describe('deleteTemplate', () => {
    it('should delete the template', async () => {
      repo.findByIdForUser.mockResolvedValue(makeTemplateRecord());
      repo.delete.mockResolvedValue(undefined);

      await WorkoutTemplateService.deleteTemplate(TEMPLATE_ID, USER_ID);

      expect(repo.delete).toHaveBeenCalledWith(TEMPLATE_ID);
    });

    it('should throw when template is not found', async () => {
      repo.findByIdForUser.mockResolvedValue(null);

      await expect(
        WorkoutTemplateService.deleteTemplate('nonexistent', USER_ID)
      ).rejects.toThrow('Template non trovato o non autorizzato');
    });
  });

  // =========================================================================
  // incrementUsage
  // =========================================================================
  describe('incrementUsage', () => {
    it('should call repo.incrementUsage', async () => {
      repo.incrementUsage.mockResolvedValue(undefined);

      await WorkoutTemplateService.incrementUsage(TEMPLATE_ID);

      expect(repo.incrementUsage).toHaveBeenCalledWith(TEMPLATE_ID);
    });
  });

  // =========================================================================
  // getAvailableCategories
  // =========================================================================
  describe('getAvailableCategories', () => {
    it('should return a non-empty array of strings', () => {
      const categories = WorkoutTemplateService.getAvailableCategories();

      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBeGreaterThan(0);
      expect(categories).toContain('strength');
      expect(categories).toContain('cardio');
    });
  });
});
