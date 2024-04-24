import type { AccountDiff, HtmlReportOptions, TransactionDiffReport } from "./types.js";
import { buildSemanticDiff } from "./semantic_diff.js";
import { buildLamportFlowGraph, topLamportReceivers, topLamportSenders } from "./lamport_tracker.js";
import { extractSplTokenDiffs, summarizeByMint } from "./spl_token_diff.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function severityClass(severity: string): string {
  switch (severity) {
    case "critical":
      return "severity_critical";
    case "warning":
      return "severity_warning";
    default:
      return "severity_info";
  }
}

function renderDiffRow(diff: AccountDiff, includeBytes: boolean): string {
  const fieldRows = diff.field_changes
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.field)}</td><td>${escapeHtml(c.before)}</td><td>${escapeHtml(c.after)}</td></tr>`,
    )
    .join("");

  const byteSection =
    includeBytes && diff.byte_changes.length > 0
      ? `<details><summary>${diff.byte_changes.length} byte change(s)</summary><pre>${escapeHtml(
          diff.byte_changes
            .map((b) => `@${b.offset} [${b.annotation}]\n  before: ${b.before_hex}\n  after:  ${b.after_hex}`)
            .join("\n\n"),
        )}</pre></details>`
      : "";

  return `
    <article class="account_card">
      <h3>${escapeHtml(diff.pubkey)}</h3>
      <p><span class="badge">${escapeHtml(diff.layout_kind)}</span></p>
      <p>Lamports: ${diff.lamports_before} &rarr; ${diff.lamports_after} (delta ${diff.lamports_delta})</p>
      ${diff.owner_changed ? `<p class="severity_critical">Owner changed: ${escapeHtml(diff.owner_before)} &rarr; ${escapeHtml(diff.owner_after)}</p>` : ""}
      ${fieldRows ? `<table><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>${fieldRows}</tbody></table>` : ""}
      ${byteSection}
    </article>`;
}

export function renderHtmlReport(report: TransactionDiffReport, options: HtmlReportOptions = {}): string {
  const title = options.title ?? "Account State Diff Report";
  const includeBytes = options.include_byte_diff ?? false;
  const darkMode = options.dark_mode ?? true;

  const semantic = buildSemanticDiff(report);
  const lamportGraph = buildLamportFlowGraph(report);
  const tokenDiffs = extractSplTokenDiffs(report);
  const mintSummaries = summarizeByMint(tokenDiffs);
  const topReceivers = topLamportReceivers(lamportGraph, 5);
  const topSenders = topLamportSenders(lamportGraph, 5);

  const semanticRows = semantic.changes
    .map(
      (c) =>
        `<tr class="${severityClass(c.severity)}"><td>${escapeHtml(c.kind)}</td><td>${escapeHtml(c.pubkey.slice(0, 12))}...</td><td>${escapeHtml(c.summary)}</td><td>${c.lamports_delta}</td></tr>`,
    )
    .join("");

  const mintRows = mintSummaries
    .map(
      (m) =>
        `<tr><td>${escapeHtml(m.mint.slice(0, 12))}...</td><td>${m.total_minted}</td><td>${m.total_burned}</td><td>${m.net_supply_change}</td><td>${m.accounts_affected}</td></tr>`,
    )
    .join("");

  const receiverRows = topReceivers
    .map((r) => `<li>${escapeHtml(r.pubkey.slice(0, 16))}... (+${r.net})</li>`)
    .join("");
  const senderRows = topSenders
    .map((s) => `<li>${escapeHtml(s.pubkey.slice(0, 16))}... (${s.net})</li>`)
    .join("");

  const accountCards = report.diffs.map((d) => renderDiffRow(d, includeBytes)).join("");

  const bg = darkMode ? "#0f1419" : "#ffffff";
  const fg = darkMode ? "#e7e9ea" : "#1a1a1a";
  const card = darkMode ? "#1a2332" : "#f5f5f5";
  const accent = "#1d9bf0";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: ${bg}; color: ${fg}; margin: 0; padding: 2rem; line-height: 1.5; }
    h1 { color: ${accent}; }
    .meta { background: ${card}; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; }
    .account_card { background: ${card}; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid ${darkMode ? "#38444d" : "#ddd"}; }
    .badge { background: ${accent}; color: #fff; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.85rem; }
    .severity_critical { color: #f4212e; }
    .severity_warning { color: #ffad1f; }
    .severity_info { color: ${fg}; }
    section { margin-bottom: 2rem; }
    pre { overflow-x: auto; font-size: 0.8rem; }
    ul { padding-left: 1.5rem; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">
    <p><strong>Signature:</strong> ${escapeHtml(report.signature)}</p>
    <p><strong>Slot:</strong> ${report.slot}</p>
    <p><strong>Block time:</strong> ${report.block_time ?? "unknown"}</p>
    <p><strong>Accounts changed:</strong> ${report.accounts_changed}</p>
    <p><strong>Total lamports moved:</strong> ${semantic.total_lamports_moved}</p>
  </div>

  <section>
    <h2>Semantic Changes</h2>
    <table>
      <thead><tr><th>Kind</th><th>Account</th><th>Summary</th><th>Lamports</th></tr></thead>
      <tbody>${semanticRows || "<tr><td colspan=\"4\">No semantic changes</td></tr>"}</tbody>
    </table>
  </section>

  <section>
    <h2>Token Summary</h2>
    <table>
      <thead><tr><th>Mint</th><th>Minted</th><th>Burned</th><th>Net</th><th>Accounts</th></tr></thead>
      <tbody>${mintRows || "<tr><td colspan=\"5\">No token changes</td></tr>"}</tbody>
    </table>
  </section>

  <section>
    <h2>Lamport Flow</h2>
    <p>Total moved: ${lamportGraph.total_moved}</p>
    <div style="display:flex;gap:2rem">
      <div><h3>Top receivers</h3><ul>${receiverRows || "<li>none</li>"}</ul></div>
      <div><h3>Top senders</h3><ul>${senderRows || "<li>none</li>"}</ul></div>
    </div>
  </section>

  <section>
    <h2>Account Details</h2>
    ${accountCards || "<p>No account diffs</p>"}
  </section>
</body>
</html>`;
}
