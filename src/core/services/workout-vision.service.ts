/**
 * Workout Vision Service
 *
 * AI-powered parsing of workout programs from images, PDFs, documents, and spreadsheets.
 * Uses shared lib-import-core for AI parsing, credit handling, and retry logic.
 *
 * @module lib-workout/services/workout-vision
 */

import { parseWithVisionAI } from '@giulio-leone/lib-shared/import-core';
import { ImportedWorkoutProgramSchema, type ImportedWorkoutProgram } from '@giulio-leone/schemas';

// ==================== PROMPTS ====================

const IMAGE_EXTRACTION_PROMPT = `Analyze this image of a workout program and extract all the exercise information visible.

OUTPUT FORMAT (JSON):
{
  "id": "UUID v4 string (generate if not visible)",
  "name": "Program name if visible, otherwise 'Imported Workout'",
  "description": "Any visible description or context",
  "weeks": [
    {
      "weekNumber": 1,
      "name": "Week name if specified",
      "days": [
        {
          "dayNumber": 1,
          "name": "Day name (e.g., 'Day 1', 'Push Day', 'Monday')",
          "type": "training",
          "exercises": [
            {
              "name": "Exercise name as written",
              "sets": 3,
              "reps": 10,
              "rpe": null,
              "rest": 90,
              "tempo": null,
              "notes": "Any additional notes",
              "weight": null
            }
          ]
        }
      ]
    }
  ]
}

EXTRACTION RULES:
1. Extract EVERY exercise visible, even if partially obscured
2. Parse rep ranges as: "8-12" → reps: 10 (middle value)
3. Parse weight notation: "70%" → intensityPercent: 70
4. Rest periods can be in seconds or minutes (convert to seconds)
5. Tempo format: "3-1-2-0" → tempo: "3-1-2-0"
6. If multiple weeks/days visible, organize hierarchically
7. RPE/RIR notation: "RPE 8" → rpe: 8
8. Include field "id" as a UUID v4 string (generate one if not present)

Return ONLY valid JSON, no markdown formatting.`;

const PDF_EXTRACTION_PROMPT = `Analyze this PDF document containing a workout program and extract all exercise information.

The PDF may contain:
- Multiple pages with different training days
- Tables with exercises, sets, reps
- Progressive overload patterns
- Training blocks or phases
- Exercise descriptions and technique notes

OUTPUT FORMAT (JSON):
{
  "id": "UUID v4 string (generate if not provided)",
  "name": "Program name from title or header",
  "description": "Program overview if available",
  "weeks": [
    {
      "weekNumber": 1,
      "name": "Week/Block name",
      "days": [
        {
          "dayNumber": 1,
          "name": "Training day name",
          "type": "training",
          "exercises": [
            {
              "name": "Exercise name",
              "sets": 4,
              "reps": 8,
              "rpe": 8,
              "rest": 120,
              "tempo": null,
              "notes": "Technique cues or notes",
              "weight": null,
              "intensityPercent": null
            }
          ]
        }
      ]
    }
  ]
}

EXTRACTION RULES:
1. Preserve exact exercise names for proper matching
2. Parse ALL visible data - sets, reps, weights, rest, tempo
3. Identify training blocks/phases as separate weeks
4. Include notes for technique cues or execution details
5. Look for header information (author, date, program type)
6. Include field "id" as a UUID v4 string (generate one if not present)

Return ONLY valid JSON.`;

const DOCUMENT_EXTRACTION_PROMPT = `Analyze this document containing a workout program and extract all structured exercise data.

Documents may have:
- Headers with program info
- Tables or lists of exercises
- Paragraphs describing workouts
- Multiple sections for different days/weeks

OUTPUT FORMAT (JSON):
{
  "id": "UUID v4 string (generate if missing)",
  "name": "Program title",
  "description": "Overview or introduction text",
  "weeks": [
    {
      "weekNumber": 1,
      "days": [
        {
          "dayNumber": 1,
          "name": "Day title",
          "type": "training",
          "exercises": [
            {
              "name": "Exercise name",
              "sets": 3,
              "reps": 12,
              "rest": 60,
              "notes": "Any technique notes"
            }
          ]
        }
      ]
    }
  ]
}

RULES:
1. Extract every exercise mentioned
2. Infer structure from headings and formatting
3. Parse any notation for sets/reps/weight
4. Include all relevant notes and descriptions
5. Include field "id" as a UUID v4 string (generate one if not present)

Return ONLY valid JSON.`;

