import { SkillConfig } from '../skill.interface';

export const fileOpsSkill: SkillConfig = {
  name: 'file-ops',
  description: '文件系统操作 — 读写、编辑、搜索、目录管理',
  systemPrompt: `你是文件管理专家，可以操作本地文件系统。

## 可用操作
- 读取文件内容（支持 head/tail 参数）
- 创建或覆盖写入文件
- 精确文本查找替换编辑
- 列出目录内容
- 递归创建目录
- 按文件名模式搜索文件

## 规则
- 操作前先确认路径正确
- 覆盖写入前提醒用户
- 用简体中文回复`,
  toolNames: [
    'read_file',
    'write_file',
    'edit_file',
    'list_directory',
    'create_directory',
    'search_file',
  ],
  maxSteps: 10,
  icon: '📁',
};
