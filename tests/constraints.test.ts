import { describe, it, expect } from 'vitest';
import type { FailurePrediction } from '../src/shared/schema.js';
import { buildConstraintInjection } from '../src/prevention/constraints.js';

function prediction(partial: Partial<FailurePrediction>): FailurePrediction {
  return {
    file: partial.file ?? 'src/db.ts',
    predicted_failures: partial.predicted_failures ?? [],
    overall_risk: partial.overall_risk ?? 'high',
    recommended_agent: partial.recommended_agent ?? null,
  };
}

function failure(prob: number, text: string, count = 3) {
  return {
    pattern_id: `p-${text}`,
    pattern_name: text,
    probability: prob,
    constraint_to_inject: text,
    historical_correction_count: count,
    last_occurred: new Date().toISOString(),
  };
}

describe('constraint injection (NF-1)', () => {
  it('returns an explicit empty result when there is nothing to inject', () => {
    const inj = buildConstraintInjection(prediction({ predicted_failures: [] }));
    expect(inj.empty).toBe(true);
    expect(inj.constraints).toEqual([]);
    expect(inj.rendered).toContain('no historical risk');
  });

  it('filters out low-probability failures', () => {
    const inj = buildConstraintInjection(
      prediction({ predicted_failures: [failure(0.2, 'low'), failure(0.9, 'high')] }),
      { minProbability: 0.4 },
    );
    expect(inj.constraints.map((c) => c.pattern_name)).toEqual(['high']);
  });

  it('ranks by probability and respects topK', () => {
    const inj = buildConstraintInjection(
      prediction({
        predicted_failures: [failure(0.5, 'a'), failure(0.9, 'b'), failure(0.7, 'c')],
      }),
      { topK: 2 },
    );
    expect(inj.constraints.length).toBe(2);
    expect(inj.constraints[0]!.pattern_name).toBe('b');
    expect(inj.constraints[1]!.pattern_name).toBe('c');
  });

  it('is token-bounded by maxChars', () => {
    const long = 'x'.repeat(500);
    const inj = buildConstraintInjection(
      prediction({
        predicted_failures: [failure(0.9, long), failure(0.8, long), failure(0.7, long)],
      }),
      { maxChars: 600 },
    );
    // First constraint always admitted; budget stops the rest.
    expect(inj.constraints.length).toBeLessThan(3);
    expect(inj.constraints.length).toBeGreaterThanOrEqual(1);
  });

  it('assigns sequential ranks', () => {
    const inj = buildConstraintInjection(
      prediction({ predicted_failures: [failure(0.9, 'a'), failure(0.8, 'b')] }),
    );
    expect(inj.constraints.map((c) => c.rank)).toEqual([1, 2]);
  });
});
