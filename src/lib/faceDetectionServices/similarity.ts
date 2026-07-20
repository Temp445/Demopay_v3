export interface MatchResult {
  userId: string;
  userName: string;
  confidence: number;
  matchedEmbeddingId: string;
}

export interface StoredEmbedding {
  id: string;
  user_id: string;
  user_name: string;
  embedding: number[];
  type?: 'employee' | 'visitor';
}

export class SimilarityService {
  // CRITICAL UPDATE: 0.92 is the strict security threshold for the unified ResNet-34 model.
  // 0.85 was for the old MobileFaceNet model and is too low for the new engine.
  private readonly SIMILARITY_THRESHOLD = 0.92;

  /**
   * Calculates the cosine similarity between two 128D face vectors.
   * Returns a value between -1 and 1. (1 is a perfect match).
   */
  cosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
      console.warn('Embeddings are missing or have mismatched lengths.');
      return 0;
    }

    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      magnitude1 += embedding1[i] * embedding1[i];
      magnitude2 += embedding2[i] * embedding2[i];
    }

    const magnitude = Math.sqrt(magnitude1) * Math.sqrt(magnitude2);
    
    // Prevent division by zero if an empty vector is passed
    if (magnitude === 0) {
      return 0;
    }

    return dotProduct / magnitude;
  }

  euclideanDistance(embedding1: number[], embedding2: number[]): number {
    if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
      return Infinity;
    }

    let sum = 0;
    for (let i = 0; i < embedding1.length; i++) {
      const diff = embedding1[i] - embedding2[i];
      sum += diff * diff;
    }

    return Math.sqrt(sum);
  }

  findBestMatch(
    queryEmbedding: number[],
    storedEmbeddings: StoredEmbedding[]
  ): MatchResult | null {
    let bestMatch: MatchResult | null = null;
    let highestSimilarity = this.SIMILARITY_THRESHOLD;

    for (const stored of storedEmbeddings) {
      // Skip if stored embedding is invalid
      if (!stored.embedding || stored.embedding.length !== queryEmbedding.length) {
        continue;
      }

      const similarity = this.cosineSimilarity(queryEmbedding, stored.embedding);

      if (similarity >= highestSimilarity) {
        highestSimilarity = similarity;
        bestMatch = {
          userId: stored.user_id,
          userName: stored.user_name,
          confidence: similarity,
          matchedEmbeddingId: stored.id,
        };
      }
    }

    return bestMatch;
  }

  findAllMatches(
    queryEmbedding: number[],
    storedEmbeddings: StoredEmbedding[],
    topK: number = 5
  ): MatchResult[] {
    const matches: MatchResult[] = [];

    for (const stored of storedEmbeddings) {
      if (!stored.embedding || stored.embedding.length !== queryEmbedding.length) {
        continue;
      }

      const similarity = this.cosineSimilarity(queryEmbedding, stored.embedding);

      if (similarity >= this.SIMILARITY_THRESHOLD) {
        matches.push({
          userId: stored.user_id,
          userName: stored.user_name,
          confidence: similarity,
          matchedEmbeddingId: stored.id,
        });
      }
    }

    // Sort by highest confidence first
    matches.sort((a, b) => b.confidence - a.confidence);

    return matches.slice(0, topK);
  }

  async compareEmbeddingsBatch(
    queryEmbeddings: number[][],
    storedEmbeddings: StoredEmbedding[]
  ): Promise<(MatchResult | null)[]> {
    return Promise.all(
      queryEmbeddings.map(queryEmbedding =>
        Promise.resolve(this.findBestMatch(queryEmbedding, storedEmbeddings))
      )
    );
  }

  isMatch(similarity: number): boolean {
    return similarity >= this.SIMILARITY_THRESHOLD;
  }

  getSimilarityThreshold(): number {
    return this.SIMILARITY_THRESHOLD;
  }
}

export const similarityService = new SimilarityService();