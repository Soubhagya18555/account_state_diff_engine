import type { AccountDiff, TransactionDiffReport } from "./types.js";

function serializeBigInt(value: bigint): string {
  return value.toString();
}

function serializeDiff(diff: AccountDiff): Record<string, unknown> {
  return {
    pubkey: diff.pubkey,
    layout_kind: diff.layout_kind,
    lamports_before: serializeBigInt(diff.lamports_before),
    lamports_after: serializeBigInt(diff.lamports_after),
    lamports_delta: serializeBigInt(diff.lamports_delta),
    owner_changed: diff.owner_changed,
    owner_before: diff.owner_before,
    owner_after: diff.owner_after,
    data_length_before: diff.data_length_before,
    data_length_after: diff.data_length_after,
    byte_changes: diff.byte_changes,
    field_changes: diff.field_changes,
    parsed_before: diff.parsed_before,
    parsed_after: diff.parsed_after,
  };
}

export function formatJsonReport(report: TransactionDiffReport): string {
  const payload = {
    signature: report.signature,
    slot: report.slot,
    block_time: report.block_time,
    rpc_url: report.rpc_url,
    accounts_changed: report.accounts_changed,
    diffs: report.diffs.map(serializeDiff),
  };
  return JSON.stringify(payload, null, 2);
}

export function formatHumanReport(report: TransactionDiffReport): string {
  const lines: string[] = [];
  lines.push("account_state_diff_engine report");
  lines.push("================================");
  lines.push(`signature: ${report.signature}`);
  lines.push(`slot: ${report.slot}`);
  lines.push(`block_time: ${report.block_time ?? "unknown"}`);
  lines.push(`rpc_url: ${report.rpc_url}`);
  lines.push(`accounts_changed: ${report.accounts_changed}`);
  lines.push("");

  if (report.diffs.length === 0) {
    lines.push("no account state changes detected");
    return lines.join("\n");
  }

  for (const diff of report.diffs) {
    lines.push(`account: ${diff.pubkey}`);
    lines.push(`  layout: ${diff.layout_kind}`);
    lines.push(
      `  lamports: ${diff.lamports_before} -> ${diff.lamports_after} (delta ${diff.lamports_delta})`,
    );

    if (diff.owner_changed) {
      lines.push(`  owner: ${diff.owner_before} -> ${diff.owner_after}`);
    }

    if (diff.data_length_before !== diff.data_length_after) {
      lines.push(
        `  data_length: ${diff.data_length_before} -> ${diff.data_length_after}`,
      );
    }

    if (diff.field_changes.length > 0) {
      lines.push("  field_changes:");
      for (const change of diff.field_changes) {
        lines.push(
          `    ${change.annotation}: ${change.before} -> ${change.after}`,
        );
      }
    }

    if (diff.byte_changes.length > 0) {
      lines.push("  byte_changes:");
      for (const change of diff.byte_changes) {
        lines.push(
          `    offset ${change.offset} len ${change.length} [${change.annotation}]`,
        );
        lines.push(`      before: ${change.before_hex}`);
        lines.push(`      after:  ${change.after_hex}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}
