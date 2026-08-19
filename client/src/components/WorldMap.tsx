import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { useMemo, useState } from "react";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

type CountryRow = { value: string | null; count: number };
type CountryMeta = {
  id: string;
  code: string;
  name: string;
  x: number;
  y: number;
  aliases?: string[];
};

// Numeric ISO IDs are used by world-atlas. x/y are approximate map positions for
// visible click markers, so users still see activity even if topojson names differ.
const COUNTRY_META: CountryMeta[] = [
  { code: "AZ", id: "031", name: "Azerbaijan", x: 57, y: 43, aliases: ["azerbaijan republic"] },
  { code: "US", id: "840", name: "United States", x: 21, y: 40, aliases: ["usa", "u.s.", "u.s.a.", "united states of america", "america"] },
  { code: "GB", id: "826", name: "United Kingdom", x: 46, y: 34, aliases: ["uk", "great britain", "england"] },
  { code: "DE", id: "276", name: "Germany", x: 50, y: 36 },
  { code: "FR", id: "250", name: "France", x: 48, y: 39 },
  { code: "CA", id: "124", name: "Canada", x: 18, y: 27 },
  { code: "AU", id: "036", name: "Australia", x: 82, y: 72 },
  { code: "JP", id: "392", name: "Japan", x: 84, y: 44 },
  { code: "CN", id: "156", name: "China", x: 74, y: 47 },
  { code: "IN", id: "356", name: "India", x: 69, y: 55 },
  { code: "BR", id: "076", name: "Brazil", x: 35, y: 68 },
  { code: "RU", id: "643", name: "Russia", x: 68, y: 30, aliases: ["russian federation"] },
  { code: "KR", id: "410", name: "South Korea", x: 80, y: 46, aliases: ["korea, republic of", "republic of korea"] },
  { code: "MX", id: "484", name: "Mexico", x: 22, y: 52 },
  { code: "ES", id: "724", name: "Spain", x: 47, y: 43 },
  { code: "IT", id: "380", name: "Italy", x: 51, y: 43 },
  { code: "NL", id: "528", name: "Netherlands", x: 49, y: 36 },
  { code: "SE", id: "752", name: "Sweden", x: 52, y: 29 },
  { code: "NO", id: "578", name: "Norway", x: 50, y: 27 },
  { code: "DK", id: "208", name: "Denmark", x: 51, y: 34 },
  { code: "FI", id: "246", name: "Finland", x: 55, y: 28 },
  { code: "PL", id: "616", name: "Poland", x: 53, y: 37 },
  { code: "TR", id: "792", name: "Turkey", x: 56, y: 45, aliases: ["turkiye", "türkiye"] },
  { code: "ID", id: "360", name: "Indonesia", x: 77, y: 66 },
  { code: "TH", id: "764", name: "Thailand", x: 74, y: 58 },
  { code: "VN", id: "704", name: "Vietnam", x: 76, y: 58 },
  { code: "PH", id: "608", name: "Philippines", x: 80, y: 59 },
  { code: "MY", id: "458", name: "Malaysia", x: 76, y: 63 },
  { code: "SG", id: "702", name: "Singapore", x: 76, y: 64 },
  { code: "AR", id: "032", name: "Argentina", x: 34, y: 82 },
  { code: "CO", id: "170", name: "Colombia", x: 30, y: 61 },
  { code: "CL", id: "152", name: "Chile", x: 31, y: 81 },
  { code: "PE", id: "604", name: "Peru", x: 29, y: 69 },
  { code: "EG", id: "818", name: "Egypt", x: 55, y: 52 },
  { code: "NG", id: "566", name: "Nigeria", x: 50, y: 62 },
  { code: "ZA", id: "710", name: "South Africa", x: 54, y: 80 },
  { code: "KE", id: "404", name: "Kenya", x: 59, y: 66 },
  { code: "IL", id: "376", name: "Israel", x: 56, y: 50 },
  { code: "AE", id: "784", name: "United Arab Emirates", x: 62, y: 52, aliases: ["uae", "u.a.e."] },
  { code: "SA", id: "682", name: "Saudi Arabia", x: 59, y: 53 },
  { code: "QA", id: "634", name: "Qatar", x: 61, y: 53 },
  { code: "KW", id: "414", name: "Kuwait", x: 60, y: 51 },
  { code: "BH", id: "048", name: "Bahrain", x: 61, y: 52 },
  { code: "OM", id: "512", name: "Oman", x: 63, y: 54 },
  { code: "PK", id: "586", name: "Pakistan", x: 65, y: 52 },
  { code: "BD", id: "050", name: "Bangladesh", x: 72, y: 55 },
  { code: "UA", id: "804", name: "Ukraine", x: 55, y: 39 },
  { code: "CZ", id: "203", name: "Czech Republic", x: 52, y: 38, aliases: ["czechia"] },
  { code: "RO", id: "642", name: "Romania", x: 54, y: 41 },
  { code: "HU", id: "348", name: "Hungary", x: 53, y: 40 },
  { code: "PT", id: "620", name: "Portugal", x: 46, y: 43 },
  { code: "BE", id: "056", name: "Belgium", x: 49, y: 37 },
  { code: "CH", id: "756", name: "Switzerland", x: 50, y: 40 },
  { code: "AT", id: "040", name: "Austria", x: 52, y: 40 },
  { code: "IE", id: "372", name: "Ireland", x: 44, y: 35 },
  { code: "NZ", id: "554", name: "New Zealand", x: 89, y: 80 },
  { code: "TW", id: "158", name: "Taiwan", x: 79, y: 52 },
  { code: "HK", id: "344", name: "Hong Kong", x: 77, y: 53 },
  { code: "GE", id: "268", name: "Georgia", x: 57, y: 43 },
  { code: "AM", id: "051", name: "Armenia", x: 58, y: 44 },
  { code: "KZ", id: "398", name: "Kazakhstan", x: 64, y: 39 },
  { code: "UZ", id: "860", name: "Uzbekistan", x: 63, y: 45 },
  { code: "KG", id: "417", name: "Kyrgyzstan", x: 66, y: 45 },
  { code: "TJ", id: "762", name: "Tajikistan", x: 66, y: 47 },
  { code: "TM", id: "795", name: "Turkmenistan", x: 62, y: 47 },
  { code: "IR", id: "364", name: "Iran", x: 61, y: 49, aliases: ["iran, islamic republic of"] },
  { code: "IQ", id: "368", name: "Iraq", x: 58, y: 49 },
  { code: "GR", id: "300", name: "Greece", x: 53, y: 45 },
  { code: "CY", id: "196", name: "Cyprus", x: 55, y: 47 },
  { code: "MA", id: "504", name: "Morocco", x: 45, y: 51 },
  { code: "TN", id: "788", name: "Tunisia", x: 50, y: 49 },
  { code: "DZ", id: "012", name: "Algeria", x: 49, y: 53 },
  { code: "ET", id: "231", name: "Ethiopia", x: 58, y: 62 },
  { code: "GH", id: "288", name: "Ghana", x: 48, y: 63 },
];

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[._]/g, "").replace(/\s+/g, " ");
}

