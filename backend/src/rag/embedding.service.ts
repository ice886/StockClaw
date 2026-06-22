import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ZHIPU_EMBEDDING_URL = 'https://open.bigmodel.cn/api/paas/v4/embeddings';
const EMBEDDING_MODEL = 'embedding-3';
const BATCH_SIZE = 64; // 智谱单次请求条数上限

interface ZhipuEmbeddingResponse {
  data?: { embedding: number[]; index: number }[];
  error?: { message?: string };
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(private configService: ConfigService) {}

  /** 批量文本向量化，自动分批；返回顺序与输入一致 */
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const apiKey = this.configService.get<string>('ZHIPUAI_API_KEY');
    if (!apiKey) {
      throw new Error('ZHIPUAI_API_KEY 未配置，无法进行向量化');
    }

    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      vectors.push(...(await this.embedBatch(batch, apiKey)));
    }
    return vectors;
  }

  private async embedBatch(
    texts: string[],
    apiKey: string,
  ): Promise<number[][]> {
    const response = await fetch(ZHIPU_EMBEDDING_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Embedding 请求失败 ${response.status}: ${body}`);
      throw new Error(`Embedding API 错误: ${response.status}`);
    }

    const data = (await response.json()) as ZhipuEmbeddingResponse;
    if (!data.data) {
      throw new Error(
        `Embedding 响应异常: ${data.error?.message ?? '无 data 字段'}`,
      );
    }

    // 按 index 排序，确保与输入顺序对齐
    return data.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}
