import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <Image
        src="/img/logo.svg"
        alt="SPOT logo"
        width={128}
        height={128}
        priority
        className="dark:invert"
      />
      <h1 className="text-5xl font-bold tracking-tight">SPOT</h1>
      <p className="text-muted-foreground max-w-md text-balance">
        Scouting Platforms On Time. Version 6 is under construction; the specification lives in{" "}
        <code className="bg-muted rounded px-1 py-0.5 text-sm">docs/spec</code>.
      </p>
      <Link href="/scouting-preview" className="text-primary underline-offset-4 hover:underline">
        Scouting-screen preview
      </Link>
    </main>
  );
}
