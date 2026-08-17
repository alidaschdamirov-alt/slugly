import { SignIn, SignUp, useAuth as useClerkAuth } from "@clerk/react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import Sluggo from "@/components/Sluggo";

export default function AuthPage() {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const [, setLocation] = useLocation();
  const mode = new URLSearchParams(window.location.search).get("mode");
  const isSignUp = mode === "signup";
  const [showClerkFallback, setShowClerkFallback] = useState(false);

  useEffect(() => {
    if (isLoaded) {
      setShowClerkFallback(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowClerkFallback(true);
    }, 6500);

    return () => window.clearTimeout(timeoutId);
  }, [isLoaded]);

  useEffect(() => {
    if (isLoaded && isSignedIn) setLocation("/dashboard");
  }, [isLoaded, isSignedIn, setLocation]);

  if (!isLoaded && showClerkFallback) {
    return (
      <div
        className="min-h-screen grid place-items-center bg-[#F4F4FB] px-6"
        style={{ fontFamily: "'Hanken Grotesk', sans-serif" }}
      >
        <div className="w-full max-w-[460px] rounded-3xl border border-[#E5E5EF] bg-white p-8 text-center shadow-[0_18px_48px_-24px_rgba(40,30,120,.32)]">
          <a href="/" className="mb-6 inline-flex items-center justify-center gap-3">
            <img
              src="/assets/slugly-logo.svg"
              alt="Slugly"
              className="h-10 w-10"
            />
            <span
              className="text-2xl font-[800] tracking-[-0.5px] text-[#14152B]"
              style={{ fontFamily: "'Bricolage Grotesque'" }}
            >
              Slugly
            </span>
          </a>

          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-[#F0EDFF] text-[#5A3FF0]">
            <div className="h-7 w-7 rounded-full border-2 border-[#5A3FF0] border-t-transparent" />
          </div>

          <h1 className="text-[26px] font-extrabold tracking-[-0.7px] text-[#14152B]">
            Login is being prepared
          </h1>
          <p className="mt-3 text-[15px] leading-6 text-[#6F6F8C]">
            User management is temporarily in setup mode. Clerk did not finish
            loading, so we stopped the infinite spinner and showed this fallback.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-[#5A3FF0] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#4A2FE0]"
            >
              Try again
            </button>
            <a
              href="/"
              className="rounded-xl border border-[#E5E5EF] px-5 py-3 text-sm font-bold text-[#14152B] transition hover:bg-[#F4F4FB]"
            >
              Back to homepage
            </a>
          </div>

          <p className="mt-5 text-xs text-[#9A9AB2]">
            Temporary fallback until production Clerk keys and domains are
            finalized.
          </p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#F4F4FB]">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#5A3FF0] border-t-transparent" />
      </div>
    );
  }

  if (isSignedIn) return null;

  return (
    <div
      className="min-h-screen grid grid-cols-1 lg:grid-cols-[1.05fr_1fr]"
      style={{ fontFamily: "'Hanken Grotesk', sans-serif" }}
    >
      <aside
        className="hidden lg:flex relative overflow-hidden text-white p-11 flex-col justify-between"
        style={{
          background:
            "linear-gradient(150deg, #5A3FF0 0%, #7B61FF 55%, #6A4BFF 100%)",
        }}
      >
        <div
          className="absolute -right-20 -bottom-20 w-[300px] h-[300px] rounded-full"
          style={{ background: "rgba(255,90,60,.4)", filter: "blur(40px)" }}
        />

        <a href="/" className="relative z-10 flex items-center gap-3">
          <img
            src="/assets/slugly-logo.svg"
            alt="Slugly"
            className="w-10 h-10"
          />
          <span
            className="font-[800] text-2xl tracking-[-0.5px]"
            style={{ fontFamily: "'Bricolage Grotesque'" }}
          >
            Slugly
          </span>
        </a>

        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="relative grid h-[230px] w-[230px] place-items-center before:absolute before:inset-0 before:rounded-full before:bg-[radial-gradient(circle_at_50%_45%,rgba(255,255,255,.92),rgba(255,255,255,.5)_46%,rgba(255,255,255,0)_70%)]">
            <Sluggo className="slugly-mascot-wave relative h-[190px] w-[190px]" />
          </div>
          <div className="relative z-10 -mt-1 max-w-[24ch] rounded-[16px_16px_16px_4px] bg-white px-4 py-2.5 text-[14.5px] font-semibold text-[#14152B] shadow-[0_14px_30px_-16px_rgba(20,20,40,.5)]">
            {isSignUp
              ? "Welcome! Let's build your first project."
              : "Welcome back! Let's get you in."}
          </div>
          <h1 className="mt-[22px] text-3xl font-extrabold tracking-[-1px]">
            {isSignUp ? "Your links start here" : "Your links missed you"}
          </h1>
          <p className="mt-2 max-w-[30ch] text-[15.5px] text-white/90">
            Group links by project, automate UTMs, and follow campaign clicks in
            real time.
          </p>
        </div>

        <p className="relative z-10 text-sm text-white/75">
          Authentication and account security are powered by Clerk.
        </p>
      </aside>

      <main className="flex items-center justify-center p-6 sm:p-10 min-h-screen bg-[#F4F4FB]">
        <div className="w-full max-w-[430px] flex flex-col items-center">
          <a href="/" className="flex lg:hidden items-center gap-3 mb-7">
            <img
              src="/assets/slugly-logo.svg"
              alt="Slugly"
              className="w-9 h-9"
            />
            <span
              className="font-[800] text-[22px] tracking-[-0.5px] text-[#14152B]"
              style={{ fontFamily: "'Bricolage Grotesque'" }}
            >
              Slugly
            </span>
          </a>

          {isSignUp ? (
            <SignUp
              routing="hash"
              signInUrl="/auth"
              fallbackRedirectUrl="/dashboard"
              appearance={clerkAppearance}
            />
          ) : (
            <SignIn
              routing="hash"
              signUpUrl="/auth?mode=signup"
              fallbackRedirectUrl="/dashboard"
              appearance={clerkAppearance}
            />
          )}
        </div>
      </main>
    </div>
  );
}

const clerkAppearance = {
  variables: {
    colorPrimary: "#5A3FF0",
    colorText: "#14152B",
    colorTextSecondary: "#6F6F8C",
    colorBackground: "#FFFFFF",
    colorInputBackground: "#FFFFFF",
    colorInputText: "#14152B",
    borderRadius: "0.75rem",
    fontFamily: "'Hanken Grotesk', sans-serif",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none",
    card: "w-full border border-[#E5E5EF] shadow-[0_18px_48px_-24px_rgba(40,30,120,.32)]",
    headerTitle: "font-['Bricolage_Grotesque'] font-extrabold",
    formButtonPrimary: "bg-[#5A3FF0] hover:bg-[#4A2FE0]",
    footerActionLink: "text-[#4A2FE0]",
  },
} as const;
