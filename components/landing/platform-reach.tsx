import { ORIGIN_PLATFORMS } from "@/lib/original-product";

/**
 * Where the original product ran.
 *
 * The chat bots are the part worth dwelling on. An office prediction league
 * lives or dies on whether people remember to open an app, and they mostly do
 * not — so the original met them inside the group chat they were already
 * arguing in. That is a product decision, not an integration checklist, which
 * is why the copy says so rather than just listing six logos.
 */
export function PlatformReach() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-24">
      <div className="flex flex-col gap-2 text-center">
        <span className="section-label">איפה זה רץ</span>
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
          שש פלטפורמות, אותה ליגה
        </h2>
        <p className="mx-auto max-w-2xl text-sm leading-relaxed text-muted-foreground">
          ליגת ניחושים במשרד נופלת כשצריך לזכור לפתוח אפליקציה. לכן הניחוש עבד
          גם מתוך קבוצת הוואטסאפ או הטלגרם — באותו צ׳אט שבו ממילא מתווכחים על
          המשחק, בלי להוריד כלום.
        </p>
      </div>

      <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {ORIGIN_PLATFORMS.map((platform, index) => (
          <li
            key={platform.name}
            className="card-kickoff flex animate-fade-in-up flex-col gap-1 text-center"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <span className="text-base font-black">{platform.name}</span>
            <span className="text-[11px] leading-snug text-muted-foreground">
              {platform.detail}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
