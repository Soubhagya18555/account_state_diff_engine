import type {
  AccountDiff,
  SemanticChange,
  SemanticChangeKind,
  SemanticDiffReport,
  TransactionDiffReport,
} from "./types.js";

function classifyDiff(diff: AccountDiff): SemanticChange {
  const tokenBefore = diff.parsed_before?.token;
  const tokenAfter = diff.parsed_after?.token;
  let kind: SemanticChangeKind = "unknown";
  let summary = "account state modified";
  let tokenAmountDelta: bigint | null = null;
  let mint: string | null = null;
  let severity: SemanticChange["severity"] = "info";
  const related: string[] = [];

  if (diff.layout_kind === "token_account" && tokenBefore && tokenAfter) {
    mint = tokenAfter.mint;
    tokenAmountDelta = tokenAfter.amount - tokenBefore.amount;

    if (tokenBefore.state !== "frozen" && tokenAfter.state === "frozen") {
      kind = "freeze_thaw";
      summary = "token account frozen";
      severity = "warning";
    } else if (tokenBefore.state === "frozen" && tokenAfter.state !== "frozen") {
      kind = "freeze_thaw";
      summary = "token account thawed";
      severity = "info";
    } else if (tokenAfter.amount === 0n && tokenBefore.amount > 0n && diff.lamports_delta > 0n) {
      kind = "account_close";
      summary = `token account closed, reclaimed ${diff.lamports_delta} lamports`;
      severity = "warning";
    } else if (tokenAmountDelta > 0n) {
      kind = "token_mint";
      summary = `token balance increased by ${tokenAmountDelta}`;
      related.push(tokenAfter.owner);
    } else if (tokenAmountDelta < 0n) {
      kind = "token_burn";
      summary = `token balance decreased by ${-tokenAmountDelta}`;
      severity = "warning";
    } else if (tokenBefore.delegate !== tokenAfter.delegate) {
      kind = "delegate_change";
      summary = `delegate changed: ${tokenBefore.delegate ?? "none"} -> ${tokenAfter.delegate ?? "none"}`;
      severity = "critical";
    }
  } else if (diff.layout_kind === "system_account") {
    if (diff.lamports_delta !== 0n) {
      kind = "sol_transfer";
      summary =
        diff.lamports_delta > 0n
          ? `received ${diff.lamports_delta} lamports`
          : `sent ${-diff.lamports_delta} lamports`;
      if (Math.abs(Number(diff.lamports_delta)) > 1_000_000_000) {
        severity = "warning";
      }
    }
    if (diff.data_length_before === 0 && diff.data_length_after > 0) {
      kind = "account_create";
      summary = `account created with ${diff.data_length_after} bytes data`;
    }
  }

  if (diff.owner_changed) {
    kind = "owner_change";
    summary = `owner reassigned: ${diff.owner_before.slice(0, 8)}... -> ${diff.owner_after.slice(0, 8)}...`;
    severity = "critical";
  }

  if (diff.data_length_before !== diff.data_length_after && kind === "unknown") {
    kind = "data_resize";
    summary = `data resized: ${diff.data_length_before} -> ${diff.data_length_after} bytes`;
  }

  return {
    kind,
    pubkey: diff.pubkey,
    summary,
    lamports_delta: diff.lamports_delta,
    token_amount_delta: tokenAmountDelta,
    mint,
    severity,
    related_accounts: related,
  };
}

export function buildSemanticDiff(report: TransactionDiffReport): SemanticDiffReport {
  const changes = report.diffs.map(classifyDiff);
  let totalLamports = 0n;
  let tokenTransfers = 0;
  let accountsClosed = 0;

  for (const change of changes) {
    if (change.lamports_delta !== 0n) {
      totalLamports += change.lamports_delta < 0n ? -change.lamports_delta : change.lamports_delta;
    }
    if (change.kind === "token_mint" || change.kind === "token_burn") {
      tokenTransfers++;
    }
    if (change.kind === "account_close") {
      accountsClosed++;
    }
  }

  return {
    signature: report.signature,
    changes,
    total_lamports_moved: totalLamports,
    token_transfers: tokenTransfers,
    accounts_closed: accountsClosed,
  };
}

export function filterBySeverity(
  report: SemanticDiffReport,
  minSeverity: SemanticChange["severity"],
): SemanticChange[] {
  const order: Record<SemanticChange["severity"], number> = {
    info: 0,
    warning: 1,
    critical: 2,
  };
  const threshold = order[minSeverity];
  return report.changes.filter((c) => order[c.severity] >= threshold);
}

export function groupByKind(report: SemanticDiffReport): Map<SemanticChangeKind, SemanticChange[]> {
  const groups = new Map<SemanticChangeKind, SemanticChange[]>();
  for (const change of report.changes) {
    const list = groups.get(change.kind) ?? [];
    list.push(change);
    groups.set(change.kind, list);
  }
  return groups;
}
