/** Skeleton shown while a server component streams in. */
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-hidden>
      <div className="flex flex-col gap-2">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-8 w-2/3 rounded-lg bg-muted" />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-20 rounded-[24px] bg-muted" />
      ))}
    </div>
  );
}
