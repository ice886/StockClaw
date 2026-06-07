import { SessionService } from './session.service';
import {
  Body,
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Param,
} from '@nestjs/common';

@Controller('api')
export class SessionController {
  constructor(private readonly session: SessionService) {}

  @Post('sessions')
  async createSession(@Body() dto: { title: string }): Promise<{ id: string }> {
    const id = await this.session.createSession(dto.title);
    return { id };
  }

  @Get('sessions')
  getSessions() {
    return this.session.getSessions();
  }

  @Get('sessions/:id')
  getSession(@Param('id') id: string) {
    return this.session.getSession(id);
  }

  @Patch('sessions/:id')
  updateSession(
    @Param('id') id: string,
    @Body()
    dto: {
      title: string;
      messages: { role: 'user' | 'assistant'; content: string }[];
    },
  ) {
    return this.session.updateSession(id, dto.title, dto.messages);
  }

  @Delete('sessions/:id')
  deleteSession(@Param('id') id: string) {
    return this.session.deleteSession(id);
  }

  @Post('sessions/generate-title')
  async generateTitle(@Body() dto: { message: string }) {
    const title = await this.session.generateTitle(dto.message);
    return { title };
  }
}