function normalizeNumericId(id: string | number | undefined) {
  if (id === undefined || id === null) return "";
  const raw = String(id).trim();
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? String(numeric) : raw;
}

const COUNTRY_INDEX = (() => {
  const index = new Map<string, CountryMeta>();
  for (const country of COUNTRY_META) {
    index.set(normalizeKey(country.code), country);
    index.set(normalizeKey(country.name), country);
    index.set(normalizeNumericId(country.id), country);
    for (const alias of country.aliases || []) {
      index.set(normalizeKey(alias), country);
    }
  }
  return index;
})();

function getDisplayName(value: string) {
  const trimmed = value.trim();
  const meta = COUNTRY_INDEX.get(normalizeKey(trimmed)) || COUNTRY_INDEX.get(normalizeNumericId(trimmed));
  if (meta) return meta.name;
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    try {
      const displayNames = new (Intl as any).DisplayNames(["en"], { type: "region" });
      return displayNames.of(trimmed.toUpperCase()) || trimmed.toUpperCase();
    } catch {
      return trimmed.toUpperCase();
    }
  }
  return trimmed;
}

function getCountryMeta(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "unknown") return null;
  return COUNTRY_INDEX.get(normalizeKey(trimmed)) || COUNTRY_INDEX.get(normalizeNumericId(trimmed)) || null;
}

