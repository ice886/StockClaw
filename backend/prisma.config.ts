import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 将 datasource url 从 schema.prisma 移到此处。
// 运行时连接由 PrismaService 注入 better-sqlite3 driver adapter 处理；
// 这里的 url 仅供 migrate / introspection 等 CLI 命令使用。
// 后端以 backend/ 为 cwd 运行，所有业务数据都在 backend/data/，
// 故 app.db 与 sessions/reports 等同目录，schema 仍在仓库根 prisma/。
const root = path.join(__dirname, '..');
const dbPath = path.join(__dirname, 'data', 'app.db');

export default defineConfig({
  schema: path.join(root, 'prisma', 'schema.prisma'),
  datasource: {
    url: `file:${dbPath}`,
  },
  migrations: {
    path: path.join(root, 'prisma', 'migrations'),
  },
});