const SPREADSHEET_EXTRACTION_PROMPT = `You are an expert strength coach. Parse this spreadsheet data into a structured workout program.

The data may have columns like:
- week, day, day_in_week, date, session_name
- exercise, exercise_name
- set_number, sets
- reps, repetitions
- weight, weight_kg, weight_lbs, load
- rpe, intensity, intensity_pct_1rm
- tempo (e.g., "3-1-1")
- rest, rest_sec, rest_seconds
- notes, comments

OUTPUT FORMAT (JSON):
{
  "id": "UUID v4 string (generate if missing)",
  "name": "Program name (infer from data or use 'Imported Program')",
  "description": "Brief description based on content",
  "durationWeeks": 4,
  "weeks": [
    {
      "weekNumber": 1,
      "name": "Week 1",
      "days": [
        {
          "dayNumber": 1,
          "name": "Day 1 or session_name from data",
          "type": "training",
          "exercises": [
            {
              "name": "Exercise name exactly as in data",
              "sets": 3,
              "reps": 8,
              "weight": 100.0,
              "rpe": 7.5,
              "intensityPercent": 70,
              "tempo": "3-1-1",
              "rest": 180,
              "notes": "Any notes from data",
              "detailedSets": [
                { "reps": 8, "weight": 137.5, "rpe": 7.2 },
                { "reps": 8, "weight": 140.0, "rpe": 7.5 },
                { "reps": 8, "weight": 142.5, "rpe": 7.8 }
              ]
            }
          ]
        }
      ]
    }
  ]
}

CRITICAL RULES:
1. Group rows by week -> day -> exercise
2. Each unique exercise within a day becomes ONE exercise entry with multiple sets in detailedSets
3. Preserve EXACT exercise names (case-sensitive, including variations like "Bench Press (TnG)")
4. Keep tempo as string format (e.g., "3-1-1")
5. Convert intensity_pct_1rm to intensityPercent (0-100 scale if given as decimal, multiply by 100)
6. Rest should be in seconds
7. Weight in kg (if lbs, already converted)
8. Include detailedSets array when individual set data differs
9. If set_number column exists, use it to group sets for same exercise
10. Infer program name from session_name patterns if available
11. Include field "id" as a UUID v4 string (generate one if not present)

Return ONLY valid JSON, no markdown or explanatory text.`;

// ==================== SERVICE CLASS ====================

/**
 * Workout Vision Service
 *
 * Parses workout programs from various file formats using AI.
 * All methods use the shared lib-import-core parseWithVisionAI function.
 */
export class WorkoutVisionService {
  /**
   * Parse workout program from image (JPEG, PNG, WEBP, HEIC)
   */
  static async parseImage(
    imageBase64: string,
    mimeType: string,
    userId: string
  ): Promise<ImportedWorkoutProgram> {
    return parseWithVisionAI({
      contentBase64: imageBase64,
      mimeType,
      prompt: IMAGE_EXTRACTION_PROMPT,
      schema: ImportedWorkoutProgramSchema as never, // Zod version mismatch between packages
      userId,
      fileType: 'image',
    });
  }

  /**
   * Parse workout program from PDF
   */
  static async parsePDF(pdfBase64: string, userId: string): Promise<ImportedWorkoutProgram> {
    return parseWithVisionAI({
      contentBase64: pdfBase64,
      mimeType: 'application/pdf',
      prompt: PDF_EXTRACTION_PROMPT,
      schema: ImportedWorkoutProgramSchema as never, // Zod version mismatch between packages
      userId,
      fileType: 'pdf',
    });
  }

  /**
   * Parse workout program from document (DOCX, DOC, ODT)
   */
  static async parseDocument(
    documentBase64: string,
    mimeType: string,
    userId: string
  ): Promise<ImportedWorkoutProgram> {
    return parseWithVisionAI({
      contentBase64: documentBase64,
      mimeType,
      prompt: DOCUMENT_EXTRACTION_PROMPT,
      schema: ImportedWorkoutProgramSchema as never, // Zod version mismatch between packages
      userId,
      fileType: 'document',
    });
  }

  /**
   * Parse workout program from spreadsheet (CSV, XLSX)
   */
  static async parseSpreadsheet(
    contentBase64: string,
    mimeType: string,
    userId: string
  ): Promise<ImportedWorkoutProgram> {
    return parseWithVisionAI({
      contentBase64,
      mimeType,
      prompt: SPREADSHEET_EXTRACTION_PROMPT,
      schema: ImportedWorkoutProgramSchema as never, // Zod version mismatch between packages
      userId,
      fileType: 'spreadsheet',
    });
  }
}
