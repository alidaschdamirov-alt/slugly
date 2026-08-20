import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Copy, Check, AlertTriangle, Pencil } from "lucide-react";
import QRCode from "qrcode";

interface QrCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  title?: string;
  isBroken?: boolean;
  onEditDestination?: () => void;
}

export function QrCodeDialog({ open, onOpenChange, url, title, isBroken = false, onEditDestination }: QrCodeDialogProps) {
  const [copied, setCopied] = useState(false);
  const [svgData, setSvgData] = useState("");

  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    if (!open || !url) return;
    // Generate data URL for visible preview
    QRCode.toDataURL(url, {
      width: 280,
      margin: 2,
      color: { dark: "#14152B", light: "#FFFFFF" },
      errorCorrectionLevel: "M",
    }).then((dataUrl) => setDataUrl(dataUrl));
    // Generate SVG string for download
    QRCode.toString(url, {
      type: "svg",
      width: 400,
      margin: 2,
      color: { dark: "#14152B", light: "#FFFFFF" },
      errorCorrectionLevel: "M",
    }).then((svg) => setSvgData(svg));
  }, [open, url]);

  const downloadPng = () => {
    // Generate high-res PNG for download
    QRCode.toDataURL(url, {
      width: 1024,
      margin: 2,
      color: { dark: "#14152B", light: "#FFFFFF" },
      errorCorrectionLevel: "M",
    }).then((highResUrl) => {
      const link = document.createElement("a");
      link.download = `qr-${title || "slugly"}.png`;
      link.href = highResUrl;
      link.click();
    });
  };

  const downloadSvg = () => {
    if (!svgData) return;
    const blob = new Blob([svgData], { type: "image/svg+xml" });
    const link = document.createElement("a");
    link.download = `qr-${title || "slugly"}.svg`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const copyUrl = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>QR Code</DialogTitle>
          <DialogDescription>
            Scan this QR code to access the short link. Scans are counted as clicks.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          {isBroken && (
            <div className="w-full rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">This link&apos;s destination is unreachable.</p>
                  <p className="mt-1 text-xs opacity-90">
                    Anyone scanning this code will get an error. Fix the destination before printing or sharing.
                  </p>
                  {onEditDestination && (
                    <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onEditDestination}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Edit destination
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="bg-white p-3 sm:p-4 rounded-xl border border-border">
            {dataUrl ? (
              <img src={dataUrl} alt="QR Code" className="w-[200px] h-[200px] sm:w-[280px] sm:h-[280px]" />
            ) : (
              <div className="w-[200px] h-[200px] sm:w-[280px] sm:h-[280px] flex items-center justify-center text-muted-foreground">Generating...</div>
            )}
          </div>
          <div className="flex items-center gap-2 w-full min-w-0">
            <code className="flex-1 text-xs sm:text-sm bg-muted px-2 sm:px-3 py-2 rounded-md font-mono truncate min-w-0">
              {url}
            </code>
            <Button variant="outline" size="icon" onClick={copyUrl} className="flex-none h-8 w-8 sm:h-9 sm:w-9">
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex gap-3 w-full">
            <Button variant="outline" className="flex-1" onClick={downloadPng}>
              <Download className="h-4 w-4 mr-2" />
              PNG
            </Button>
            <Button variant="outline" className="flex-1" onClick={downloadSvg}>
              <Download className="h-4 w-4 mr-2" />
              SVG
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
