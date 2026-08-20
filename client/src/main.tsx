import * as Sentry from "@sentry/react";
import { ClerkProvider } from "@clerk/react";
import { trpc } from "@/lib/trpc";
import { injectAdminReasons } from "@/lib/adminReasonTransport";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import { UNAUTHED_ERR_MSG } from "@shared/const";

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.MODE === "production" ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
  });
}
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient();
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
  throw new Error(
    "VITE_CLERK_PUBLISHABLE_KEY is required. Add it to .env for local development or to the Render service environment."
  );
}

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;
  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
  if (!isUnauthorized) return;
  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        const wsId = localStorage.getItem("slugly_workspace_id");
        return wsId ? { "x-workspace-id": wsId } : {};
      },
      fetch(input, init) {
        let nextInit = init;
        if (typeof window !== "undefined" && typeof init?.body === "string") {
          try {
            const nextBody = injectAdminReasons(
              requestUrl(input),
              init.body,
              label => window.prompt(`${label}:\n\nThis reason will be stored in the Slugly audit log.`)
            );
            if (nextBody !== init.body) {
              nextInit = { ...init, body: nextBody as BodyInit };
            }
          } catch (error: any) {
            window.alert(error?.message || "Administrative action canceled.");
            return Promise.reject(error);
          }
        }

        return globalThis.fetch(input, {
          ...(nextInit ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/">
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ImpersonationBanner />
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  </ClerkProvider>
);
