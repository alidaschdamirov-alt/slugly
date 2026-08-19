import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { useMemo, useState } from "react";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const DEFAULT_CENTER: [number, number] = [10, 25];
const MAP_NO_DATA_FILL = "#EEF0F4";
const MAP_NO_DATA_HOVER_FILL = "#E2E8F0";
const MAP_NO_DATA_STROKE = "#CBD5E1";
const MAP_ACTIVE_STROKE = "#5A3FF0";

type CountryRow = { value: string | null; count: number };
type CountryMeta = {
  id: string;
  code: string;
  name: string;
  x: number;
  y: number;
  aliases?: string[];
};

// Numeric ISO IDs are used by world-atlas. x/y are kept only as legacy
// display metadata; the map itself now highlights countries by fill.
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

const COUNTRY_CENTER: Record<string, [number, number]> = {
  AZ: [47.6, 40.3], US: [-98.6, 39.8], GB: [-2.5, 54.0], DE: [10.4, 51.2], FR: [2.2, 46.2],
  CA: [-106.3, 56.1], AU: [133.8, -25.3], JP: [138.3, 36.2], CN: [104.2, 35.9], IN: [78.9, 22.6],
  BR: [-51.9, -14.2], RU: [95.3, 61.5], KR: [127.8, 36.4], MX: [-102.6, 23.6], ES: [-3.7, 40.4],
  IT: [12.6, 42.8], NL: [5.3, 52.1], SE: [18.6, 60.1], NO: [8.5, 60.5], DK: [9.5, 56.3],
  FI: [25.7, 61.9], PL: [19.1, 52.1], TR: [35.2, 39.0], ID: [113.9, -0.8], TH: [100.9, 15.9],
  VN: [108.3, 14.1], PH: [122.9, 12.9], MY: [101.9, 4.2], SG: [103.8, 1.35], AR: [-63.6, -38.4],
  CO: [-74.3, 4.6], CL: [-71.5, -35.7], PE: [-75.0, -9.2], EG: [30.8, 26.8], NG: [8.7, 9.1],
  ZA: [24.0, -29.0], KE: [37.9, 0.0], IL: [34.9, 31.0], AE: [54.4, 24.4], SA: [45.1, 23.9],
  QA: [51.2, 25.3], KW: [47.5, 29.3], BH: [50.6, 26.1], OM: [57.0, 21.5], PK: [69.3, 30.4],
  BD: [90.4, 23.7], UA: [31.2, 48.4], CZ: [15.5, 49.8], RO: [24.9, 45.9], HU: [19.5, 47.2],
  PT: [-8.2, 39.4], BE: [4.5, 50.5], CH: [8.2, 46.8], AT: [14.6, 47.5], IE: [-8.2, 53.4],
  NZ: [172.8, -41.8], TW: [121.0, 23.7], HK: [114.2, 22.3], GE: [43.4, 42.3], AM: [45.0, 40.1],
  KZ: [66.9, 48.0], UZ: [64.6, 41.4], KG: [74.8, 41.2], TJ: [71.3, 38.9], TM: [59.6, 38.9],
  IR: [53.7, 32.4], IQ: [43.7, 33.2], GR: [21.8, 39.1], CY: [33.4, 35.1], MA: [-7.1, 31.8],
  TN: [9.5, 34.0], DZ: [1.7, 28.0], ET: [40.5, 9.1], GH: [-1.0, 7.9],
};

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

    const locatedRows = displayRows.filter(row => row.meta && COUNTRY_CENTER[row.meta.code]);
    let center: [number, number] = DEFAULT_CENTER;
    let zoom = 1;
    if (locatedRows.length > 0) {
      const total = locatedRows.reduce((sum, row) => sum + row.count, 0) || 1;
      const weightedLon = locatedRows.reduce((sum, row) => sum + COUNTRY_CENTER[row.meta!.code][0] * row.count, 0) / total;
      const weightedLat = locatedRows.reduce((sum, row) => sum + COUNTRY_CENTER[row.meta!.code][1] * row.count, 0) / total;
      const lons = locatedRows.map(row => COUNTRY_CENTER[row.meta!.code][0]);
      const lats = locatedRows.map(row => COUNTRY_CENTER[row.meta!.code][1]);
      const spread = Math.max(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats));
      center = [Math.max(-160, Math.min(170, weightedLon)), Math.max(-55, Math.min(70, weightedLat))];
      zoom = spread <= 8 ? 4.5 : spread <= 22 ? 3 : spread <= 55 ? 1.9 : 1.15;
    }

    return { displayRows, maxCount, countById, center, zoom };
  }, [countries]);

  const getColor = (geoId: string | number | undefined) => {
    const count = stats.countById.get(normalizeNumericId(geoId));
    if (count == null) return MAP_NO_DATA_FILL;
    const intensity = Math.max(0.18, count / stats.maxCount);
    const lightness = 0.88 - 0.28 * intensity;
    const chroma = 0.05 + 0.17 * intensity;
    return `oklch(${lightness} ${chroma} 270)`;
  };

  const hasRows = countries.length > 0 && stats.displayRows.length > 0;
  const focusedLabels = stats.displayRows.slice(0, 3).map(row => row.label).join(", ");

  return (
    <div className="space-y-4">
      <div className="relative h-[220px] w-full overflow-hidden rounded-xl border sm:h-[250px]" style={{ backgroundColor: "#F8FAFC" }}>
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 115, center: DEFAULT_CENTER }}
          className="h-full w-full"
        >
          <ZoomableGroup zoom={hasRows ? stats.zoom : 1} center={hasRows ? stats.center : DEFAULT_CENTER}>
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
                      stroke={count ? MAP_ACTIVE_STROKE : MAP_NO_DATA_STROKE}
                      strokeWidth={count ? 0.9 : 0.45}
                      style={{
                        default: { outline: "none" },
                        hover: {
                          outline: "none",
                          fill: count ? MAP_ACTIVE_STROKE : MAP_NO_DATA_HOVER_FILL,
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

        {hasRows ? (
          <div className="absolute bottom-3 left-3 rounded-md border bg-popover/90 px-2.5 py-1.5 text-xs text-popover-foreground shadow-sm backdrop-blur">
            Focus: {focusedLabels}
          </div>
        ) : (
          <div className="absolute bottom-3 left-3 rounded-md border bg-popover/90 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
            No geographic data yet
          </div>
        )}

        {tooltipContent && (
          <div className="absolute right-3 top-3 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-sm">
            {tooltipContent}
          </div>
        )}
      </div>

      {hasRows && (
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
      )}
    </div>
  );
}
