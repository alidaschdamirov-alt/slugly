import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode } from "lucide-react";

interface InlineQrCodeProps {
  url: string;
  className?: string;
  imageClassName?: string;
}

export default function InlineQrCode({ url, className = "", imageClassName = "" }: InlineQrCodeProps) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    let active = true;
    if (!url) {
      setDataUrl("");
      return;
    }

    QRCode.toDataURL(url, {
      width: 160,
      margin: 1,
      color: { dark: "#14152B", light: "#FFFFFF" },
      errorCorrectionLevel: "M",
    })
      .then((generated) => {
        if (active) setDataUrl(generated);
      })
      .catch(() => {
        if (active) setDataUrl("");
      });

    return () => {
      active = false;
    };
  }, [url]);

  return (
    <div className={className}>
      {dataUrl ? (
        <img src={dataUrl} alt="QR Code" className={imageClassName || "h-full w-full"} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <QrCode className="h-5 w-5" />
        </div>
      )}
    </div>
  );
}
