import { createMesocycle } from './dist/index.js';

try {
  const meso = createMesocycle({
    id: 'test',
    name: 'Test',
    model: 'linear',
    totalWeeks: 13,
    goal: 'strength',
    experienceLevel: 'intermediate',
  });
  console.log('Success:', meso.phases.map(p => `${p.phase}=${p.durationWeeks}w`).join(', '));
  console.log('Total:', meso.phases.reduce((s, p) => s + p.durationWeeks, 0));
} catch (e) {
  console.log('ERROR:', e.message);
}
