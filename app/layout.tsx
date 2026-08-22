import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import { ThemeProvider } from "@/components/layout/theme-provider";
import "./globals.css";

// Same family the DerbyUp app loads from Google Fonts, self-hosted by next/font
// so it does not cost a render-blocking request.
const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "700", "800", "900"],
  variable: "--font-heebo",
  display: "swap",
});

// Absolute base for the og:image URL. Vercel injects the production domain at
// build time; locally there is nothing to inject, so fall back to the dev server.
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "DerbyUp — ניחושי כדורגל לארגונים",
  description:
    "פלטפורמת ניחושי כדורגל לארגונים. פותחים ליגה, מזמינים את העובדים, ומנחשים תוצאות של משחקים אמיתיים.",
  // The DerbyUp app ships a 1x1 placeholder favicon.ico alongside a real
  // favicon.svg, so only the SVG is carried over here.
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "DerbyUp — ניחושי כדורגל לארגונים",
    description: "פותחים ליגה ארגונית, מנחשים תוצאות אמיתיות, ומצטברים בטבלה.",
    images: ["/og_image_light.jpg"],
    locale: "he_IL",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a1d" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body className={`${heebo.variable} font-heebo antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
