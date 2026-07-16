import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState } from "react";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Country name to ISO numeric mapping for the topojson
const COUNTRY_NAME_TO_ID: Record<string, string> = {
  "United States": "840", "United Kingdom": "826", "Germany": "276", "France": "250",
  "Canada": "124", "Australia": "036", "Japan": "392", "China": "156", "India": "356",
  "Brazil": "076", "Russia": "643", "South Korea": "410", "Mexico": "484", "Spain": "724",
  "Italy": "380", "Netherlands": "528", "Sweden": "752", "Norway": "578", "Denmark": "208",
  "Finland": "246", "Poland": "616", "Turkey": "792", "Indonesia": "360", "Thailand": "764",
  "Vietnam": "704", "Philippines": "608", "Malaysia": "458", "Singapore": "702",
  "Argentina": "032", "Colombia": "170", "Chile": "152", "Peru": "604", "Egypt": "818",
  "Nigeria": "566", "South Africa": "710", "Kenya": "404", "Israel": "376", "UAE": "784",
  "Saudi Arabia": "682", "Pakistan": "586", "Bangladesh": "050", "Ukraine": "804",
  "Czech Republic": "203", "Romania": "642", "Hungary": "348", "Portugal": "620",
  "Belgium": "056", "Switzerland": "756", "Austria": "040", "Ireland": "372",
  "New Zealand": "554", "Taiwan": "158", "Hong Kong": "344",
};

interface WorldMapProps {
  countries: { value: string | null; count: number }[];
}

export default function WorldMap({ countries }: WorldMapProps) {
  const [tooltipContent, setTooltipContent] = useState("");

  // Build a map of country numeric ID -> count
  const countMap = new Map<string, number>();
  let maxCount = 1;
  countries.forEach(c => {
    if (!c.value) return;
    const id = COUNTRY_NAME_TO_ID[c.value];
    if (id) {
      countMap.set(id, c.count);
      if (c.count > maxCount) maxCount = c.count;
    }
  });

  const getColor = (id: string) => {
    const count = countMap.get(id);
    if (!count) return "var(--color-muted)";
    const intensity = Math.max(0.15, count / maxCount);
    return `oklch(0.55 ${0.22 * intensity} 270 / ${0.3 + intensity * 0.7})`;
  };

  if (countries.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        No geographic data available
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ aspectRatio: "2/1" }}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 120, center: [0, 30] }}
        className="w-full h-full"
      >
        <ZoomableGroup>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const id = geo.id;
                const count = countMap.get(id);
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={getColor(id)}
                    stroke="var(--color-border)"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: "none" },
                      hover: { outline: "none", fill: count ? "oklch(0.55 0.22 270)" : "var(--color-accent)" },
                      pressed: { outline: "none" },
                    }}
                    onMouseEnter={() => {
                      const name = geo.properties.name;
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
      {tooltipContent && (
        <div className="absolute top-2 right-2 bg-popover text-popover-foreground border rounded-md px-2 py-1 text-xs shadow-sm">
          {tooltipContent}
        </div>
      )}
    </div>
  );
}
