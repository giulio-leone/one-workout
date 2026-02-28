import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServiceRegistry, REPO_TOKENS } from '@giulio-leone/core';
import {
  createWorkoutSession,
  getWorkoutSession,
  getWorkoutSessions,
  getProgramSessions,
  updateWorkoutSession,
  deleteWorkoutSession,
  getWorkoutProgramStats,
  hasSessionForDay,
  getActiveSessionForDay,
  getLatestProgramSession,
} from '../workout-tracking.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const USER_ID = 'user-1';
const PROGRAM_ID = 'program-1';
const SESSION_ID = 'session-1';

const now = new Date();

function makeSessionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    userId: USER_ID,
    programId: PROGRAM_ID,
    weekNumber: 1,
    dayNumber: 1,
    startedAt: now,
    completedAt: null,
    exercises: [],
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeProgramRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: PROGRAM_ID,
    userId: USER_ID,
    name: 'Test Program',
    weeks: [
      {
        weekNumber: 1,
        days: [
          {
            dayNumber: 1,
            exercises: [
              { id: 'ex-1', name: 'Squat', setGroups: [] },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock repositories
// ---------------------------------------------------------------------------
function createMockSessionRepo() {
  return {
    findById: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByUser: vi.fn(),
    findByProgram: vi.fn(),
    findForDay: vi.fn(),
    findActiveForDay: vi.fn(),
    findLatest: vi.fn(),
    countCompleted: vi.fn(),
  };
}

function createMockWorkoutRepo() {
  return {
    findById: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByUserId: vi.fn(),
    findByStatus: vi.fn(),
    findManyForUser: vi.fn(),
    createWorkout: vi.fn(),
    findByIdForActor: vi.fn(),
    findByIdAndUserId: vi.fn(),
    findOwnedIds: vi.fn(),
    deleteManyByUser: vi.fn(),
    findPlanById: vi.fn(),
    getWorkoutVersions: vi.fn(),
    findVersionByNumber: vi.fn(),
    createVersion: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('workout-tracking.service', () => {
  let sessionRepo: ReturnType<typeof createMockSessionRepo>;
  let workoutRepo: ReturnType<typeof createMockWorkoutRepo>;

  beforeEach(() => {
    sessionRepo = createMockSessionRepo();
    workoutRepo = createMockWorkoutRepo();
    ServiceRegistry.__setMock(REPO_TOKENS.WORKOUT_SESSION, sessionRepo);
    ServiceRegistry.__setMock(REPO_TOKENS.WORKOUT, workoutRepo);
  });

  afterEach(() => {
    ServiceRegistry.__clearAll();
  });

  // =========================================================================
  // createWorkoutSession
  // =========================================================================
  describe('createWorkoutSession', () => {
    it('should return existing session if one already exists for the day', async () => {
      const existing = makeSessionRecord();
      sessionRepo.findForDay.mockResolvedValue(existing);

      const result = await createWorkoutSession(USER_ID, {
        programId: PROGRAM_ID,
        weekNumber: 1,
        dayNumber: 1,
      });

      expect(sessionRepo.findForDay).toHaveBeenCalledWith(USER_ID, PROGRAM_ID, 1, 1);
      expect(result.id).toBe(SESSION_ID);
      // Should NOT create a new session
      expect(sessionRepo.create).not.toHaveBeenCalled();
    });

    it('should create a new session when none exists', async () => {
      sessionRepo.findForDay.mockResolvedValue(null);
      workoutRepo.findById.mockResolvedValue(makeProgramRecord());
      const created = makeSessionRecord();
      sessionRepo.create.mockResolvedValue(created);

      const result = await createWorkoutSession(USER_ID, {
        programId: PROGRAM_ID,
        weekNumber: 1,
        dayNumber: 1,
        notes: 'test',
      });

      expect(workoutRepo.findById).toHaveBeenCalledWith(PROGRAM_ID);
      expect(sessionRepo.create).toHaveBeenCalledTimes(1);
      expect(result.id).toBe(SESSION_ID);
    });

    it('should throw if program is not found', async () => {
      sessionRepo.findForDay.mockResolvedValue(null);
      workoutRepo.findById.mockResolvedValue(null);

      await expect(
        createWorkoutSession(USER_ID, { programId: PROGRAM_ID, weekNumber: 1, dayNumber: 1 })
      ).rejects.toThrow('Programma di allenamento non trovato');
    });

    it('should throw if user does not own the program', async () => {
      sessionRepo.findForDay.mockResolvedValue(null);
      workoutRepo.findById.mockResolvedValue(makeProgramRecord({ userId: 'other-user' }));

      await expect(
        createWorkoutSession(USER_ID, { programId: PROGRAM_ID, weekNumber: 1, dayNumber: 1 })
      ).rejects.toThrow('Non hai i permessi');
    });

    it('should throw if week is not found', async () => {
      sessionRepo.findForDay.mockResolvedValue(null);
      workoutRepo.findById.mockResolvedValue(makeProgramRecord());

      await expect(
        createWorkoutSession(USER_ID, { programId: PROGRAM_ID, weekNumber: 99, dayNumber: 1 })
      ).rejects.toThrow(/Settimana 99/);
    });

    it('should throw if day is not found in week', async () => {
      sessionRepo.findForDay.mockResolvedValue(null);
      workoutRepo.findById.mockResolvedValue(makeProgramRecord());

      await expect(
        createWorkoutSession(USER_ID, { programId: PROGRAM_ID, weekNumber: 1, dayNumber: 99 })
      ).rejects.toThrow(/Giorno 99/);
    });

    it('should handle weeks stored as JSON string', async () => {
      const program = makeProgramRecord();
      // Simulate JSON-string weeks from DB
      program.weeks = JSON.stringify(program.weeks);
      sessionRepo.findForDay.mockResolvedValue(null);
      workoutRepo.findById.mockResolvedValue(program);
      sessionRepo.create.mockResolvedValue(makeSessionRecord());

      const result = await createWorkoutSession(USER_ID, {
        programId: PROGRAM_ID,
        weekNumber: 1,
        dayNumber: 1,
      });

      expect(result.id).toBe(SESSION_ID);
    });
  });

  // =========================================================================
  // getWorkoutSession
  // =========================================================================
  describe('getWorkoutSession', () => {
    it('should return the mapped session when found', async () => {
      sessionRepo.findById.mockResolvedValue(makeSessionRecord());

      const result = await getWorkoutSession(SESSION_ID, USER_ID);

      expect(sessionRepo.findById).toHaveBeenCalledWith(SESSION_ID);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(SESSION_ID);
    });

    it('should return null when session is not found', async () => {
      sessionRepo.findById.mockResolvedValue(null);

      const result = await getWorkoutSession('nonexistent', USER_ID);

      expect(result).toBeNull();
    });

    it('should throw if user does not own the session', async () => {
      sessionRepo.findById.mockResolvedValue(makeSessionRecord({ userId: 'other-user' }));

      await expect(getWorkoutSession(SESSION_ID, USER_ID)).rejects.toThrow(
        'Non hai i permessi'
      );
    });
  });

  // =========================================================================
  // getWorkoutSessions
  // =========================================================================
  describe('getWorkoutSessions', () => {
    it('should return mapped sessions for user', async () => {
      const sessions = [makeSessionRecord(), makeSessionRecord({ id: 'session-2' })];
      sessionRepo.findByUser.mockResolvedValue(sessions);

      const result = await getWorkoutSessions(USER_ID);

      expect(sessionRepo.findByUser).toHaveBeenCalledWith(USER_ID, undefined, undefined);
      expect(result).toHaveLength(2);
    });

    it('should pass programId and limit when provided', async () => {
      sessionRepo.findByUser.mockResolvedValue([]);

      await getWorkoutSessions(USER_ID, PROGRAM_ID, 5);

      expect(sessionRepo.findByUser).toHaveBeenCalledWith(USER_ID, PROGRAM_ID, 5);
    });
  });

  // =========================================================================
  // getProgramSessions
  // =========================================================================
  describe('getProgramSessions', () => {
    it('should delegate to getWorkoutSessions with programId', async () => {
      sessionRepo.findByUser.mockResolvedValue([makeSessionRecord()]);

      const result = await getProgramSessions(PROGRAM_ID, USER_ID);

      expect(sessionRepo.findByUser).toHaveBeenCalledWith(USER_ID, PROGRAM_ID, undefined);
      expect(result).toHaveLength(1);
    });
  });

  // =========================================================================
  // updateWorkoutSession
  // =========================================================================
  describe('updateWorkoutSession', () => {
    it('should update and return the mapped session', async () => {
      const original = makeSessionRecord();
      sessionRepo.findById.mockResolvedValue(original);
      const updated = makeSessionRecord({ notes: 'updated' });
      sessionRepo.update.mockResolvedValue(updated);

      const result = await updateWorkoutSession(SESSION_ID, USER_ID, { notes: 'updated' });

      expect(sessionRepo.update).toHaveBeenCalledWith(SESSION_ID, { notes: 'updated' });
      expect(result.id).toBe(SESSION_ID);
    });

    it('should throw if session is not found', async () => {
      sessionRepo.findById.mockResolvedValue(null);

      await expect(
        updateWorkoutSession('nonexistent', USER_ID, { notes: 'x' })
      ).rejects.toThrow('Sessione non trovata');
    });

    it('should include exercises and completedAt in update payload', async () => {
      sessionRepo.findById.mockResolvedValue(makeSessionRecord());
      sessionRepo.update.mockResolvedValue(makeSessionRecord());
      const completedAt = new Date();
      const exercises = [{ id: 'ex-1', name: 'Bench', setGroups: [] }];

      await updateWorkoutSession(SESSION_ID, USER_ID, { exercises: exercises as any, completedAt });

      expect(sessionRepo.update).toHaveBeenCalledWith(SESSION_ID, {
        exercises,
        completedAt,
      });
    });
  });

  // =========================================================================
  // deleteWorkoutSession
  // =========================================================================
  describe('deleteWorkoutSession', () => {
    it('should delete the session', async () => {
      sessionRepo.findById.mockResolvedValue(makeSessionRecord());
      sessionRepo.delete.mockResolvedValue(undefined);

      await deleteWorkoutSession(SESSION_ID, USER_ID);

      expect(sessionRepo.delete).toHaveBeenCalledWith(SESSION_ID);
    });

    it('should throw if session is not found', async () => {
      sessionRepo.findById.mockResolvedValue(null);

      await expect(deleteWorkoutSession('nonexistent', USER_ID)).rejects.toThrow(
        'Sessione non trovata'
      );
    });
  });

  // =========================================================================
  // getWorkoutProgramStats
  // =========================================================================
  describe('getWorkoutProgramStats', () => {
    it('should return zero stats for empty sessions', async () => {
      sessionRepo.findByUser.mockResolvedValue([]);

      const stats = await getWorkoutProgramStats(PROGRAM_ID, USER_ID);

      expect(stats.programId).toBe(PROGRAM_ID);
      expect(stats.totalSessions).toBe(0);
      expect(stats.completedSessions).toBe(0);
      expect(stats.inProgressSessions).toBe(0);
      expect(stats.completionRate).toBe(0);
      expect(stats.averageDuration).toBeUndefined();
    });

    it('should compute correct stats for mixed sessions', async () => {
      const start = new Date('2024-01-01T10:00:00Z');
      const end = new Date('2024-01-01T11:00:00Z'); // 60 min
      const sessions = [
        makeSessionRecord({ startedAt: start, completedAt: end }),
        makeSessionRecord({ id: 's2', startedAt: start, completedAt: null }),
      ];
      sessionRepo.findByUser.mockResolvedValue(sessions);

      const stats = await getWorkoutProgramStats(PROGRAM_ID, USER_ID);

      expect(stats.totalSessions).toBe(2);
      expect(stats.completedSessions).toBe(1);
      expect(stats.inProgressSessions).toBe(1);
      expect(stats.completionRate).toBe(50);
      expect(stats.averageDuration).toBe(60);
    });
  });

  // =========================================================================
  // hasSessionForDay
  // =========================================================================
  describe('hasSessionForDay', () => {
    it('should return true when a session exists', async () => {
      sessionRepo.findForDay.mockResolvedValue(makeSessionRecord());

      const result = await hasSessionForDay(USER_ID, PROGRAM_ID, 1, 1);

      expect(result).toBe(true);
    });

    it('should return false when no session exists', async () => {
      sessionRepo.findForDay.mockResolvedValue(null);

      const result = await hasSessionForDay(USER_ID, PROGRAM_ID, 1, 1);

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // getActiveSessionForDay
  // =========================================================================
  describe('getActiveSessionForDay', () => {
    it('should return mapped session when active session exists', async () => {
      sessionRepo.findActiveForDay.mockResolvedValue(makeSessionRecord());

      const result = await getActiveSessionForDay(USER_ID, PROGRAM_ID, 1, 1);

      expect(sessionRepo.findActiveForDay).toHaveBeenCalledWith(USER_ID, PROGRAM_ID, 1, 1);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(SESSION_ID);
    });

    it('should return null when no active session exists', async () => {
      sessionRepo.findActiveForDay.mockResolvedValue(null);

      const result = await getActiveSessionForDay(USER_ID, PROGRAM_ID, 1, 1);

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // getLatestProgramSession
  // =========================================================================
  describe('getLatestProgramSession', () => {
    it('should return the latest mapped session', async () => {
      sessionRepo.findLatest.mockResolvedValue(makeSessionRecord());

      const result = await getLatestProgramSession(PROGRAM_ID, USER_ID);

      expect(sessionRepo.findLatest).toHaveBeenCalledWith(PROGRAM_ID, USER_ID);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(SESSION_ID);
    });

    it('should return null when no sessions exist', async () => {
      sessionRepo.findLatest.mockResolvedValue(null);

      const result = await getLatestProgramSession(PROGRAM_ID, USER_ID);

      expect(result).toBeNull();
    });
  });
});
