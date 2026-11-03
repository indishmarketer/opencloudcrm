export interface LevelInfo {
  level: number;
  name: string;
  minPoints: number;
  nextLevelPoints: number | null;
  progressPercent: number;
}

export const LEVELS: { level: number; name: string; minPoints: number }[] = [
  { level: 1, name: "Newbie", minPoints: 0 },
  { level: 2, name: "Explorer", minPoints: 5 },
  { level: 3, name: "Contributor", minPoints: 20 },
  { level: 4, name: "Builder", minPoints: 65 },
  { level: 5, name: "Pro", minPoints: 155 },
  { level: 6, name: "Master", minPoints: 515 },
  { level: 7, name: "Mentor", minPoints: 1450 },
  { level: 8, name: "Guru", minPoints: 3850 },
  { level: 9, name: "Legend", minPoints: 10000 },
];

export function getLevelInfo(points: number = 0): LevelInfo {
  const pts = Math.max(0, points || 0);
  let currentLevel = LEVELS[0];
  let nextLevel: (typeof LEVELS)[number] | null = LEVELS[1];

  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (pts >= LEVELS[i].minPoints) {
      currentLevel = LEVELS[i];
      nextLevel = LEVELS[i + 1] || null;
      break;
    }
  }

  let progressPercent = 100;
  if (nextLevel) {
    const range = nextLevel.minPoints - currentLevel.minPoints;
    const progress = pts - currentLevel.minPoints;
    progressPercent = Math.min(100, Math.max(0, Math.round((progress / range) * 100)));
  }

  return {
    level: currentLevel.level,
    name: currentLevel.name,
    minPoints: currentLevel.minPoints,
    nextLevelPoints: nextLevel ? nextLevel.minPoints : null,
    progressPercent,
  };
}
