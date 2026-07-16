/**
 * Report Renderer — generates branded HTML reports and attempts PDF conversion.
 * The HTML renderer avoids requiring headless Chromium in production.
 * We use jsPDF as a lightweight fallback, but the primary deliverable is a
 * beautifully styled HTML page that can be printed to PDF via browser.
 */

import type { ReportData } from "./workspace";
import type { WorkspaceBranding } from "./workspace";

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function generateSvgLineChart(data: { day: string; clicks: number }[], color: string, width = 700, height = 200): string {
  if (data.length === 0) return `<div style="text-align:center;color:#999;padding:40px;">No data for this period</div>`;
  
  const maxClicks = Math.max(...data.map(d => d.clicks), 1);
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  
  const points = data.map((d, i) => {
    const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartW;
    const y = padding.top + chartH - (d.clicks / maxClicks) * chartH;
    return `${x},${y}`;
  }).join(" ");

  // Area fill
  const areaPoints = `${padding.left},${padding.top + chartH} ${points} ${padding.left + chartW},${padding.top + chartH}`;

  // Y-axis labels
  const yLabels = [0, Math.round(maxClicks / 2), maxClicks].map((val, i) => {
    const y = padding.top + chartH - (val / maxClicks) * chartH;
    return `<text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#666">${formatNumber(val)}</text>
      <line x1="${padding.left}" y1="${y}" x2="${padding.left + chartW}" y2="${y}" stroke="#eee" stroke-width="1"/>`;
  }).join("");

  // X-axis labels (show ~5 labels)
  const step = Math.max(1, Math.floor(data.length / 5));
  const xLabels = data.filter((_, i) => i % step === 0 || i === data.length - 1).map((d, idx) => {
    const i = data.indexOf(d);
    const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartW;
    return `<text x="${x}" y="${padding.top + chartH + 20}" text-anchor="middle" font-size="10" fill="#666">${d.day.slice(5)}</text>`;
  }).join("");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;">
    ${yLabels}
    ${xLabels}
    <polygon points="${areaPoints}" fill="${color}" opacity="0.08"/>
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function generateSvgBarChart(data: { label: string; value: number }[], color: string, width = 700, height = 200): string {
  if (data.length === 0) return `<div style="text-align:center;color:#999;padding:40px;">No data</div>`;
  
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barWidth = Math.min(50, (width - 80) / data.length - 8);
  const padding = { top: 20, right: 20, bottom: 50, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const bars = data.slice(0, 10).map((d, i) => {
    const barH = (d.value / maxVal) * chartH;
    const x = padding.left + (i / data.length) * chartW + barWidth * 0.3;
    const y = padding.top + chartH - barH;
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" fill="${color}" rx="3"/>
      <text x="${x + barWidth / 2}" y="${padding.top + chartH + 16}" text-anchor="middle" font-size="9" fill="#666">${escapeHtml(d.label.slice(0, 12))}</text>
      <text x="${x + barWidth / 2}" y="${y - 5}" text-anchor="middle" font-size="9" fill="#333">${formatNumber(d.value)}</text>`;
  }).join("");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;">
    <line x1="${padding.left}" y1="${padding.top + chartH}" x2="${padding.left + chartW}" y2="${padding.top + chartH}" stroke="#ddd" stroke-width="1"/>
    ${bars}
  </svg>`;
}

export function renderReportHtml(data: ReportData, branding: WorkspaceBranding): string {
  const color = branding.brandColor || "#6366f1";
  const companyName = branding.companyName || "Analytics Report";
  const logoHtml = branding.logoUrl
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="Logo" style="height:40px;max-width:180px;object-fit:contain;" />`
    : `<div style="width:40px;height:40px;border-radius:8px;background:${color};"></div>`;

  const footerInfo = [branding.contactEmail, branding.website].filter(Boolean).join(" • ");

  const timeChart = generateSvgLineChart(data.timeSeries, color);
  const channelChart = generateSvgBarChart(
    data.channels.map(c => ({ label: c.source, value: c.clicks })),
    color
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(data.title)} — ${escapeHtml(companyName)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    :root {
      --brand: ${color};
      --brand-light: ${color}15;
      --text: #1a1a2e;
      --text-secondary: #64748b;
      --bg: #ffffff;
      --surface: #f8fafc;
      --border: #e2e8f0;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      color: var(--text);
      background: var(--bg);
      line-height: 1.6;
      font-size: 14px;
    }
    
    @media print {
      body { font-size: 12px; }
      .page-break { page-break-before: always; }
      .no-print { display: none; }
    }
    
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 48px 40px;
    }
    
    /* Header */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 24px;
      border-bottom: 3px solid var(--brand);
      margin-bottom: 32px;
    }
    .header-left { display: flex; align-items: center; gap: 16px; }
    .header-title { font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
    .header-date { font-size: 11px; color: var(--text-secondary); text-align: right; }
    
    /* Report Title */
    .report-title {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 4px;
      color: var(--text);
    }
    .report-subtitle {
      font-size: 14px;
      color: var(--text-secondary);
      margin-bottom: 32px;
    }
    
    /* Metric Cards */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 40px;
    }
    .metric-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      text-align: center;
    }
    .metric-value {
      font-size: 28px;
      font-weight: 700;
      color: var(--brand);
      line-height: 1.2;
    }
    .metric-label {
      font-size: 11px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-top: 4px;
    }
    
    /* Sections */
    .section {
      margin-bottom: 40px;
    }
    .section-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
    }
    
    /* Charts */
    .chart-container {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    
    /* Tables */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .data-table th {
      text-align: left;
      padding: 10px 12px;
      background: var(--surface);
      border-bottom: 2px solid var(--border);
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-secondary);
    }
    .data-table td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
    }
    .data-table tr:last-child td { border-bottom: none; }
    .data-table .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; }
    .data-table .url { 
      max-width: 300px; 
      overflow: hidden; 
      text-overflow: ellipsis; 
      white-space: nowrap; 
      color: var(--text-secondary);
      font-size: 12px;
    }
    
    /* Footer */
    .footer {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: var(--text-secondary);
    }
    .footer-brand { display: flex; align-items: center; gap: 8px; }
    
    /* Download button (non-print) */
    .download-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: var(--brand);
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 100;
    }
    .download-btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="header-left">
        ${logoHtml}
        <div>
          <div style="font-weight:600;font-size:14px;">${escapeHtml(companyName)}</div>
          <div class="header-title">Performance Report</div>
        </div>
      </div>
      <div class="header-date">
        <div>Generated: ${new Date(data.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
        <div>Period: ${data.period.from} to ${data.period.to}</div>
      </div>
    </div>
    
    <!-- Title -->
    <h1 class="report-title">${escapeHtml(data.title)}</h1>
    <p class="report-subtitle">${data.period.days}-day performance overview • ${formatNumber(data.summary.linkCount)} links tracked</p>
    
    <!-- Summary Metrics -->
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-value">${formatNumber(data.summary.totalClicks)}</div>
        <div class="metric-label">Total Clicks</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${formatNumber(data.summary.uniqueClicks)}</div>
        <div class="metric-label">Unique Clicks</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${formatNumber(data.summary.linkCount)}</div>
        <div class="metric-label">Active Links</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${data.summary.topLink ? escapeHtml(data.summary.topLink.shortCode) : "—"}</div>
        <div class="metric-label">Top Link</div>
      </div>
    </div>
    
    <!-- Clicks Over Time -->
    <div class="section">
      <h2 class="section-title">Clicks Over Time</h2>
      <div class="chart-container">
        ${timeChart}
      </div>
    </div>
    
    <!-- Channel Breakdown -->
    ${data.channels.length > 0 ? `
    <div class="section page-break">
      <h2 class="section-title">Channel Breakdown</h2>
      <div class="chart-container">
        ${channelChart}
      </div>
      <table class="data-table">
        <thead><tr><th>Source</th><th>Medium</th><th class="num">Clicks</th><th class="num">Share</th></tr></thead>
        <tbody>
          ${data.channels.map(c => `<tr><td>${escapeHtml(c.source)}</td><td>${escapeHtml(c.medium)}</td><td class="num">${formatNumber(c.clicks)}</td><td class="num">${c.share}%</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
    ` : ""}
    
    <!-- Top Links -->
    ${data.topLinks.length > 0 ? `
    <div class="section page-break">
      <h2 class="section-title">Top Performing Links</h2>
      <table class="data-table">
        <thead><tr><th>Short Code</th><th>Destination</th><th class="num">Clicks</th><th class="num">Unique</th></tr></thead>
        <tbody>
          ${data.topLinks.map(l => `<tr><td><strong>${escapeHtml(l.shortCode)}</strong></td><td class="url">${escapeHtml(l.destinationUrl)}</td><td class="num">${formatNumber(l.clicks)}</td><td class="num">${formatNumber(l.uniqueClicks)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
    ` : ""}
    
    <!-- Geography & Devices -->
    <div class="section page-break">
      <h2 class="section-title">Audience Breakdown</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
        ${data.topCountries.length > 0 ? `
        <div>
          <h3 style="font-size:13px;font-weight:600;margin-bottom:8px;">Top Countries</h3>
          <table class="data-table">
            <thead><tr><th>Country</th><th class="num">Clicks</th></tr></thead>
            <tbody>
              ${data.topCountries.map(c => `<tr><td>${escapeHtml(c.country)}</td><td class="num">${formatNumber(c.clicks)}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
        ` : ""}
        ${data.topDevices.length > 0 ? `
        <div>
          <h3 style="font-size:13px;font-weight:600;margin-bottom:8px;">Devices</h3>
          <table class="data-table">
            <thead><tr><th>Device</th><th class="num">Clicks</th></tr></thead>
            <tbody>
              ${data.topDevices.map(d => `<tr><td>${escapeHtml(d.device)}</td><td class="num">${formatNumber(d.clicks)}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
        ` : ""}
      </div>
    </div>
    
    <!-- Referrers -->
    ${data.topReferrers.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Top Referrers</h2>
      <table class="data-table">
        <thead><tr><th>Referrer</th><th class="num">Clicks</th></tr></thead>
        <tbody>
          ${data.topReferrers.map(r => `<tr><td>${escapeHtml(r.referrer)}</td><td class="num">${formatNumber(r.clicks)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
    ` : ""}
    
    <!-- Footer -->
    <div class="footer">
      <div class="footer-brand">
        ${logoHtml}
        <span>${escapeHtml(companyName)}</span>
      </div>
      <div>${footerInfo ? escapeHtml(footerInfo) : ""}</div>
    </div>
  </div>
  
  <!-- Download PDF button (browser print) -->
  <button class="download-btn no-print" onclick="window.print()">⬇ Download as PDF</button>
</body>
</html>`;
}

/**
 * Attempt server-side PDF generation.
 * Headless Chromium is intentionally not required by this deployment.
 * We attempt to use jsPDF as a lightweight alternative, but for complex HTML
 * reports the best approach is the HTML page with browser print.
 * Returns null if PDF generation is not possible.
 */
export async function generatePdf(html: string): Promise<Buffer | null> {
  // Attempt 1: Try html-pdf-node (uses Puppeteer internally)
  try {
    // Dynamic import to avoid build-time dependency
    const htmlPdf = await (Function('return import("html-pdf-node")')() as Promise<any>);
    const file = { content: html };
    const options = { format: "A4", margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" } };
    const pdfBuffer = await htmlPdf.generatePdf(file, options);
    return Buffer.from(pdfBuffer);
  } catch {
    // html-pdf-node not available or Puppeteer not installed
  }

  // Attempt 2: Try @react-pdf/renderer or similar — not applicable for arbitrary HTML

  // If nothing works, return null — the HTML report is the deliverable
  return null;
}
