import CopyTextButton from "@/components/CopyTextButton";
import DownloadSkillButton from "@/components/DownloadSkillButton";

export type GuideStepCardData = {
  index: number;
  itemType: "prompt" | "skill";
  slug: string;
  title: string;
  text: string;
  categoryName: string;
  timestampLabel: string | null;
  instruction: string | null;
};

export default function GuideStepCard({ step }: { step: GuideStepCardData }) {
  return (
    <div className="rounded-2xl border border-line p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-xs font-semibold text-paper">
          {step.index}
        </span>
        {step.timestampLabel && (
          <span className="rounded-full bg-paper-soft px-2.5 py-1 text-xs font-medium text-ink-soft">At {step.timestampLabel}</span>
        )}
        <span className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-soft">{step.categoryName}</span>
        <span className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-soft">
          {step.itemType === "prompt" ? "Prompt" : "Skill"}
        </span>
      </div>

      {step.instruction && <p className="mt-3 text-ink-soft">{step.instruction}</p>}

      <p className="mt-4 font-display font-semibold">{step.title}</p>
      <div className="mt-3 rounded-xl border border-line bg-paper-soft p-4">
        <pre className={`whitespace-pre-wrap break-words text-sm leading-6 ${step.itemType === "skill" ? "font-mono text-xs" : "font-sans"}`}>
          {step.text}
        </pre>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <CopyTextButton text={step.text} label={step.itemType === "prompt" ? "Copy prompt" : "Copy skill"} />
        {step.itemType === "skill" && <DownloadSkillButton text={step.text} filename={`${step.slug}.md`} />}
      </div>
    </div>
  );
}
