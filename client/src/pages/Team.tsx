import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useState } from "react";
import { Users, Mail, Crown, Shield, Pencil, Eye, UserMinus, Send, Clock, X } from "lucide-react";
import AppShell from "@/components/AppShell";
import { getLoginUrl } from "@/const";

export default function Team() {
  const { user, workspace, membership, loading } = useAuth();
  const utils = trpc.useUtils();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "editor" | "viewer">("editor");
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: wsInfo } = trpc.workspace.current.useQuery(undefined, {
    enabled: !!user,
    refetchOnWindowFocus: false,
  });
  const { data: members } = trpc.workspace.members.useQuery(undefined, {
    enabled: !!user,
    refetchOnWindowFocus: false,
  });
  const { data: invitations } = trpc.workspace.invitations.useQuery(undefined, {
    enabled: !!user,
    refetchOnWindowFocus: false,
  });

  const inviteMutation = trpc.workspace.invite.useMutation({
    onSuccess: () => {
      toast.success("Invitation sent!");
      setInviteEmail("");
      utils.workspace.invitations.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateRoleMutation = trpc.workspace.updateMemberRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated");
      utils.workspace.members.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMemberMutation = trpc.workspace.removeMember.useMutation({
    onSuccess: () => {
      toast.success("Member removed");
      utils.workspace.members.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelInviteMutation = trpc.workspace.cancelInvitation.useMutation({
    onSuccess: () => {
      toast.success("Invitation cancelled");
      utils.workspace.invitations.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateNameMutation = trpc.workspace.updateName.useMutation({
    onSuccess: () => {
      toast.success("Workspace name updated");
      utils.workspace.current.invalidate();
      utils.auth.me.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const isAdmin = membership?.role === "owner" || membership?.role === "admin";

  const roleIcon = (role: string) => {
    switch (role) {
      case "owner": return <Crown className="h-3.5 w-3.5 text-amber-500" />;
      case "admin": return <Shield className="h-3.5 w-3.5 text-blue-500" />;
      case "editor": return <Pencil className="h-3.5 w-3.5 text-green-500" />;
      case "viewer": return <Eye className="h-3.5 w-3.5 text-muted-foreground" />;
      default: return null;
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AppShell>
    );
  }

  if (!user) {
    window.location.href = getLoginUrl();
    return null;
  }

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Workspace Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {editingName ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="h-8 w-48"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newName.trim()) {
                            updateNameMutation.mutate({ name: newName.trim() });
                            setEditingName(false);
                          }
                          if (e.key === "Escape") setEditingName(false);
                        }}
                      />
                      <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>Cancel</Button>
                    </div>
                  ) : (
                    <span
                      className={isAdmin ? "cursor-pointer hover:underline" : ""}
                      onClick={() => {
                        if (isAdmin) {
                          setNewName(workspace?.name || "");
                          setEditingName(true);
                        }
                      }}
                    >
                      {workspace?.name || "Workspace"}
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="mt-1">
                  Manage your team members and workspace settings
                </CardDescription>
              </div>
              <Badge variant="secondary" className="text-xs capitalize">
                {wsInfo?.workspace?.plan || "free"} plan
              </Badge>
            </div>
          </CardHeader>
          {wsInfo && (
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold">{wsInfo.usage.members}</p>
                  <p className="text-xs text-muted-foreground">Members</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{wsInfo.usage.projects}</p>
                  <p className="text-xs text-muted-foreground">Projects</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{wsInfo.usage.links}</p>
                  <p className="text-xs text-muted-foreground">Links</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{wsInfo.usage.domains}</p>
                  <p className="text-xs text-muted-foreground">Domains</p>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Invite Member */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="h-4 w-4" />
                Invite Team Member
              </CardTitle>
              <CardDescription>
                Send an invitation email to add someone to this workspace.
                {wsInfo?.planConfig?.limits.seats !== -1 && (
                  <span className="ml-1">
                    ({wsInfo?.usage.members}/{wsInfo?.planConfig?.limits.seats} seats used)
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="flex flex-col sm:flex-row gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (inviteEmail.trim()) {
                    inviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole });
                  }
                }}
              >
                <Input
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1"
                />
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as any)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="submit" disabled={inviteMutation.isPending || !inviteEmail.trim()}>
                  <Mail className="mr-2 h-4 w-4" />
                  Invite
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Pending Invitations */}
        {isAdmin && invitations && invitations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Pending Invitations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {invitations.map(inv => (
                <div key={inv.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{inv.email}</p>
                      <p className="text-xs text-muted-foreground capitalize">Invited as {inv.role}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => cancelInviteMutation.mutate({ id: inv.id })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Members List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Members</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {members?.map((m, i) => (
              <div key={m.id}>
                {i > 0 && <Separator className="my-2" />}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {m.user.name?.charAt(0).toUpperCase() || m.user.email?.charAt(0).toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{m.user.name || "Unnamed"}</p>
                      <p className="text-xs text-muted-foreground">{m.user.email || "No email"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {roleIcon(m.role)}
                    {isAdmin && m.role !== "owner" ? (
                      <Select
                        value={m.role}
                        onValueChange={(v) => updateRoleMutation.mutate({ memberId: m.id, role: v as any })}
                      >
                        <SelectTrigger className="h-7 w-24 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {membership?.role === "owner" && <SelectItem value="admin">Admin</SelectItem>}
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" className="text-xs capitalize">
                        {m.role}
                      </Badge>
                    )}
                    {isAdmin && m.role !== "owner" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeMemberMutation.mutate({ memberId: m.id })}
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
