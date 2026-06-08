import type { SkillInfo } from '../api/skill';
import './SkillSelector.css';

interface Props {
  skills: SkillInfo[];
  activeSkill: string;
  onSelect: (name: string) => void;
}

export function SkillSelector({ skills, activeSkill, onSelect }: Props) {
  return (
    <div className="skill-selector">
      {skills.map((s) => (
        <button
          key={s.name}
          className={`skill-tab${s.name === activeSkill ? ' active' : ''}`}
          onClick={() => onSelect(s.name)}
          title={s.description}
        >
          <span className="skill-icon">{s.icon}</span>
          <span className="skill-name">{s.name}</span>
        </button>
      ))}
    </div>
  );
}