function getMarkerSize(count: number, maxCount: number) {
  const ratio = Math.max(0.18, count / Math.max(maxCount, 1));
  return Math.round(10 + ratio * 18);
}

interface WorldMapProps {
  countries: CountryRow[];
}

export default function WorldMap({ countries }: WorldMapProps) {
  const [tooltipContent, setTooltipContent] = useState("");

  const stats = useMemo(() => {
    const countById = new Map<string, number>();
    const displayRows = countries
      .filter(row => row.value && row.count > 0)
      .map(row => {
        const meta = getCountryMeta(row.value);
        return {
          ...row,
          meta,
          label: getDisplayName(row.value || "Unknown"),
        };
      })
      .sort((a, b) => b.count - a.count);

    let maxCount = 1;
    for (const row of displayRows) {
      maxCount = Math.max(maxCount, row.count);
      if (row.meta) {
        countById.set(normalizeNumericId(row.meta.id), row.count);
      }
    }

    return { displayRows, maxCount, countById };
  }, [countries]);

  const getColor = (geoId: string | number | undefined) => {
    const count = stats.countById.get(normalizeNumericId(geoId));
    if (!count) return "hsl(var(--muted))";
    const intensity = Math.max(0.2, count / stats.maxCount);
    return `oklch(0.56 ${0.14 + 0.08 * intensity} 270 / ${0.35 + intensity * 0.55})`;
  };

  if (countries.length === 0 || stats.displayRows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        No geographic data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative h-[220px] w-full overflow-hidden rounded-xl border bg-muted/20 sm:h-[250px]">
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 115, center: [10, 25] }}
          className="h-full w-full"
        >
          <ZoomableGroup zoom={1} center={[10, 25]}>
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const id = normalizeNumericId(geo.id);
                  const count = stats.countById.get(id);
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={getColor(geo.id)}
                      stroke="hsl(var(--border))"
                      strokeWidth={0.45}
                      style={{
                        default: { outline: "none" },
                        hover: {
                          outline: "none",
                          fill: count ? "oklch(0.56 0.22 270)" : "hsl(var(--accent))",
                        },
                        pressed: { outline: "none" },
                      }}
                      onMouseEnter={() => {
                        const name = geo.properties?.name || "Country";
                        setTooltipContent(count ? `${name}: ${count} clicks` : name);
                      }}
                      onMouseLeave={() => setTooltipContent("")}
                    />
                  );
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>

        {stats.displayRows
          .filter(row => row.meta)
          .slice(0, 12)
          .map(row => {
            const size = getMarkerSize(row.count, stats.maxCount);
            return (
              <button
                key={`${row.label}-${row.count}`}
                type="button"
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary/80 shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary"
                style={{
                  left: `${row.meta!.x}%`,
                  top: `${row.meta!.y}%`,
                  width: size,
                  height: size,
                }}
                onMouseEnter={() => setTooltipContent(`${row.label}: ${row.count} clicks`)}
                onMouseLeave={() => setTooltipContent("")}
                aria-label={`${row.label}: ${row.count} clicks`}
              />
            );
          })}

        {tooltipContent && (
          <div className="absolute right-3 top-3 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-sm">
            {tooltipContent}
          </div>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {stats.displayRows.slice(0, 6).map(row => {
          const pct = Math.round((row.count / stats.maxCount) * 100);
          return (
            <div key={row.label} className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-medium">{row.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{row.count}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
