export interface SkillInfo {
  name: string;
  description: string;
  icon?: string;
}

export async function fetchSkills(): Promise<SkillInfo[]> {
  const res = await fetch('/api/skills');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
