export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="section-label">בקרוב</span>
        <h1 className="text-3xl font-black leading-tight">אתגרים</h1>
      </div>
      <div className="card-kickoff">
        <p className="text-sm text-muted-foreground">אתגר גשר הכדורגל היומי נוסף בשלב 9.</p>
      </div>
    </div>
  );
}
