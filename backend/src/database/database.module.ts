import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// 全局注册，各模块无需重复 import 即可注入 PrismaService
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
