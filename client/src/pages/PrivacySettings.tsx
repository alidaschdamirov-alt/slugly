import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Download, Trash2, Loader2, Shield } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useClerk } from "@clerk/react";

export default function PrivacySettings() {
  const { user, loading, logout } = useAuth();
  const { openUserProfile } = useClerk();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportData = trpc.account.exportData.useMutation({
    onMutate: () => setExporting(true),
    onSuccess: (data: any) => {
      setExporting(false);
      // Download as JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `slugly-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Data exported successfully");
    },
    onError: (err: any) => {
      setExporting(false);
      toast.error(err.message);
    },
  });

  const deleteAccount = trpc.account.deleteAccount.useMutation({
    onSuccess: () => {
      toast.success("Account deleted. Redirecting...");
      setTimeout(() => {
        void logout().catch(() => {
          window.location.href = "/";
        });
      }, 800);
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (loading)
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </AppShell>
    );
  if (!user)
    return (
      <AppShell>
        <div className="text-center py-20">
          <p>Please log in to access privacy settings.</p>
        </div>
      </AppShell>
    );

  return (
    <AppShell>
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Privacy & Data
        </h1>
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* Account Info */}
        <Card className="p-6">
          <Label className="text-base font-medium">Account Information</Label>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Your account is managed securely through Clerk. Authentication,
            email, password, and connected sign-in methods can be managed from
            your Clerk account profile.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mb-4"
            onClick={() => openUserProfile()}
          >
            Manage sign-in & security
          </Button>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Name</span>
              <span className="text-sm font-medium">
                {user.name || "Not set"}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm font-medium">
                {user.email || "Not set"}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Plan</span>
              <span className="text-sm font-medium capitalize">
                {user.plan || "free"}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">
                Member since
              </span>
              <span className="text-sm font-medium">
                {new Date(user.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </Card>

        {/* Data Export */}
        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <Label className="text-base font-medium">Download My Data</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Export all your data including account info, projects, links,
                and click analytics as a JSON file.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => exportData.mutate()}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Export
            </Button>
          </div>
        </Card>

        {/* Cookie Preferences */}
        <Card className="p-6">
          <Label className="text-base font-medium">Cookie Preferences</Label>
          <p className="text-sm text-muted-foreground mt-1 mb-3">
            Manage your cookie consent. Essential cookies are always active for
            authentication.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              localStorage.removeItem("slugly_cookie_consent");
              toast.success(
                "Cookie preferences reset. Refresh the page to see the consent banner."
              );
            }}
          >
            Reset Cookie Preferences
          </Button>
        </Card>

        {/* Account Deletion */}
        <Card className="p-6 border-destructive/30">
          <div className="flex items-start justify-between">
            <div>
              <Label className="text-base font-medium text-destructive">
                Delete My Account
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Permanently delete your account and all associated data. This
                action cannot be undone. All your projects, links, and analytics
                will be erased.
              </p>
            </div>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </Card>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Your Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your account, all projects, all
              links, and all click analytics data. Short codes will be retired
              and never reused. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteAccount.mutate()}
            >
              {deleteAccount.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Yes, Delete Everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
