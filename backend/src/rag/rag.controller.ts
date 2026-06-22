import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RagService } from './rag.service';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

@Controller('api/rag')
export class RagController {
  constructor(private rag: RagService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('sessionId') sessionId: string,
  ) {
    return this.rag.upload(file, sessionId);
  }

  @Get('docs/:sessionId')
  listDocs(@Param('sessionId') sessionId: string) {
    return this.rag.listDocuments(sessionId);
  }

  @Delete('docs/:sessionId/:docId')
  async deleteDoc(
    @Param('sessionId') sessionId: string,
    @Param('docId') docId: string,
  ) {
    const deleted = await this.rag.deleteDocument(sessionId, docId);
    return { success: deleted };
  }
}
