import Image from "next/image";
import { ORIGIN_SCREENSHOTS } from "@/lib/original-product";

/**
 * Screenshots of the original app, taken from its Google Play listing.
 *
 * They are the real screens with real production data, which is why they are
 * worth showing at all — a mockup would say nothing. They are also in Hebrew
 * and on a dark theme, so they sit inside a phone-shaped frame rather than
 * bleeding into the page, otherwise the dark screenshots fight the light theme.
 *
 * A horizontal strip rather than a grid: five portrait phone shots in a grid
 * either come out postage-stamp sized or push the section to three screens
 * tall. The strip is also how the app itself presented its featured matches.
 */
export function ProductGallery() {
  return (
    <section id="screens" className="w-full py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-5">
        <div className="flex flex-col gap-2 text-center">
          <span className="section-label">איך זה נראה</span>
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            המסכים של האפליקציה המקורית
          </h2>
          <p className="mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground">
            צילומים מדף החנות של DerbyUp, עם נתוני אמת מהפרודקשן.
          </p>
        </div>
      </div>

      <div
        className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 sm:gap-6 lg:justify-center"
        role="list"
      >
        {ORIGIN_SCREENSHOTS.map((shot, index) => (
          <figure
            key={shot.src}
            role="listitem"
            className="flex w-[232px] shrink-0 animate-fade-in-up snap-center flex-col gap-3 sm:w-[256px]"
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <div className="overflow-hidden rounded-[28px] border-4 border-foreground/10 bg-[#141414] shadow-elevated">
              <Image
                src={shot.src}
                alt={shot.alt}
                width={506}
                height={900}
                sizes="(min-width: 640px) 256px, 232px"
                className="h-auto w-full"
              />
            </div>

            <figcaption className="flex flex-col gap-1 px-1">
              <span className="text-sm font-bold">{shot.title}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {shot.caption}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
