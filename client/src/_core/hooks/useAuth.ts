import { getLoginUrl } from "@/const";
import { identifyUser } from "@/lib/analytics";
import { trpc } from "@/lib/trpc";
import { useAuth as useClerkAuth, useUser } from "@clerk/react";
import { useCallback, useEffect, useMemo, useRef } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const { isLoaded, isSignedIn, signOut } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: isLoaded,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logout = useCallback(async () => {
    utils.auth.me.setData(undefined, {
      user: null,
      workspace: null,
      membership: null,
    });
    queryStorageCleanup();
    await signOut({ redirectUrl: "/" });
  }, [signOut, utils.auth.me]);

  const state = useMemo(() => {
    const data = meQuery.data;
    const user = isSignedIn ? (data?.user ?? null) : null;
    const workspace = user ? (data?.workspace ?? null) : null;
    const membership = user ? (data?.membership ?? null) : null;

    if (typeof window !== "undefined") {
      localStorage.setItem("slugly-user-info", JSON.stringify(user));
    }

    return {
      user,
      workspace,
      membership,
      clerkUser: clerkUser ?? null,
      loading: !isLoaded || (Boolean(isSignedIn) && meQuery.isLoading),
      error: meQuery.error ?? null,
      isAuthenticated: Boolean(isSignedIn && user),
    };
  }, [
    clerkUser,
    isLoaded,
    isSignedIn,
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
  ]);

  const identifiedRef = useRef(false);
  useEffect(() => {
    if (state.user && !identifiedRef.current) {
      identifiedRef.current = true;
      identifyUser(String(state.user.id), {
        name: state.user.name,
        email: state.user.email,
        plan: state.workspace?.plan ?? state.user.plan,
        userPlan: state.user.plan,
        workspaceId: state.workspace?.id,
        workspacePlan: state.workspace?.plan,
        membershipRole: state.membership?.role,
      });
    }
  }, [state.user, state.workspace, state.membership]);

  useEffect(() => {
    if (!redirectOnUnauthenticated || !isLoaded) return;
    if (isSignedIn) return;
    if (typeof window === "undefined") return;
    if (
      window.location.pathname ===
      new URL(redirectPath, window.location.origin).pathname
    )
      return;
    window.location.href = redirectPath;
  }, [isLoaded, isSignedIn, redirectOnUnauthenticated, redirectPath]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}

function queryStorageCleanup() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("slugly-user-info");
  localStorage.removeItem("slugly_workspace_id");
}