import type { AccountDiff, AccountStateLabel, SplTokenDiff, TransactionDiffReport } from "./types.js";

function extractTokenDiff(diff: AccountDiff): SplTokenDiff | null {
  if (diff.layout_kind !== "token_account") {
    return null;
  }

  const before = diff.parsed_before?.token;
  const after = diff.parsed_after?.token;

  if (!before || !after) {
    return null;
  }

  const amountDelta = after.amount - before.amount;
  const isClose = after.amount === 0n && before.amount > 0n && diff.lamports_delta > 0n;
  const isMintTo = amountDelta > 0n && before.amount === 0n;

  return {
    pubkey: diff.pubkey,
    mint: after.mint,
    owner: after.owner,
    amount_before: before.amount,
    amount_after: after.amount,
    amount_delta: amountDelta,
    delegate_changed: before.delegate !== after.delegate,
    state_changed: before.state !== after.state,
    state_before: before.state,
    state_after: after.state,
    is_close: isClose,
    is_mint_to: isMintTo,
  };
}

export function extractSplTokenDiffs(report: TransactionDiffReport): SplTokenDiff[] {
  return report.diffs
    .map(extractTokenDiff)
    .filter((d): d is SplTokenDiff => d !== null);
}

export function groupByMint(diffs: SplTokenDiff[]): Map<string, SplTokenDiff[]> {
  const groups = new Map<string, SplTokenDiff[]>();
  for (const diff of diffs) {
    const list = groups.get(diff.mint) ?? [];
    list.push(diff);
    groups.set(diff.mint, list);
  }
  return groups;
}

export function computeMintSupplyDelta(diffs: SplTokenDiff[]): bigint {
  return diffs.reduce((sum, d) => sum + d.amount_delta, 0n);
}

export function findDelegateChanges(diffs: SplTokenDiff[]): SplTokenDiff[] {
  return diffs.filter((d) => d.delegate_changed);
}

export function findFrozenAccounts(diffs: SplTokenDiff[]): SplTokenDiff[] {
  return diffs.filter(
    (d) => d.state_changed && d.state_after === "frozen",
  );
}

export interface TokenTransferSummary {
  mint: string;
  total_minted: bigint;
  total_burned: bigint;
  net_supply_change: bigint;
  accounts_affected: number;
  closes: number;
}

export function summarizeByMint(diffs: SplTokenDiff[]): TokenTransferSummary[] {
  const byMint = groupByMint(diffs);
  const summaries: TokenTransferSummary[] = [];

  for (const [mint, mintDiffs] of byMint) {
    let minted = 0n;
    let burned = 0n;
    let closes = 0;

    for (const d of mintDiffs) {
      if (d.amount_delta > 0n) {
        minted += d.amount_delta;
      } else if (d.amount_delta < 0n) {
        burned += -d.amount_delta;
      }
      if (d.is_close) {
        closes++;
      }
    }

    summaries.push({
      mint,
      total_minted: minted,
      total_burned: burned,
      net_supply_change: minted - burned,
      accounts_affected: mintDiffs.length,
      closes,
    });
  }

  return summaries.sort((a, b) => (a.net_supply_change > b.net_supply_change ? -1 : 1));
}

export function formatStateLabel(state: AccountStateLabel | null): string {
  if (state === null) {
    return "unknown";
  }
  return state;
}
