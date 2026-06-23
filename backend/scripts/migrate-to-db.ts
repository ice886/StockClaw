/**
 * 一次性迁移脚本：JSON 文件 → SQLite
 *   - data/sessions/*.json    → Session + Message 表
 *   - data/reports/*.json     → Report 表
 *   - data/monitor-config.json → MonitorConfig 表（单行 id=1）
 *
 * 运行（在 backend/ 目录下）：
 *   npx ts-node scripts/migrate-to-db.ts
 *
 * 幂等：已存在同 id 的记录跳过/覆盖，可重复执行。
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

interface ReportJson {
  id: string;
  generatedAt: string;
  events?: { celebrityName?: string }[];
}

const CONFIG_ID = 1;
const DB_URL = `file:${resolve(process.cwd(), 'data', 'app.db')}`;
const SESSIONS_DIR = resolve(process.cwd(), 'data', 'sessions');
const REPORTS_DIR = resolve(process.cwd(), 'data', 'reports');
const CONFIG_PATH = resolve(process.cwd(), 'data', 'monitor-config.json');

function genId(): string {
  return Math.random().toString(36).substring(2);
}

async function migrateSessions(prisma: PrismaClient): Promise<void> {
  let migrated = 0;
  let skipped = 0;
  let msgCount = 0;

  if (!existsSync(SESSIONS_DIR)) {
    console.log(`目录不存在，跳过 session 迁移：${SESSIONS_DIR}`);
    return;
  }

  const files = (await readdir(SESSIONS_DIR)).filter((f) =>
    f.endsWith('.json'),
  );
  console.log(`\n[Sessions] 发现 ${files.length} 个文件`);

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

  const dbSessions = await prisma.session.count();
  const dbMessages = await prisma.message.count();
  console.log(`[Sessions] 迁移 ${migrated}，跳过 ${skipped}，消息 ${msgCount}`);
  console.log(`[Sessions] 库内合计：session ${dbSessions}，message ${dbMessages}`);
}

async function migrateReports(prisma: PrismaClient): Promise<void> {
  let migrated = 0;
  let skipped = 0;

  if (!existsSync(REPORTS_DIR)) {
    console.log(`目录不存在，跳过 report 迁移：${REPORTS_DIR}`);
    return;
  }

  const files = (await readdir(REPORTS_DIR)).filter((f) => f.endsWith('.json'));
  console.log(`\n[Reports] 发现 ${files.length} 个文件`);

  for (const file of files) {
    const raw = await readFile(join(REPORTS_DIR, file), 'utf-8');
    const r = JSON.parse(raw) as ReportJson;

    const exists = await prisma.report.findUnique({
      where: { id: r.id },
      select: { id: true },
    });
    if (exists) {
      skipped++;
      console.log(`  跳过（已存在）：${r.id}`);
      continue;
    }

    const celebrity =
      [...new Set((r.events ?? []).map((e) => e.celebrityName))]
        .filter(Boolean)
        .join(', ') || '-';

    await prisma.report.create({
      data: {
        id: r.id,
        celebrity,
        data: raw,
        createdAt: r.generatedAt ? new Date(r.generatedAt) : undefined,
      },
    });
    migrated++;
    console.log(`  迁移：${r.id}`);
  }

  const dbReports = await prisma.report.count();
  console.log(`[Reports] 迁移 ${migrated}，跳过 ${skipped}`);
  console.log(`[Reports] 库内合计：report ${dbReports}`);
}

async function migrateConfig(prisma: PrismaClient): Promise<void> {
  if (!existsSync(CONFIG_PATH)) {
    console.log(`\n[Config] 文件不存在，跳过：${CONFIG_PATH}`);
    return;
  }

  const raw = await readFile(CONFIG_PATH, 'utf-8');
  // 校验是合法 JSON 后再以紧凑形式入库
  const data = JSON.stringify(JSON.parse(raw));

  await prisma.monitorConfig.upsert({
    where: { id: CONFIG_ID },
    create: { id: CONFIG_ID, data },
    update: { data },
  });
  console.log(`\n[Config] 已写入 MonitorConfig(id=${CONFIG_ID})`);
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: DB_URL }),
  });

  await migrateSessions(prisma);
  await migrateReports(prisma);
  await migrateConfig(prisma);

  console.log('\n=== 迁移完成 ===');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('迁移失败：', e);
  process.exit(1);
});
