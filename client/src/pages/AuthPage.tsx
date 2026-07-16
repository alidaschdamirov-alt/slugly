import { SignIn, SignUp, useAuth as useClerkAuth } from "@clerk/react";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function AuthPage() {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const [, setLocation] = useLocation();
  const mode = new URLSearchParams(window.location.search).get("mode");
  const isSignUp = mode === "signup";

  useEffect(() => {
    if (isLoaded && isSignedIn) setLocation("/dashboard");
  }, [isLoaded, isSignedIn, setLocation]);

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

        <div className="relative z-10 max-w-[24ch]">
          <h1
            className="leading-[1.08] tracking-[-1.4px]"
            style={{
              fontFamily: "'Bricolage Grotesque'",
              fontWeight: 800,
              fontSize: "38px",
            }}
          >
            Every campaign link, in{" "}
            <em className="not-italic" style={{ color: "#FFD9CF" }}>
              one live grid
            </em>
          </h1>
          <p className="opacity-90 mt-3.5 text-base leading-relaxed">
            Group short links by project, automate UTMs, and follow campaign
            clicks in real time.
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
