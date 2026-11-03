export default function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-1 text-ink">
      {Array.from({ length: count }).map((_, i) => (
        <svg key={i} viewBox="0 0 20 20" className="h-4 w-4 fill-current">
          <path d="M10 1l2.39 4.84L18 6.71l-4 3.9.94 5.49L10 13.47 5.06 16.1 6 10.61l-4-3.9 5.61-.87L10 1z" />
        </svg>
      ))}
    </div>
  );
}
