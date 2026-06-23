/**
 * 一次性迁移脚本：data/sessions/*.json → SQLite (Session + Message 表)
 *
 * 运行（在 backend/ 目录下）：
 *   npx ts-node scripts/migrate-to-db.ts
 *
 * 幂等：已存在同 id 的 Session 跳过，可重复执行。
 * 原 JSON 文件保留不动，便于回滚。
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

interface SessionJson {
  id: string;
  title: string;
  messages: { role: string; content: string }[];
  createdAt: number;
  updatedAt: number;
}

const DB_URL = `file:${resolve(process.cwd(), 'data', 'app.db')}`;
const SESSIONS_DIR = resolve(process.cwd(), 'data', 'sessions');

function genId(): string {
  return Math.random().toString(36).substring(2);
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: DB_URL }),
  });

  let migrated = 0;
  let skipped = 0;
  let msgCount = 0;

  if (!existsSync(SESSIONS_DIR)) {
    console.log(`目录不存在，无可迁移数据：${SESSIONS_DIR}`);
    await prisma.$disconnect();
    return;
  }

  const files = (await readdir(SESSIONS_DIR)).filter((f) =>
    f.endsWith('.json'),
  );
  console.log(`发现 ${files.length} 个 session 文件`);

  for (const file of files) {
    const raw = await readFile(join(SESSIONS_DIR, file), 'utf-8');
    const s = JSON.parse(raw) as SessionJson;

    const exists = await prisma.session.findUnique({
      where: { id: s.id },
      select: { id: true },
    });
    if (exists) {
      skipped++;
      console.log(`  跳过（已存在）：${s.id}`);
      continue;
    }

    const created = new Date(s.createdAt);
    const updated = new Date(s.updatedAt);

    await prisma.session.create({
      data: {
        id: s.id,
        title: s.title,
        createdAt: created,
        updatedAt: updated,
        messages: {
          create: s.messages.map((m, i) => ({
            id: genId(),
            role: m.role,
            content: m.content,
            // 落在 createdAt 与 updatedAt 之间，递增保序
            createdAt: new Date(s.createdAt + i),
          })),
        },
      },
    });
    migrated++;
    msgCount += s.messages.length;
    console.log(`  迁移：${s.id}（${s.messages.length} 条消息）`);
  }

  // 校验
  const dbSessions = await prisma.session.count();
  const dbMessages = await prisma.message.count();

  console.log('\n=== 迁移完成 ===');
  console.log(`本次迁移 session：${migrated}，跳过：${skipped}`);
  console.log(`本次迁移 message：${msgCount}`);
  console.log(`数据库现有 session：${dbSessions}，message：${dbMessages}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('迁移失败：', e);
  process.exit(1);
});
