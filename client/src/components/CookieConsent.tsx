import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { getConsentStatus, setAnalyticsConsent } from "@/lib/analytics";

export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const status = getConsentStatus();
    if (status === null) {
      // Small delay so it doesn't flash on page load
      const timer = setTimeout(() => setShow(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const accept = () => {
    setAnalyticsConsent(true);
    setShow(false);
  };

  const decline = () => {
    setAnalyticsConsent(false);
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-in slide-in-from-bottom-4 duration-300">
      <div className="max-w-lg mx-auto bg-card border rounded-xl shadow-lg p-4">
        <p className="text-sm text-muted-foreground mb-3">
          We use cookies for authentication and analytics to improve your experience. Read our{" "}
          <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link> for details.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={decline}>
            Essential Only
          </Button>
          <Button size="sm" onClick={accept}>
            Accept All
          </Button>
        </div>
      </div>
    </div>
  );
}
