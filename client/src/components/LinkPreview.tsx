import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { ExternalLink, Globe } from "lucide-react";

interface LinkPreviewProps {
  url: string;
}

export default function LinkPreview({ url }: LinkPreviewProps) {
  const { data, isLoading } = trpc.link.preview.useQuery(
    { url },
    { staleTime: 1000 * 60 * 60, retry: false } // Cache for 1 hour
  );

  if (isLoading) {
    return (
      <Card className="p-4 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
        </div>
      </Card>
    );
  }

  if (!data) return null;

  const hostname = (() => {
    try { return new URL(url).hostname; } catch { return url; }
  })();

  return (
    <Card className="p-4 hover:bg-accent/30 transition-colors">
      <div className="flex items-start gap-3">
        {data.favicon ? (
          <img
            src={data.favicon}
            alt=""
            className="w-8 h-8 rounded shrink-0 object-contain bg-muted"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
            <Globe className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{data.title || hostname}</p>
          {data.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{data.description}</p>
          )}
          <div className="flex items-center gap-1 mt-1.5">
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground truncate">{hostname}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
