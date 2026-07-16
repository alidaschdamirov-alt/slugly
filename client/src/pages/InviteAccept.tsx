import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";
import { Users, Check, X } from "lucide-react";
import { getLoginUrl } from "@/const";

export default function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  const acceptMutation = trpc.workspace.acceptInvitation.useMutation({
    onSuccess: (data) => {
      toast.success("Invitation accepted! Welcome to the team.");
      localStorage.setItem("slugly_workspace_id", String(data.workspaceId));
      setLocation("/dashboard");
    },
    onError: (err) => toast.error(err.message),
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Users className="h-10 w-10 mx-auto text-primary mb-2" />
            <CardTitle>Team Invitation</CardTitle>
            <CardDescription>
              You need to sign in to accept this invitation.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => { window.location.href = getLoginUrl(); }}>
              Sign in to continue
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Users className="h-10 w-10 mx-auto text-primary mb-2" />
          <CardTitle>Accept Invitation</CardTitle>
          <CardDescription>
            You've been invited to join a workspace on Slugly.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center gap-3">
          <Button
            onClick={() => acceptMutation.mutate({ token: token || "" })}
            disabled={acceptMutation.isPending}
          >
            <Check className="mr-2 h-4 w-4" />
            {acceptMutation.isPending ? "Accepting..." : "Accept"}
          </Button>
          <Button variant="outline" onClick={() => setLocation("/dashboard")}>
            <X className="mr-2 h-4 w-4" />
            Decline
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
