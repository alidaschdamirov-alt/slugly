import { Copy, Check, MousePointerClick, ExternalLink, Pencil, Trash2, QrCode } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface LinkGridCardProps {
  link: {
    id: number;
    shortCode: string;
    destinationUrl: string;
    title: string | null;
    utmSource: string | null;
    utmCampaign: string | null;
    clickCount: number;
    status: string;
    tags: string[] | null;
    createdAt: string | Date;
    updatedAt: string | Date;
  };
  sparklineData?: Array<{ day: string; count: number }>;
  onClick: () => void;
  onEdit?: () => void;
  onToggleStatus?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  onQr?: (e: React.MouseEvent) => void;
}

function MiniSparkline({ data }: { data: Array<{ day: string; count: number }> }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-8 flex items-end gap-px">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex-1 bg-muted rounded-sm" style={{ height: "2px" }} />
        ))}
      </div>
    );
  }

  const max = Math.max(...data.map(d => d.count), 1);
  const today = new Date();
  const days: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const found = data.find(x => x.day === dateStr);
    days.push(found ? found.count : 0);
  }

  return (
    <div className="h-8 flex items-end gap-px">
      {days.map((count, i) => (
        <div
          key={i}
          className="flex-1 bg-primary/60 rounded-sm transition-all"
          style={{ height: `${Math.max((count / max) * 100, 4)}%` }}
        />
      ))}
    </div>
  );
}

export default function LinkGridCard({ link, sparklineData, onClick, onEdit, onToggleStatus, onDelete, onQr }: LinkGridCardProps) {
  const [copied, setCopied] = useState(false);
  const baseUrl = window.location.origin;

  const copyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${baseUrl}/r/${link.shortCode}`);
    setCopied(true);
    toast.success("Copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const truncateUrl = (url: string, max = 40) => {
    try {
      const u = new URL(url);
      const path = u.pathname + u.search;
      const display = u.hostname + (path.length > 1 ? path : "");
      return display.length > max ? display.slice(0, max) + "..." : display;
    } catch {
      return url.length > max ? url.slice(0, max) + "..." : url;
    }
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <div
      onClick={onClick}
      className="group border rounded-lg p-4 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer bg-card"
    >
      {/* Short link + actions */}
      <div className="flex items-center justify-between mb-2">
        <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground">/r/{link.shortCode}</code>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {onQr && (
            <button onClick={onQr} className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <QrCode className="h-3 w-3" />
            </button>
          )}
          {onEdit && (
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <Pencil className="h-3 w-3" />
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors">
              <Trash2 className="h-3 w-3" />
            </button>
          )}
          <button onClick={copyLink} className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Title & destination */}
      {link.title && (
        <p className="text-sm font-medium truncate mb-0.5">{link.title}</p>
      )}
      <p className="text-xs text-muted-foreground truncate mb-2 flex items-center gap-1">
        <ExternalLink className="h-3 w-3 shrink-0" />
        {truncateUrl(link.destinationUrl)}
      </p>

      {/* Tags */}
      {link.tags && link.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {link.tags.slice(0, 3).map(tag => (
            <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>
          ))}
          {link.tags.length > 3 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">+{link.tags.length - 3}</Badge>}
        </div>
      )}

      {/* UTM badges */}
      {(link.utmCampaign || link.utmSource) && !link.tags?.length && (
        <div className="flex flex-wrap gap-1 mb-2">
          {link.utmSource && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{link.utmSource}</Badge>}
          {link.utmCampaign && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{link.utmCampaign}</Badge>}
        </div>
      )}

      {/* Sparkline */}
      <div className="mb-2">
        <MiniSparkline data={sparklineData || []} />
      </div>

      {/* Footer: clicks + status + date */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <MousePointerClick className="h-3.5 w-3.5 text-primary" />
          {link.clickCount.toLocaleString()}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground" title={link.updatedAt && new Date(link.updatedAt).getTime() - new Date(link.createdAt).getTime() > 60000 ? `Updated ${formatDate(link.updatedAt)}` : undefined}>
            {link.updatedAt && new Date(link.updatedAt).getTime() - new Date(link.createdAt).getTime() > 60000 ? `✏️ ${formatDate(link.updatedAt)}` : formatDate(link.createdAt)}
          </span>
          <button
            onClick={onToggleStatus}
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
              link.status === "active" 
                ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100" 
                : "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 hover:bg-yellow-100"
            }`}
          >
            {link.status}
          </button>
        </div>
      </div>
    </div>
  );
}
