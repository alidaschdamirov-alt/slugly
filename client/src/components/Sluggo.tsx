import { useId } from "react";

type SluggoVariant = "wave" | "link" | "shield" | "oops" | "white";

export default function Sluggo({
  variant = "wave",
  className,
}: {
  variant?: SluggoVariant;
  className?: string;
}) {
  const gradientId = `sluggo-${useId().replace(/:/g, "")}`;

  if (variant === "oops") {
    return (
      <svg
        className={className}
        viewBox="0 0 200 180"
        role="img"
        aria-label="Sluggo could not find this page"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#6A4BFF" />
            <stop offset="1" stopColor="#5A3FF0" />
          </linearGradient>
        </defs>
        <ellipse
          cx="100"
          cy="158"
          rx="50"
          ry="8"
          fill="#5A3FF0"
          opacity="0.1"
        />
        <path
          d="M60 150 Q56 104 98 96 Q146 88 146 120 Q146 150 116 150 Z"
          fill={`url(#${gradientId})`}
        />
        <circle cx="120" cy="116" r="32" fill={`url(#${gradientId})`} />
        <line
          x1="112"
          y1="90"
          x2="106"
          y2="76"
          stroke="#5A3FF0"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <line
          x1="130"
          y1="90"
          x2="136"
          y2="76"
          stroke="#5A3FF0"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <circle cx="105" cy="73" r="6" fill="#5A3FF0" />
        <circle cx="137" cy="73" r="6" fill="#5A3FF0" />
        <path
          d="M111 116h9M130 116h9"
          stroke="#fff"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path
          d="M116 128q7-5 14 0"
          stroke="#fff"
          strokeWidth="3.2"
          strokeLinecap="round"
          fill="none"
        />
        <g
          stroke="#FF5A3C"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
          opacity="0.85"
        >
          <path d="M40 56a9 9 0 0 1 13 0l5 5" />
          <path d="M66 78a9 9 0 0 1-13 0l-5-5" />
        </g>
      </svg>
    );
  }

  const isWhite = variant === "white";
  const bodyFill = isWhite ? "#fff" : `url(#${gradientId})`;
  const faceStroke = isWhite ? "#5A3FF0" : "#fff";

  return (
    <svg
      className={className}
      viewBox="0 0 170 160"
      role="img"
      aria-label="Sluggo"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#6A4BFF" />
          <stop offset="1" stopColor="#5A3FF0" />
        </linearGradient>
      </defs>
      <ellipse
        cx="85"
        cy={isWhite ? "146" : "142"}
        rx={isWhite ? "44" : "46"}
        ry={isWhite ? "7" : "8"}
        fill={isWhite ? "#000" : "#5A3FF0"}
        opacity={isWhite ? "0.12" : "0.13"}
      />
      <path
        d="M48 136 Q44 84 84 76 Q132 66 132 104 Q132 136 104 136 Z"
        fill={bodyFill}
      />
      <circle cx="110" cy="98" r="31" fill={bodyFill} />
      <line
        x1="103"
        y1="72"
        x2="98"
        y2="57"
        stroke={isWhite ? "#fff" : "#5A3FF0"}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <line
        x1="119"
        y1="72"
        x2="124"
        y2="57"
        stroke={isWhite ? "#fff" : "#5A3FF0"}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <circle cx="97" cy="54" r="5.5" fill={isWhite ? "#fff" : "#5A3FF0"} />
      <circle cx="125" cy="54" r="5.5" fill={isWhite ? "#fff" : "#5A3FF0"} />

      {variant === "shield" ? (
        <>
          <circle cx="104" cy="98" r="4" fill="#fff" />
          <circle cx="122" cy="98" r="4" fill="#fff" />
          <circle cx="104" cy="99" r="2.2" fill="#14152B" />
          <circle cx="122" cy="99" r="2.2" fill="#14152B" />
          <path
            d="M104 112h16"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M48 70l22-7 22 7v16q0 18-22 27-22-9-22-27z"
            fill="#fff"
            stroke="#5A3FF0"
            strokeWidth="3"
          />
          <path
            d="M60 88l7 7 13-14"
            stroke="#1FB57A"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </>
      ) : variant === "link" ? (
        <>
          <circle cx="104" cy="98" r="4" fill="#fff" />
          <circle cx="122" cy="98" r="4" fill="#fff" />
          <circle cx="105" cy="99" r="2" fill="#14152B" />
          <circle cx="123" cy="99" r="2" fill="#14152B" />
          <path
            d="M104 110q9 7 18 0"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          <g
            stroke="#FF5A3C"
            strokeWidth="5.5"
            strokeLinecap="round"
            fill="none"
            transform="rotate(-25 56 70)"
          >
            <rect x="40" y="58" width="22" height="14" rx="7" />
            <rect x="56" y="58" width="22" height="14" rx="7" />
          </g>
          <path
            d="M62 100q-10-14-8-28"
            stroke="#5A3FF0"
            strokeWidth="7"
            strokeLinecap="round"
            fill="none"
          />
        </>
      ) : (
        <>
          <path
            d="M101 98q5-6 10 0M119 98q5-6 10 0"
            stroke={faceStroke}
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M104 110q11 11 23 0"
            stroke={faceStroke}
            strokeWidth="3.4"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M58 96q-16-6-22-20"
            stroke={isWhite ? "#fff" : "#5A3FF0"}
            strokeWidth="7"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="35" cy="74" r="6" fill="#FF5A3C" />
        </>
      )}
    </svg>
  );
}
