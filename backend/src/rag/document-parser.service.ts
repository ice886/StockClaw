import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as mammoth from 'mammoth';

// pdf-parse 是 CommonJS 模块，使用 require 风格导入避免类型/ESM 互操作问题
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (
  buffer: Buffer,
) => Promise<{ text: string }>;

@Injectable()
export class DocumentParserService {
  private readonly logger = new Logger(DocumentParserService.name);

  /** 将上传文件的二进制内容解析为纯文本 */
  async parse(buffer: Buffer, mimeType: string): Promise<string> {
    switch (mimeType) {
      case 'application/pdf':
        return (await pdfParse(buffer)).text;
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return (await mammoth.extractRawText({ buffer })).value;
      case 'text/plain':
        return buffer.toString('utf-8');
      default:
        throw new BadRequestException(`不支持的文件类型: ${mimeType}`);
    }
  }
}
