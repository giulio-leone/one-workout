/**
 * File Parser Service
 *
 * Parser multi-formato per file di workout (XLSX, CSV, DOCX, immagini).
 * Converte il contenuto in ImportedWorkoutProgram standardizzato.
 *
 * @module lib-workout/services/file-parser
 */
import { logger } from '@giulio-leone/lib-core';
import type { AIParseContext } from '@giulio-leone/lib-import-core';

import {
  ImportedWorkoutProgramSchema,
  type ImportFile,
  type ImportedWorkoutProgram,
  type ImportedWeek,
  type ImportedDay,
  type ImportedExercise,
  type ImportOptions,
} from '@giulio-leone/schemas';

// Interfaccia per XLSX (caricato dinamicamente)
interface XLSXModule {
  read: (
    data: Buffer,
    opts: { type: string }
  ) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: {
    sheet_to_json: (sheet: unknown, opts: { header: number; defval: string }) => unknown[][];
  };
}

// XLSX sarà caricato dinamicamente
let xlsxModule: XLSXModule | null = null;

async function loadXLSX(): Promise<XLSXModule> {
  if (!xlsxModule) {
    // @ts-expect-error - xlsx module will be installed at runtime
    xlsxModule = await import('xlsx');
  }
  return xlsxModule!;
}

/**
 * Risultato del parsing di un singolo file
 */
export interface FileParseResult {
  /** Successo del parsing */
  success: boolean;
  /** Programma parsato (se successo) */
  program?: ImportedWorkoutProgram;
  /** Errore (se fallito) */
  error?: string;
  /** Warnings durante il parsing */
  warnings: string[];
  /** Tipo di file parsato */
  fileType: string;
  /** Nome del file */
  fileName: string;
}

/**
 * Patterns comuni per riconoscere colonne nei file Excel/CSV
 */
const COLUMN_PATTERNS = {
  exercise: /^(exercise|esercizio|name|nome|movimento|movement)$/i,
  sets: /^(sets|serie|set)$/i,
  reps: /^(reps|ripetizioni|rep|repetitions)$/i,
  weight: /^(weight|peso|kg|lbs|load|carico)$/i,
  rest: /^(rest|recupero|pause|pausa|riposo)$/i,
  rpe: /^(rpe|intensity|intensità)$/i,
  notes: /^(notes|note|commenti|comments)$/i,
  tempo: /^(tempo|cadence|cadenza)$/i,
  day: /^(day|giorno|day\s*\d+|giorno\s*\d+)$/i,
  week: /^(week|settimana|week\s*\d+|settimana\s*\d+)$/i,
};

/**
 * Rileva il tipo di colonna dal nome
 */
function detectColumnType(header: string): keyof typeof COLUMN_PATTERNS | null {
  for (const [type, pattern] of Object.entries(COLUMN_PATTERNS)) {
    if (pattern.test(header.trim())) {
      return type as keyof typeof COLUMN_PATTERNS;
    }
  }
  return null;
}

/**
 * Parsa una notazione di serie (es: "4x8", "3x10-12", "5x5@80%")
 */
function parseSetsNotation(notation: string): {
  sets?: number;
  reps?: number | string;
  repsMin?: number;
  repsMax?: number;
  intensityPercent?: number;
} {
  const result: ReturnType<typeof parseSetsNotation> = {};

  // Pattern: 4x8, 3x10-12, 5x5@80%
  const match = notation.match(/^(\d+)\s*[xX×]\s*(\d+)(?:\s*-\s*(\d+))?(?:\s*@\s*(\d+)%)?$/);

  if (match) {
    result.sets = parseInt(match[1]!, 10);
    const repsStart = parseInt(match[2]!, 10);
    const repsEnd = match[3] ? parseInt(match[3], 10) : undefined;

    if (repsEnd) {
      result.repsMin = repsStart;
      result.repsMax = repsEnd;
      result.reps = `${repsStart}-${repsEnd}`;
    } else {
      result.reps = repsStart;
    }

    if (match[4]) {
      result.intensityPercent = parseInt(match[4], 10);
    }
  }

  return result;
}

/**
 * Parsa il peso da una stringa
 */
