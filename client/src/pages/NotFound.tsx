import Sluggo from "@/components/Sluggo";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background px-5 py-8 text-foreground">
      <button
        className="flex items-center gap-2.5"
        onClick={() => setLocation("/")}
      >
        <img src="/assets/slugly-logo.svg" alt="Slugly" className="h-8 w-8" />
        <span
          className="text-xl font-extrabold"
          style={{ fontFamily: "'Bricolage Grotesque'" }}
        >
          Slugly
        </span>
      </button>

      <main className="mx-auto flex min-h-[calc(100vh-100px)] max-w-xl flex-col items-center justify-center text-center">
        <Sluggo variant="oops" className="h-44 w-48" />
        <p className="font-mono text-sm font-medium text-[#FF5A3C]">
          404 · NOT FOUND
        </p>
        <h1 className="mt-2 text-[clamp(32px,6vw,50px)] font-extrabold leading-tight">
          This link slithered away
        </h1>
        <p className="mt-3 max-w-[48ch] text-base text-muted-foreground">
          The page or short link you followed has expired, was removed, or never
          existed. Sluggo couldn&apos;t find it.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2.5">
          <Button size="lg" onClick={() => setLocation("/dashboard")}>
            Back to dashboard
          </Button>
          <Button size="lg" variant="outline" onClick={() => setLocation("/")}>
            Go home
          </Button>
        </div>
      </main>
    </div>
  );
}
