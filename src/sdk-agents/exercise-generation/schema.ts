import { z } from 'zod';

// ==================== INPUT ====================

export const ExerciseGenerationInputSchema = z.object({
  count: z.number().default(5),
  description: z.string(),
  existingNames: z
    .array(z.string())
    .optional()
    .describe('List of existing exercise names/slugs to avoid'),
  muscleGroups: z.array(z.string()).optional(),
  bodyPartIds: z.array(z.string()).optional(),
});

// ==================== OUTPUT ====================

export const GeneratedExerciseSchema = z.object({
  name: z.string(),
  description: z.string(),
  typeId: z.string(),
  muscleIds: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['PRIMARY', 'SECONDARY']),
    })
  ),
  bodyPartIds: z.array(z.string()),
  equipmentIds: z.array(z.string()).optional(),
  instructions: z.array(z.string()),
  tips: z.array(z.string()).optional(),
  imageUrl: z.string().optional(),
  videoUrl: z.string().optional(),
});

export const ExerciseGenerationOutputSchema = z.object({
  exercises: z.array(GeneratedExerciseSchema),
});

export type ExerciseGenerationInput = z.infer<typeof ExerciseGenerationInputSchema>;
export type ExerciseGenerationOutput = z.infer<typeof ExerciseGenerationOutputSchema>;
export type GeneratedExercise = z.infer<typeof GeneratedExerciseSchema>;
