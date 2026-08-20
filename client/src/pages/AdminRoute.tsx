import { useAuth } from "@/_core/hooks/useAuth";
import { Loader2 } from "lucide-react";
import AdminIpAllowlistPanel from "./AdminIpAllowlistPanel";
import AdminPanelWithSecurity from "./AdminPanelWithSecurity";
import PrivilegedSessionsPanel from "./PrivilegedSessionsPanel";
import SupportAdminPanel from "./SupportAdminPanel";
import SupportSecurityDrawer from "./SupportSecurityDrawer";

export default function AdminRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (user?.role === "admin") {
    return (
      <>
        <AdminPanelWithSecurity />
        <PrivilegedSessionsPanel />
        <AdminIpAllowlistPanel />
      </>
    );
  }

  if (user?.role === "support") {
    return (
      <>
        <SupportAdminPanel />
        <SupportSecurityDrawer />
        <PrivilegedSessionsPanel />
      </>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">Administrator or support access is required.</p>
      </div>
    </div>
  );
}
