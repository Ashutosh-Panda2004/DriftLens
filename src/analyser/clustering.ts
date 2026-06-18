// DriftLens - Cosine similarity clustering

import type { CorrectionRecord } from '../shared/schema.js';

export interface Cluster {
  corrections: CorrectionRecord[];
  centroid: number[];
  representative: string;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) ** 2;
    normB += (b[i] ?? 0) ** 2;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Greedy nearest-neighbour clustering by cosine similarity.
 * Returns only clusters with >= minOccurrences items.
 *
 * E-A1 scalability: for large corpora the naive O(n²) comparison becomes the
 * bottleneck. When the input exceeds `blockingThreshold` (or blocking is forced
 * via options) we first partition corrections into cheap, deterministic blocks
 * (by module category / language) and cluster within each block. This keeps the
 * exact same return contract and determinism while turning one O(n²) pass into
 * many small ones. Blocking can be disabled to fall back to the original greedy
 * behaviour.
 */
export interface ClusterOptions {
  useBlocking?: boolean;
  blockingThreshold?: number;
}

export function clusterCorrections(
  embeddings: number[][],
  corrections: CorrectionRecord[],
  threshold: number,
  minOccurrences: number,
  options: ClusterOptions = {}
): Cluster[] {
  const n = embeddings.length;
  const blockingThreshold = options.blockingThreshold ?? 2000;
  const useBlocking = options.useBlocking ?? n > blockingThreshold;

  if (!useBlocking) {
    const indices = Array.from({ length: n }, (_, i) => i);
    return greedyCluster(indices, embeddings, corrections, threshold, minOccurrences);
  }

  // Partition into deterministic blocks. Items in different blocks are assumed
  // dissimilar enough that comparing them is not worth the quadratic cost.
  const blocks = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const key = blockingKey(corrections[i]!);
    const list = blocks.get(key) ?? [];
    list.push(i);
    blocks.set(key, list);
  }

  const clusters: Cluster[] = [];
  // Sort block keys for deterministic ordering of the resulting clusters.
  for (const key of [...blocks.keys()].sort()) {
    const indices = blocks.get(key)!;
    clusters.push(
      ...greedyCluster(indices, embeddings, corrections, threshold, minOccurrences),
    );
  }
  return clusters;
}

/**
 * Cheap, deterministic blocking key. Prefers an explicit module category, then
 * language, then a coarse directory segment of the file path.
 */
function blockingKey(c: CorrectionRecord): string {
  if (c.module_category) return `cat:${c.module_category}`;
  if (c.language) return `lang:${c.language}`;
  const seg = (c.file || '').split(/[\\/]/).filter(Boolean)[0] ?? 'root';
  return `dir:${seg}`;
}

/**
 * Greedy nearest-neighbour clustering over a fixed set of indices.
 */
function greedyCluster(
  indices: number[],
  embeddings: number[][],
  corrections: CorrectionRecord[],
  threshold: number,
  minOccurrences: number
): Cluster[] {
  const assigned = new Set<number>();
  const clusters: Cluster[] = [];

  for (let a = 0; a < indices.length; a++) {
    const i = indices[a]!;
    if (assigned.has(i)) continue;
    assigned.add(i);

    const members = [corrections[i]!];
    const memberEmbeddings = [embeddings[i]!];

    for (let b = a + 1; b < indices.length; b++) {
      const j = indices[b]!;
      if (assigned.has(j)) continue;
      const sim = cosineSimilarity(embeddings[i]!, embeddings[j]!);
      if (sim >= threshold) {
        assigned.add(j);
        members.push(corrections[j]!);
        memberEmbeddings.push(embeddings[j]!);
      }
    }

    if (members.length >= minOccurrences) {
      clusters.push({
        corrections: members,
        centroid: computeCentroid(memberEmbeddings),
        representative: extractRepresentative(members),
      });
    }
  }

  return clusters;
}

function computeCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];
  const dim = embeddings[0]!.length;
  const centroid = new Array<number>(dim).fill(0);
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      centroid[i]! += emb[i]! / embeddings.length;
    }
  }
  return centroid;
}

function extractRepresentative(corrections: CorrectionRecord[]): string {
  // Use the correction with the most content as representative
  return corrections
    .map((c) => c.developer_instruction ?? c.ai_wrote ?? c.file)
    .sort((a, b) => (b?.length ?? 0) - (a?.length ?? 0))[0] ?? '';
}
