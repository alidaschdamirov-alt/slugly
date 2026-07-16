import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { Tag, MousePointerClick, Link2, Loader2, ArrowRight, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function TagsPage() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  const { data: tags, isLoading } = trpc.tag.list.useQuery(undefined, { enabled: !!user });

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!user) { window.location.href = getLoginUrl(); return null; }

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tags</h1>
          <p className="text-muted-foreground mt-1">Workspace-level tags across all your projects</p>
        </div>
        {tags && tags.length >= 2 && (
          <Button variant="outline" size="sm" onClick={() => setLocation("/tags/compare")}>
            <BarChart3 className="h-4 w-4 mr-1.5" />
            Compare Tags
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !tags || tags.length === 0 ? (
        <Card className="p-12 text-center">
          <Tag className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-medium text-lg mb-2">No tags yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Tags are added when you create or edit links. They work across all projects for cross-campaign analysis.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tags.map((tag) => (
            <Card
              key={tag.tag}
              className="p-4 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group"
              onClick={() => setLocation(`/tags/${encodeURIComponent(tag.tag)}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <Badge variant="secondary" className="text-sm px-2.5 py-0.5">
                  <Tag className="h-3 w-3 mr-1" />
                  {tag.tag}
                </Badge>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5" />
                  {tag.linkCount} {tag.linkCount === 1 ? "link" : "links"}
                </span>
                <span className="flex items-center gap-1.5">
                  <MousePointerClick className="h-3.5 w-3.5" />
                  {tag.totalClicks.toLocaleString()} clicks
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
