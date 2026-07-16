import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronsUpDown, Plus, Users } from "lucide-react";
import { useLocation } from "wouter";

export default function WorkspaceSwitcher() {
  const { workspace } = useAuth();
  const [, setLocation] = useLocation();
  const { data: workspaces } = trpc.workspace.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const handleSwitch = (wsId: number) => {
    // Store workspace ID in localStorage and reload to apply new context
    localStorage.setItem("slugly_workspace_id", String(wsId));
    window.location.reload();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 gap-1.5 px-2 text-sm font-medium">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="max-w-[120px] truncate">{workspace?.name || "Workspace"}</span>
          <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Workspaces
        </div>
        {workspaces?.map(m => (
          <DropdownMenuItem
            key={m.workspaceId}
            onClick={() => handleSwitch(m.workspaceId)}
            className="flex items-center justify-between"
          >
            <span className="truncate">{m.workspace.name}</span>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {m.workspace.plan}
              </Badge>
              {m.workspaceId === workspace?.id && (
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setLocation("/team")}>
          <Plus className="mr-2 h-4 w-4" />
          Team Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
