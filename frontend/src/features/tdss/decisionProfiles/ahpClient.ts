// Mirrors backend/app/tdss/services/ahp_service.py so the form can show a
// live weights/CR preview before submitting. The backend recomputes and is
// the source of truth on save.
export const CRITERIA = ['cost', 'time', 'utilization', 'reliability', 'co2', 'suitability'] as const;
export const CRITERIA_LABELS: Record<string, string> = {
  cost: 'ต้นทุน',
  time: 'เวลา',
  utilization: 'อัตราการใช้ความจุ',
  reliability: 'ความน่าเชื่อถือในการส่งมอบ',
  co2: 'การปล่อย CO2',
  suitability: 'ความเหมาะสมของเส้นทาง/ยานพาหนะ',
};
const RANDOM_INDEX: Record<number, number> = { 1: 0, 2: 0, 3: 0.58, 4: 0.9, 5: 1.12, 6: 1.24 };
const N = CRITERIA.length;

export function pairKey(a: string, b: string) {
  return `${a}__${b}`;
}

export function upperTrianglePairs(): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) pairs.push([CRITERIA[i], CRITERIA[j]]);
  return pairs;
}

/** Inverse of buildMatrix — reconstructs the pairwise-comparison dict from
 * a stored matrix, so an existing profile's values can prefill the edit form. */
export function matrixToPairwise(matrix: number[][]): Record<string, number> {
  const pairwise: Record<string, number> = {};
  for (const [a, b] of upperTrianglePairs()) {
    const i = (CRITERIA as readonly string[]).indexOf(a);
    const j = (CRITERIA as readonly string[]).indexOf(b);
    pairwise[pairKey(a, b)] = matrix[i][j];
  }
  return pairwise;
}

export function buildMatrix(pairwise: Record<string, number>): number[][] {
  const m = Array.from({ length: N }, () => Array(N).fill(1));
  for (const [a, b] of upperTrianglePairs()) {
    const v = pairwise[pairKey(a, b)] ?? 1;
    const i = (CRITERIA as readonly string[]).indexOf(a);
    const j = (CRITERIA as readonly string[]).indexOf(b);
    m[i][j] = v;
    m[j][i] = 1 / v;
  }
  return m;
}

export function calculateWeights(matrix: number[][]) {
  const colSums = Array(N).fill(0);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) colSums[j] += matrix[i][j];

  const normalized = matrix.map((row) => row.map((v, j) => v / colSums[j]));
  const weights = normalized.map((row) => row.reduce((a, b) => a + b, 0) / N);

  const weightedSum = matrix.map((row) => row.reduce((acc, v, j) => acc + v * weights[j], 0));
  const lambdaMax = weightedSum.reduce((acc, ws, i) => acc + ws / weights[i], 0) / N;

  const ci = N > 1 ? (lambdaMax - N) / (N - 1) : 0;
  const ri = RANDOM_INDEX[N] ?? 1.24;
  const cr = ri > 0 ? ci / ri : 0;

  const weightsByName: Record<string, number> = {};
  CRITERIA.forEach((c, i) => (weightsByName[c] = weights[i]));

  return { weights: weightsByName, lambdaMax, ci, cr, isConsistent: cr <= 0.1 };
}