function parseWeight(
  value: string | number,
  sourceUnit: 'kg' | 'lbs' = 'kg'
): { weight?: number; weightMin?: number; weightMax?: number } {
  if (typeof value === 'number') {
    const weight = sourceUnit === 'lbs' ? value * 0.453592 : value;
    return { weight };
  }

  const str = value.toString().trim();

  // Range: "80-100kg", "80-100"
  const rangeMatch = str.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(kg|lbs)?$/i);
  if (rangeMatch) {
    const unit = rangeMatch[3]?.toLowerCase() || sourceUnit;
    const multiplier = unit === 'lbs' ? 0.453592 : 1;
    return {
      weightMin: parseFloat(rangeMatch[1]!) * multiplier,
      weightMax: parseFloat(rangeMatch[2]!) * multiplier,
    };
  }

  // Singolo: "100kg", "100"
  const singleMatch = str.match(/^(\d+(?:\.\d+)?)\s*(kg|lbs)?$/i);
  if (singleMatch) {
    const unit = singleMatch[2]?.toLowerCase() || sourceUnit;
    const multiplier = unit === 'lbs' ? 0.453592 : 1;
    return { weight: parseFloat(singleMatch[1]!) * multiplier };
  }

  return {};
}

/**
 * Parsa il recupero da una stringa
 */
