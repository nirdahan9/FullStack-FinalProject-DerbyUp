export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="section-label">בקרוב</span>
        <h1 className="text-3xl font-black leading-tight">ליגות</h1>
      </div>
      <div className="card-kickoff">
        <p className="text-sm text-muted-foreground">הליגות שלך יופיעו כאן. יצירה והצטרפות נוספות בשלב 5.</p>
      </div>
    </div>
  );
}
