export interface RagDocument {
  id: string;
  sessionId: string;
  filename: string;
  mimeType: string;
  uploadedAt: number;
  chunkCount: number;
}

export interface Chunk {
  id: string; // `${docId}-${index}`
  docId: string;
  sessionId: string;
  text: string;
  index: number;
  vector?: number[]; // 存储时写入
}

export interface RetrievedChunk {
  text: string;
  docId: string;
  filename: string;
  score: number; // 余弦相似度 0–1
}

export interface VectorFile {
  chunks: Chunk[]; // chunk.vector 已填充；doc 元数据现存于 DB
}

/** 单路检索的排名结果（内部用，融合前） */
export interface RankedChunk {
  chunkId: string; // chunk.id，即 `${docId}-${index}`
  score: number; // 该路的原始分（cosine 或 BM25）
}
