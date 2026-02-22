/**
 * Workout Service
 *
 * CRUD operations per workout programs
 * Implementa IWorkoutService contract
 */

import { createId, getCurrentTimestamp, storageService } from '@giulio-leone/lib-shared';
import type { IStorageService } from '@giulio-leone/lib-shared';
import type { WorkoutProgram } from '@giulio-leone/types';
import type { ApiResponse } from '@giulio-leone/types'; // Or from api.types
import type { IWorkoutService } from '@giulio-leone/contracts';

/**
 * Storage key per workouts
 */
const WORKOUTS_KEY = 'workouts';

/**
 * Implementazione Workout Service
 */
export class WorkoutService implements IWorkoutService {
  constructor(private storage: IStorageService) {}

  create(
    workout: Omit<WorkoutProgram, 'id' | 'createdAt' | 'updatedAt'>
  ): ApiResponse<WorkoutProgram> {
    try {
      const now = getCurrentTimestamp();
      const newWorkout: WorkoutProgram = {
        ...workout,
        id: createId(),
        createdAt: now,
        updatedAt: now,
      };

      const workouts = this.getAllWorkouts();
      workouts.push(newWorkout);
      this.storage.set(WORKOUTS_KEY, workouts);

      return {
        success: true,
        data: newWorkout,
        message: 'Workout program created successfully',
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create workout',
      };
    }
  }

  update(id: string, workout: Partial<WorkoutProgram>): ApiResponse<WorkoutProgram> {
    try {
      const workouts = this.getAllWorkouts();
      const index = workouts.findIndex((w) => w.id === id);

      if (index === -1) {
        return {
          success: false,
          error: 'Workout program not found',
        };
      }

      const existingWorkout = workouts[index];
      if (!existingWorkout) {
        return {
          success: false,
          error: 'Workout program not found',
        };
      }

      const updatedWorkout: WorkoutProgram = {
        ...existingWorkout,
        ...workout,
        name: workout.name ?? existingWorkout.name,
        id,
        createdAt: existingWorkout.createdAt,
        updatedAt: getCurrentTimestamp(),
      };

      workouts[index] = updatedWorkout;
      this.storage.set(WORKOUTS_KEY, workouts);

      return {
        success: true,
        data: updatedWorkout,
        message: 'Workout program updated successfully',
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update workout',
      };
    }
  }

  delete(id: string): ApiResponse<void> {
    try {
      const workouts = this.getAllWorkouts();
      const filteredWorkouts = workouts.filter((w: WorkoutProgram) => w.id !== id);

      if (workouts.length === filteredWorkouts.length) {
        return {
          success: false,
          error: 'Workout program not found',
        };
      }

      this.storage.set(WORKOUTS_KEY, filteredWorkouts);

      return {
        success: true,
        message: 'Workout program deleted successfully',
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete workout',
      };
    }
  }

  get(id: string): ApiResponse<WorkoutProgram> {
    try {
      const workouts = this.getAllWorkouts();
      const workout = workouts.find((w: WorkoutProgram) => w.id === id);

      if (!workout) {
        return {
          success: false,
          error: 'Workout program not found',
        };
      }

      return {
        success: true,
        data: workout,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get workout',
      };
    }
  }

  getAll(): ApiResponse<WorkoutProgram[]> {
    try {
      const workouts = this.getAllWorkouts();
      return {
        success: true,
        data: workouts,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get workouts',
      };
    }
  }

  getByStatus(status: WorkoutProgram['status']): ApiResponse<WorkoutProgram[]> {
    try {
      const workouts = this.getAllWorkouts();
      const filtered = workouts.filter((w: WorkoutProgram) => w.status === status);
      return {
        success: true,
        data: filtered,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get workouts by status',
      };
    }
  }

  private getAllWorkouts(): WorkoutProgram[] {
    return this.storage.get<WorkoutProgram[]>(WORKOUTS_KEY) || [];
  }
}

/**
 * Singleton instance
 */
export const workoutService: IWorkoutService = new WorkoutService(storageService);
