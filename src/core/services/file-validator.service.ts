/**
 * File Validator Service
 *
 * Validazione MINIMA e sanitizzazione file per l'import workout.
 * FILOSOFIA: L'AI deve poter interpretare qualsiasi file - validazione solo per sicurezza.
 *
 * @module lib-workout/services/file-validator
 */

import type { ImportFile } from '@giulio-leone/schemas';
import { IMPORT_LIMITS } from '@giulio-leone/schemas';

/**
 * Risultato della validazione
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedFile?: ImportFile;
}

/**
 * Rate limiter semplice in-memory
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * File Validator Service
 *
 * NOTA: Validazione MINIMA per massima flessibilità.
 * L'AI interpreterà qualsiasi formato di file.
 */
export class FileValidatorService {
  /**
   * Valida un singolo file - VALIDAZIONE MINIMA
   * Solo controlli essenziali per sicurezza
   */
  static validateFile(file: ImportFile): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Solo controllo nome file presente
    if (!file.name || file.name.trim() === '') {
      errors.push('Nome file mancante');
    }

    // 2. Controllo contenuto presente
    if (!file.content || file.content.trim() === '') {
      errors.push('Contenuto file mancante');
    }

    // 3. Controllo dimensione (solo se specificata e troppo grande)
    if (file.size && file.size > IMPORT_LIMITS.MAX_FILE_SIZE) {
      const maxSizeMB = IMPORT_LIMITS.MAX_FILE_SIZE / (1024 * 1024);
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      errors.push(`File troppo grande (${fileSizeMB}MB). Limite: ${maxSizeMB}MB`);
    }

    // 4. Controllo base64 valido (minimo)
    if (file.content && !this.isValidBase64(file.content)) {
      errors.push('Contenuto file non è un base64 valido');
    }

    if (errors.length > 0) {
      return { valid: false, errors, warnings };
    }

    // Sanitizza il file
    const sanitizedFile = this.sanitizeFile(file);

    return {
      valid: true,
      errors: [],
      warnings,
      sanitizedFile,
    };
  }

  /**
   * Valida un array di file
   */
  static validateFiles(files: ImportFile[]): {
    valid: boolean;
    results: Array<{ file: ImportFile; result: ValidationResult }>;
    totalErrors: string[];
  } {
    const results: Array<{ file: ImportFile; result: ValidationResult }> = [];
    const totalErrors: string[] = [];

    // Validazione numero file
    if (!files || files.length === 0) {
      totalErrors.push('Nessun file da importare');
      return { valid: false, results, totalErrors };
    }

    if (files.length > IMPORT_LIMITS.MAX_FILES) {
      totalErrors.push(`Troppi file (${files.length}). Massimo: ${IMPORT_LIMITS.MAX_FILES}`);
      return { valid: false, results, totalErrors };
    }

    // Valida ogni file
    for (const file of files) {
      const result = this.validateFile(file);
      results.push({ file, result });
      if (!result.valid) {
        totalErrors.push(`File "${file.name}": ${result.errors.join(', ')}`);
      }
    }

    const allValid = results.every((r) => r.result.valid) && totalErrors.length === 0;

    return {
      valid: allValid,
      results,
      totalErrors,
    };
  }

  /**
   * Verifica rate limiting per un utente
   */
  static checkRateLimit(userId: string): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;
    const key = `import_${userId}`;

    let entry = rateLimitStore.get(key);

    // Se non esiste o è scaduto, crea nuovo entry
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + hourMs,
      };
      rateLimitStore.set(key, entry);
    }

    const remaining = IMPORT_LIMITS.RATE_LIMIT_PER_HOUR - entry.count;
    const resetIn = Math.max(0, entry.resetTime - now);

    if (remaining <= 0) {
      return { allowed: false, remaining: 0, resetIn };
    }

    return { allowed: true, remaining, resetIn };
  }

  /**
   * Incrementa il contatore rate limit
   */
  static incrementRateLimit(userId: string): void {
    const key = `import_${userId}`;
    const entry = rateLimitStore.get(key);

    if (entry) {
      entry.count++;
    }
  }

  /**
   * Verifica se una stringa è un base64 valido
   */
  private static isValidBase64(str: string): boolean {
    try {
      // Rimuovi eventuali whitespace
      const cleaned = str.replace(/\s/g, '');
      // Verifica formato base64 (permissivo)
      if (cleaned.length === 0) return false;
      // Prova a decodificare
      Buffer.from(cleaned, 'base64');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sanitizza il contenuto del file
   */
  private static sanitizeFile(file: ImportFile): ImportFile {
    // Rimuovi whitespace dal base64
    const sanitizedContent = file.content.replace(/\s/g, '');

    // Sanitizza il nome file (rimuovi caratteri potenzialmente pericolosi)
    const sanitizedName = file.name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // Caratteri non validi
      .replace(/\.+/g, '.') // Multiple dots
      .substring(0, 255); // Lunghezza massima

    return {
      ...file,
      name: sanitizedName,
      content: sanitizedContent,
    };
  }

  /**
   * Verifica se il contenuto contiene script o macro potenzialmente pericolosi
   * (per file Office)
   */
  static checkForMaliciousContent(base64Content: string): { safe: boolean; warnings: string[] } {
    const warnings: string[] = [];

    try {
      const content = Buffer.from(base64Content, 'base64').toString('utf-8');

      // Pattern pericolosi (VBA, JavaScript, etc.)
      const dangerousPatterns = [
        /\bAutoOpen\b/i,
        /\bAuto_Open\b/i,
        /\bDocument_Open\b/i,
        /\bWorkbook_Open\b/i,
        /ActiveXObject/i,
        /WScript\.Shell/i,
        /Shell\.Application/i,
        /\bpowershell\b/i,
        /\bcmd\.exe\b/i,
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(content)) {
          warnings.push(`Potenziale contenuto pericoloso rilevato: ${pattern.source}`);
        }
      }

      return {
        safe: warnings.length === 0,
        warnings,
      };
    } catch {
      // Se non possiamo analizzare il contenuto, considera sicuro
      return { safe: true, warnings: [] };
    }
  }

  /**
   * Pulisce la cache del rate limiter (per test o manutenzione)
   */
  static clearRateLimitCache(): void {
    rateLimitStore.clear();
  }
}
