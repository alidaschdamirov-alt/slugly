// Country code to flag emoji mapping
const COUNTRY_CODES: Record<string, string> = {
  "United States": "US", "United Kingdom": "GB", "Germany": "DE", "France": "FR",
  "Canada": "CA", "Australia": "AU", "Japan": "JP", "China": "CN", "India": "IN",
  "Brazil": "BR", "Russia": "RU", "South Korea": "KR", "Mexico": "MX", "Spain": "ES",
  "Italy": "IT", "Netherlands": "NL", "Sweden": "SE", "Norway": "NO", "Denmark": "DK",
  "Finland": "FI", "Poland": "PL", "Turkey": "TR", "Indonesia": "ID", "Thailand": "TH",
  "Vietnam": "VN", "Philippines": "PH", "Malaysia": "MY", "Singapore": "SG",
  "Argentina": "AR", "Colombia": "CO", "Chile": "CL", "Peru": "PE", "Egypt": "EG",
  "Nigeria": "NG", "South Africa": "ZA", "Kenya": "KE", "Israel": "IL", "UAE": "AE",
  "Saudi Arabia": "SA", "Pakistan": "PK", "Bangladesh": "BD", "Ukraine": "UA",
  "Czech Republic": "CZ", "Romania": "RO", "Hungary": "HU", "Portugal": "PT",
  "Belgium": "BE", "Switzerland": "CH", "Austria": "AT", "Ireland": "IE",
  "New Zealand": "NZ", "Taiwan": "TW", "Hong Kong": "HK",
};

export function getCountryFlag(countryName: string): string {
  const code = COUNTRY_CODES[countryName] || countryName;
  if (code.length === 2) {
    // Convert country code to flag emoji
    return String.fromCodePoint(
      ...code.toUpperCase().split("").map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
    );
  }
  return "🌍";
}

export function getCountryCode(countryName: string): string {
  return COUNTRY_CODES[countryName] || countryName;
}

// Browser icon SVG paths (inline for performance)
export function getBrowserIcon(browser: string): { name: string; color: string } {
  const b = browser.toLowerCase();
  if (b.includes("chrome")) return { name: "Chrome", color: "#4285F4" };
  if (b.includes("safari")) return { name: "Safari", color: "#006CFF" };
  if (b.includes("firefox")) return { name: "Firefox", color: "#FF7139" };
  if (b.includes("edge")) return { name: "Edge", color: "#0078D7" };
  if (b.includes("opera")) return { name: "Opera", color: "#FF1B2D" };
  if (b.includes("samsung")) return { name: "Samsung", color: "#1428A0" };
  if (b.includes("brave")) return { name: "Brave", color: "#FB542B" };
  if (b.includes("vivaldi")) return { name: "Vivaldi", color: "#EF3939" };
  return { name: browser || "Unknown", color: "#6B7280" };
}

// Device type icons
export function getDeviceIcon(device: string): { emoji: string; label: string } {
  const d = device.toLowerCase();
  if (d.includes("mobile") || d.includes("phone")) return { emoji: "📱", label: "Mobile" };
  if (d.includes("tablet")) return { emoji: "📟", label: "Tablet" };
  if (d.includes("desktop") || d.includes("pc")) return { emoji: "🖥️", label: "Desktop" };
  if (d.includes("tv") || d.includes("smart")) return { emoji: "📺", label: "TV" };
  if (d.includes("bot") || d.includes("crawler")) return { emoji: "🤖", label: "Bot" };
  return { emoji: "💻", label: device || "Unknown" };
}
