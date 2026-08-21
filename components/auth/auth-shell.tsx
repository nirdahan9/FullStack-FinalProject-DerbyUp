import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Shared frame for the login and signup screens: the DerbyUp mark, a heading,
 * and a card-kickoff surface holding the form.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-5 py-10">
      <div className="flex items-center gap-2">
        <Image
          src="/kickoff_logo_cropped.png"
          alt=""
          width={28}
          height={28}
          className="h-6 w-auto"
          priority
        />
        <span className="text-2xl font-black tracking-tight">DerbyUp</span>
      </div>

      <div className="w-full max-w-md">
        <div className="card-kickoff flex flex-col gap-5">
          <div className="flex flex-col gap-1 text-center">
            <h1 className="text-xl font-black text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {children}
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">{footer}</p>
      </div>
    </main>
  );
}