function parseRest(value: string | number): number | undefined {
  if (typeof value === 'number') {
    return value;
  }

  const str = value.toString().trim().toLowerCase();

  // Minuti: "2min", "2'", "2 min"
  const minMatch = str.match(/^(\d+(?:\.\d+)?)\s*(?:min|'|m)$/);
  if (minMatch) {
    return Math.round(parseFloat(minMatch[1]!) * 60);
  }

  // Secondi: "90s", "90sec", "90"
  const secMatch = str.match(/^(\d+)\s*(?:s|sec|'')?$/);
  if (secMatch) {
    return parseInt(secMatch[1]!, 10);
  }

  // Range: "60-90s" -> prendi il valore medio
  const rangeMatch = str.match(/^(\d+)\s*-\s*(\d+)\s*(?:s|sec)?$/);
  if (rangeMatch) {
    return Math.round((parseInt(rangeMatch[1]!, 10) + parseInt(rangeMatch[2]!, 10)) / 2);
  }

  return undefined;
}

/**
 * File Parser Service
 */
export class FileParserService {
  /**
   * Parsa un file Excel/CSV
   */
  static async parseSpreadsheet(
    file: ImportFile,
    options: ImportOptions
  ): Promise<FileParseResult> {
    const warnings: string[] = [];

    try {
      // Carica XLSX dinamicamente
      const XLSX = await loadXLSX();

      // Decodifica base64
      const buffer = Buffer.from(file.content, 'base64');
      const workbook = XLSX.read(buffer, { type: 'buffer' });

      if (workbook.SheetNames.length === 0) {
        return {
          success: false,
          error: 'Il file non contiene fogli di lavoro',
          warnings,
          fileType: file.mimeType || 'unknown',
          fileName: file.name,
        };
      }

      // Se specificato uno sheet index, usa quello, altrimenti processa tutti
      const sheetsToProcess =
        file.sheetIndex !== undefined
          ? [workbook.SheetNames[file.sheetIndex]!]
          : workbook.SheetNames;

      const weeks: ImportedWeek[] = [];

      for (let sheetIdx = 0; sheetIdx < sheetsToProcess.length; sheetIdx++) {
        const sheetName = sheetsToProcess[sheetIdx]!;
        const sheet = workbook.Sheets[sheetName]!;

        // Converti in JSON
        const data = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: '',
        }) as unknown[][];

        if (data.length < 2) {
          warnings.push(`Foglio "${sheetName}" vuoto o con solo intestazioni`);
          continue;
        }

        // Prima riga = headers
        const headers = (data[0] as string[]).map((h: string) => String(h).trim());
        const columnMap = new Map<keyof typeof COLUMN_PATTERNS, number>();

        // Mappa le colonne
        headers.forEach((header, idx) => {
          const type = detectColumnType(header);
          if (type) {
            columnMap.set(type, idx);
          }
        });

        // Se non troviamo la colonna esercizio, proviamo euristicamente
        if (!columnMap.has('exercise')) {
          // Prima colonna non numerica
          for (let i = 0; i < headers.length; i++) {
            const firstValue = data[1]?.[i];
            if (firstValue && typeof firstValue === 'string' && isNaN(Number(firstValue))) {
              columnMap.set('exercise', i);
              break;
            }
          }
        }

        if (!columnMap.has('exercise')) {
          warnings.push(`Foglio "${sheetName}": impossibile identificare la colonna esercizi`);
          continue;
        }

        // Parsa le righe
        const exercises: ImportedExercise[] = [];

        for (let rowIdx = 1; rowIdx < data.length; rowIdx++) {
          const row = data[rowIdx] as unknown[];
          const exerciseName = row[columnMap.get('exercise')!];

          if (!exerciseName || String(exerciseName).trim() === '') {
            // Riga vuota
            continue;
          }

          const exercise: ImportedExercise = {
            name: String(exerciseName).trim(),
          };

          // Sets
          if (columnMap.has('sets')) {
            const setsValue = row[columnMap.get('sets')!];
            if (setsValue) {
              const parsed = parseSetsNotation(String(setsValue));
              if (parsed.sets) {
                exercise.sets = parsed.sets;
                if (parsed.reps) exercise.reps = parsed.reps;
                if (parsed.intensityPercent) exercise.intensityPercent = parsed.intensityPercent;
              } else {
                exercise.sets = parseInt(String(setsValue), 10) || undefined;
              }
            }
          }

          // Reps
          if (columnMap.has('reps')) {
            const repsValue = row[columnMap.get('reps')!];
            if (repsValue) {
              const str = String(repsValue).trim();
              const rangeMatch = str.match(/^(\d+)\s*-\s*(\d+)$/);
              if (rangeMatch) {
                exercise.reps = str;
              } else {
                exercise.reps = parseInt(str, 10) || undefined;
              }
            }
          }

          // Weight
          if (columnMap.has('weight')) {
            const weightValue = row[columnMap.get('weight')!];
            if (weightValue) {
              const parsed = parseWeight(weightValue as string | number, options.sourceWeightUnit);
              exercise.weight =
                parsed.weight ||
                (parsed.weightMin && parsed.weightMax
                  ? `${parsed.weightMin}-${parsed.weightMax}`
                  : undefined);
            }
          }

          // Rest
          if (columnMap.has('rest')) {
            const restValue = row[columnMap.get('rest')!];
            if (restValue) {
              exercise.rest = parseRest(restValue as string | number);
            }
          }

          // RPE
          if (columnMap.has('rpe')) {
            const rpeValue = row[columnMap.get('rpe')!];
            if (rpeValue) {
              exercise.rpe = parseFloat(String(rpeValue)) || undefined;
            }
          }

          // Notes
          if (columnMap.has('notes')) {
            const notesValue = row[columnMap.get('notes')!];
            if (notesValue) {
              exercise.notes = String(notesValue).trim();
            }
          }

          // Tempo
          if (columnMap.has('tempo')) {
            const tempoValue = row[columnMap.get('tempo')!];
            if (tempoValue) {
              exercise.tempo = String(tempoValue).trim();
            }
          }

          exercises.push(exercise);
        }

        // Raggruppa esercizi in giorni (ogni ~6 esercizi o quando c'è una riga vuota)
        const days: ImportedDay[] = [];
        let dayExercises: ImportedExercise[] = [];
        let dayNumber = 1;

        for (const exercise of exercises) {
          dayExercises.push(exercise);

          // Se abbiamo abbastanza esercizi per un giorno
          if (dayExercises.length >= 6) {
            days.push({
              dayNumber: dayNumber++,
              name: `Day ${dayNumber}`,
              exercises: dayExercises,
            });
            dayExercises = [];
          }
        }

        // Aggiungi gli esercizi rimanenti
        if (dayExercises.length > 0) {
          days.push({
            dayNumber: dayNumber,
            name: `Day ${dayNumber}`,
            exercises: dayExercises,
          });
        }

        // Crea la settimana
        if (days.length > 0) {
          weeks.push({
            weekNumber: sheetIdx + 1,
            name: sheetName !== `Sheet${sheetIdx + 1}` ? sheetName : undefined,
            days,
          });
        }
      }

      if (weeks.length === 0) {
        return {
          success: false,
          error: 'Nessun esercizio trovato nel file',
          warnings,
          fileType: file.mimeType || 'unknown',
          fileName: file.name,
        };
      }

      // Calcola il nome del programma dal nome file
      const programName = file.name
        .replace(/\.(xlsx|xls|csv|ods)$/i, '')
        .replace(/[_-]/g, ' ')
        .trim();

      const program: ImportedWorkoutProgram = ImportedWorkoutProgramSchema.parse({
        name: programName || 'Imported Program',
        durationWeeks: weeks.length,
        weeks,
        sourceFile: file.name,
      });

      return {
        success: true,
        program,
        warnings,
        fileType: file.mimeType || 'unknown',
        fileName: file.name,
      };
    } catch (error) {
      return {
        success: false,
        error: `Errore durante il parsing: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`,
        warnings,
        fileType: file.mimeType || 'unknown',
        fileName: file.name,
      };
    }
  }

  /**
   * Parsa un file CSV
   */
  static async parseCSV(file: ImportFile, options: ImportOptions): Promise<FileParseResult> {
    // CSV è gestito come spreadsheet con XLSX
    return this.parseSpreadsheet(file, options);
  }

  /**
   * Estrae testo da un documento Word
   * Richiede mammoth library (da installare)
   */
  static async parseDocument(
    file: ImportFile,
    _options: ImportOptions,
    aiContext?: AIParseContext
  ): Promise<FileParseResult> {
    const warnings: string[] = [];

    if (!aiContext) {
      return {
        success: false,
        error: 'Parsing documenti richiede AI context',
        warnings,
        fileType: file.mimeType || 'unknown',
        fileName: file.name,
      };
    }

    try {
      // Per documenti Word, usiamo l'AI per estrarre la struttura
      const prompt = `Analizza questo documento di programma di allenamento e estrai i dati in formato strutturato.
Per ogni esercizio identifica: nome, serie, ripetizioni, peso (se presente), recupero, RPE (se presente), note.
Organizza gli esercizi per giorni e settimane se la struttura è evidente.
Rispondi SOLO con un JSON valido nel formato ImportedWorkoutProgram.`;

      const program = await aiContext.parseWithAI(file.content, file.mimeType || 'unknown', prompt);
      const parsedProgram = ImportedWorkoutProgramSchema.parse({
        ...program,
        sourceFile: file.name,
      });

      return {
        success: true,
        program: parsedProgram,
        warnings,
        fileType: file.mimeType || 'unknown',
        fileName: file.name,
      };
    } catch (error) {
      return {
        success: false,
        error: `Errore parsing documento: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`,
        warnings,
        fileType: file.mimeType || 'unknown',
        fileName: file.name,
      };
    }
  }

  /**
   * Parsa un'immagine usando Vision AI
   */
  static async parseImage(
    file: ImportFile,
    _options: ImportOptions,
    aiContext?: AIParseContext
  ): Promise<FileParseResult> {
    const warnings: string[] = [];

    if (!aiContext) {
      return {
        success: false,
        error: 'Parsing immagini richiede AI context con Vision',
        warnings,
        fileType: file.mimeType || 'unknown',
        fileName: file.name,
      };
    }

    try {
      const prompt = `Analizza questa immagine di un programma di allenamento ed estrai tutti i dati visibili.
Per ogni esercizio identifica: nome esercizio, numero di serie, ripetizioni, peso (se visibile), tempo di recupero, RPE o intensità.
Se l'immagine mostra più giorni o settimane, organizza i dati di conseguenza.
Se ci sono annotazioni o note scritte a mano, includile.
Rispondi SOLO con un JSON valido nel formato ImportedWorkoutProgram.`;

      const program = await aiContext.parseWithAI(file.content, file.mimeType || 'unknown', prompt);
      const parsedProgram = ImportedWorkoutProgramSchema.parse({
        ...program,
        sourceFile: file.name,
      });

      return {
        success: true,
        program: parsedProgram,
        warnings,
        fileType: file.mimeType || 'unknown',
        fileName: file.name,
      };
    } catch (error) {
      return {
        success: false,
        error: `Errore parsing immagine: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`,
        warnings,
        fileType: file.mimeType || 'unknown',
        fileName: file.name,
      };
    }
  }

  /**
   * Parsa un file PDF usando AI
   */
  static async parsePDF(
    file: ImportFile,
    _options: ImportOptions,
    aiContext?: AIParseContext
  ): Promise<FileParseResult> {
    const warnings: string[] = [];

    if (!aiContext) {
      return {
        success: false,
        error: 'Parsing PDF richiede AI context',
        warnings,
        fileType: file.mimeType || 'unknown',
        fileName: file.name,
      };
    }

    try {
      const prompt = `Analizza questo documento PDF di un programma di allenamento ed estrai tutti i dati in modo strutturato.
Per ogni esercizio identifica:
- Nome dell'esercizio
- Numero di serie
- Ripetizioni (singolo numero o range come "8-12")
- Peso (se specificato, in kg o lbs)
- Tempo di recupero tra le serie
- RPE o intensità percentuale (se presente)
- Tempo/cadenza (se presente, es: "3-1-2-0")
- Note o istruzioni specifiche

Organizza gli esercizi per:
- Giorni di allenamento (es: "Giorno 1 - Push", "Day A", "Lunedì")
- Settimane (se il programma è periodizzato)

Se ci sono superserie o circuiti, indica il raggruppamento.
Se il documento contiene progressioni settimanali, preservale.

IMPORTANTE: Rispondi SOLO con un JSON valido nel formato ImportedWorkoutProgram, senza markdown o testo aggiuntivo.`;

      const program = await aiContext.parseWithAI(file.content, file.mimeType || 'unknown', prompt);
      const parsedProgram = ImportedWorkoutProgramSchema.parse({
        ...program,
        sourceFile: file.name,
      });

      return {
        success: true,
        program: parsedProgram,
        warnings,
        fileType: file.mimeType || 'unknown',
        fileName: file.name,
      };
    } catch (error) {
      return {
        success: false,
        error: `Errore parsing PDF: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`,
        warnings,
        fileType: file.mimeType || 'unknown',
        fileName: file.name,
      };
    }
  }

  /**
   * Parsa un file in base al suo tipo MIME o estensione
   * FILOSOFIA: Usa sempre AI per parsing intelligente
   */
  static async parseFile(
    file: ImportFile,
    options: ImportOptions,
    aiContext?: AIParseContext
  ): Promise<FileParseResult> {
    const mimeType = (file.mimeType || '').toLowerCase();
    const fileName = file.name.toLowerCase();
    const extension = fileName.split('.').pop() || '';

    // Prompt non più necessario - il routing è gestito centralmente in aiContext

    // CSV - SEMPRE tramite AI
    if (extension === 'csv' || mimeType === 'text/csv') {
      if (!aiContext) {
        return {
          success: false,
          error: 'AI context richiesto per parsing CSV. Riprova.',
          warnings: [],
          fileType: file.mimeType || 'text/csv',
          fileName: file.name,
        };
      }

      try {
        logger.warn(`[FileParser] Parsing CSV via AI: ${file.name}`);
        const program = await aiContext.parseWithAI(
          file.content,
          file.mimeType || 'text/csv',
          '' // Prompt gestito internamente
        );
        const parsedProgram = ImportedWorkoutProgramSchema.parse({
          ...program,
          sourceFile: file.name,
        });
        return {
          success: true,
          program: parsedProgram,
          warnings: [],
          fileType: file.mimeType || 'text/csv',
          fileName: file.name,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`[FileParser] AI CSV parsing failed: ${errorMsg}`);
        return {
          success: false,
          error: `Parsing AI fallito: ${errorMsg}`,
          warnings: [],
          fileType: file.mimeType || 'text/csv',
          fileName: file.name,
        };
      }
    }

    // Spreadsheet (Excel, ODS) - SEMPRE tramite AI
    if (
      ['xlsx', 'xls', 'ods'].includes(extension) ||
      mimeType.includes('spreadsheet') ||
      mimeType.includes('excel') ||
      mimeType === 'application/vnd.ms-excel'
    ) {
      if (!aiContext) {
        return {
          success: false,
          error: 'AI context richiesto per parsing Excel. Riprova.',
          warnings: [],
          fileType: mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileName: file.name,
        };
      }

      try {
        logger.warn(`[FileParser] Parsing XLSX via AI: ${file.name}`);
        const program = await aiContext.parseWithAI(
          file.content,
          mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ''
        );
        const parsedProgram = ImportedWorkoutProgramSchema.parse({
          ...program,
          sourceFile: file.name,
        });
        return {
          success: true,
          program: parsedProgram,
          warnings: [],
          fileType: mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileName: file.name,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`[FileParser] AI XLSX parsing failed: ${errorMsg}`);
        return {
          success: false,
          error: `Parsing AI fallito: ${errorMsg}`,
          warnings: [],
          fileType: mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileName: file.name,
        };
      }
    }

    // PDF - by extension or MIME
    if (extension === 'pdf' || mimeType === 'application/pdf') {
      return this.parsePDF(file, options, aiContext);
    }

    // Documents (Word, ODT) - by extension or MIME
    if (
      ['docx', 'doc', 'odt'].includes(extension) ||
      mimeType.includes('document') ||
      mimeType.includes('msword') ||
      mimeType.includes('opendocument.text')
    ) {
      return this.parseDocument(file, options, aiContext);
    }

    // Images - by extension or MIME
    if (
      ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(extension) ||
      mimeType.startsWith('image/')
    ) {
      return this.parseImage(file, options, aiContext);
    }

    // FALLBACK: Prova tramite AI come CSV
    if (aiContext) {
      try {
        logger.warn(`[FileParser] Tentativo fallback AI per file: ${file.name}`);
        const program = await aiContext.parseWithAI(file.content, mimeType || 'text/plain', '');
        const parsedProgram = ImportedWorkoutProgramSchema.parse({
          ...program,
          sourceFile: file.name,
        });
        return {
          success: true,
          program: parsedProgram,
          warnings: ['File type non riconosciuto, parsato come testo'],
          fileType: mimeType || 'text/plain',
          fileName: file.name,
        };
      } catch {
        // Fallback failed
      }
    }

    return {
      success: false,
      error: `Tipo file non riconosciuto: ${file.name} (${mimeType || 'nessun MIME type'})`,
      warnings: ['AI context non disponibile per parsing'],
      fileType: mimeType || 'unknown',
      fileName: file.name,
    };
  }

  /**
   * Parsa multiple file e combina i risultati
   */
  static async parseFiles(
    files: ImportFile[],
    options: ImportOptions,
    aiContext?: AIParseContext
  ): Promise<{
    programs: ImportedWorkoutProgram[];
    errors: Array<{ fileName: string; error: string }>;
    warnings: Array<{ fileName: string; warnings: string[] }>;
  }> {
    const programs: ImportedWorkoutProgram[] = [];
    const errors: Array<{ fileName: string; error: string }> = [];
    const warnings: Array<{ fileName: string; warnings: string[] }> = [];

    // Processa in parallelo con limite di concorrenza
    const CONCURRENCY_LIMIT = 3;
    const chunks: ImportFile[][] = [];

    for (let i = 0; i < files.length; i += CONCURRENCY_LIMIT) {
      chunks.push(files.slice(i, i + CONCURRENCY_LIMIT));
    }

    for (const chunk of chunks) {
      const results = await Promise.all(
        chunk.map((file: ImportFile) => this.parseFile(file, options, aiContext))
      );

      for (const result of results) {
        if (result.success && result.program) {
          programs.push(result.program);
        } else if (result.error) {
          errors.push({ fileName: result.fileName, error: result.error });
        }

        if (result.warnings.length > 0) {
          warnings.push({ fileName: result.fileName, warnings: result.warnings });
        }
      }
    }

    return { programs, errors, warnings };
  }

  /**
   * Combina più programmi parsati in uno solo
   */
  static combinePrograms(programs: ImportedWorkoutProgram[]): ImportedWorkoutProgram {
    if (programs.length === 0) {
      return ImportedWorkoutProgramSchema.parse({
        name: 'Empty Program',
        weeks: [],
      });
    }

    if (programs.length === 1) {
      return ImportedWorkoutProgramSchema.parse(programs[0]!);
    }

    // Combina tutte le settimane
    let weekNumber = 1;
    const allWeeks: ImportedWeek[] = [];

    for (const program of programs) {
      for (const week of program.weeks) {
        allWeeks.push({
          ...week,
          weekNumber: weekNumber++,
          name: week.name || `Week ${weekNumber} (from ${program.sourceFile || 'Unknown'})`,
        });
      }
    }

    return ImportedWorkoutProgramSchema.parse({
      name: programs[0]!.name || 'Combined Program',
      description: `Combined from ${programs.length} files`,
      durationWeeks: allWeeks.length,
      weeks: allWeeks,
      sourceFile: programs
        .map((p: ImportedWorkoutProgram) => p.sourceFile)
        .filter(Boolean)
        .join(', '),
    });
  }
}
