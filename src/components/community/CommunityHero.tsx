type Props = {
  title: string;
  description: string;
  badge?: string;
};

export default function CommunityHero({ title, description, badge = "Community" }: Props) {
  return (
    <div className="bg-ink-gradient text-paper">
      <div className="mx-auto flex h-[220px] max-w-5xl flex-col justify-center px-6 py-8 md:h-[224px] md:py-10">
        <span className="w-fit rounded-full border border-white/30 px-3 py-1 text-xs uppercase tracking-wide text-white/80">
          {badge}
        </span>
        <h1 className="mt-4 font-display text-4xl font-semibold">{title}</h1>
        <p className="mt-2 line-clamp-2 max-w-xl text-sm leading-6 text-white/70">
          {description}
        </p>
      </div>
    </div>
  );
}
