import { describe, expect, it } from 'vitest';

import { ImportOptionsSchema } from '@giulio-leone/schemas';
import { FileParserService } from '../file-parser.service';

describe('FileParserService.parseCSV', () => {
  const sampleCsv = ['exercise,sets,reps,rest', 'Back Squat,3,5,120', 'Bench Press,3,8,90'].join(
    '\n'
  );

  const base64Csv = Buffer.from(sampleCsv, 'utf-8').toString('base64');

  it('parsa un CSV semplice in un programma valido', async () => {
    const options = ImportOptionsSchema.parse({});

    const result = await FileParserService.parseCSV(
      {
        name: 'sample.csv',
        mimeType: 'text/csv',
        content: base64Csv,
        size: base64Csv.length,
      },
      options
    );

    expect(result.success).toBe(true);
    expect(result.program).toBeDefined();
    expect(result.program?.weeks.length).toBeGreaterThan(0);
    expect(result.program?.weeks[0]?.days[0]?.exercises[0]?.name).toBe('Back Squat');
    expect(result.warnings.length).toBe(0);
  });
});
