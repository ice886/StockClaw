import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { DocumentParserService } from './document-parser.service';
import { ChunkingService } from './chunking.service';
import { EmbeddingService } from './embedding.service';
import { VectorStoreService } from './vector-store.service';
import { Bm25Service } from './bm25.service';

@Module({
  imports: [ConfigModule],
  controllers: [RagController],
  providers: [
    RagService,
    DocumentParserService,
    ChunkingService,
    EmbeddingService,
    VectorStoreService,
    Bm25Service,
  ],
  exports: [RagService],
})
export class RagModule {}
