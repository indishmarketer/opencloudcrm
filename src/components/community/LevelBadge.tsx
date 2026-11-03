import { getLevelInfo } from "@/lib/gamification";

export default function LevelBadge({ points = 0, size = "sm" }: { points?: number; size?: "sm" | "md" | "lg" }) {
  const info = getLevelInfo(points);

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[11px]",
    md: "px-2.5 py-0.5 text-xs",
    lg: "px-3 py-1 text-xs",
  };

  return (
    <span
      title={`Level ${info.level}: ${info.name} (${points} pts)`}
      className={`inline-flex items-center gap-1 rounded-full border border-line bg-paper-soft text-ink font-medium ${sizeClasses[size]}`}
    >
      <span className="font-semibold text-ink">Lv.{info.level}</span>
      {size !== "sm" && <span className="text-ink-soft">· {info.name}</span>}
    </span>
  );
}
