import type { AccountDiff, LamportFlowEdge, LamportFlowGraph, TransactionDiffReport } from "./types.js";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";

function inferFlowReason(diff: AccountDiff): string {
  if (diff.layout_kind === "token_account" && diff.lamports_delta > 0n && diff.parsed_after?.token?.amount === 0n) {
    return "token_account_close_rent_reclaim";
  }
  if (diff.lamports_delta > 0n) {
    return "lamport_credit";
  }
  if (diff.lamports_delta < 0n) {
    return "lamport_debit";
  }
  return "no_lamport_change";
}

export function buildLamportFlowGraph(report: TransactionDiffReport): LamportFlowGraph {
  const netByAccount = new Map<string, bigint>();
  const flows: LamportFlowEdge[] = [];
  let totalMoved = 0n;

  const senders: Array<{ pubkey: string; amount: bigint; reason: string }> = [];
  const receivers: Array<{ pubkey: string; amount: bigint; reason: string }> = [];

  for (const diff of report.diffs) {
    const current = netByAccount.get(diff.pubkey) ?? 0n;
    netByAccount.set(diff.pubkey, current + diff.lamports_delta);

    if (diff.lamports_delta === 0n) {
      continue;
    }

    const reason = inferFlowReason(diff);
    const absAmount = diff.lamports_delta < 0n ? -diff.lamports_delta : diff.lamports_delta;
    totalMoved += absAmount;

    if (diff.lamports_delta < 0n) {
      senders.push({ pubkey: diff.pubkey, amount: absAmount, reason });
    } else {
      receivers.push({ pubkey: diff.pubkey, amount: absAmount, reason });
    }
  }

  for (const sender of senders) {
    for (const receiver of receivers) {
      const flowAmount = sender.amount < receiver.amount ? sender.amount : receiver.amount;
      if (flowAmount === 0n) {
        continue;
      }
      flows.push({
        from: sender.pubkey,
        to: receiver.pubkey,
        lamports: flowAmount,
        reason: `${sender.reason}_to_${receiver.reason}`,
      });
    }
  }

  if (flows.length === 0 && totalMoved > 0n) {
    for (const diff of report.diffs) {
      if (diff.lamports_delta > 0n) {
        flows.push({
          from: SYSTEM_PROGRAM,
          to: diff.pubkey,
          lamports: diff.lamports_delta,
          reason: "external_credit",
        });
      } else if (diff.lamports_delta < 0n) {
        flows.push({
          from: diff.pubkey,
          to: SYSTEM_PROGRAM,
          lamports: -diff.lamports_delta,
          reason: "external_debit",
        });
      }
    }
  }

  return {
    signature: report.signature,
    net_by_account: netByAccount,
    flows,
    total_moved: totalMoved,
  };
}

export function topLamportReceivers(graph: LamportFlowGraph, limit = 5): Array<{ pubkey: string; net: bigint }> {
  const entries = Array.from(graph.net_by_account.entries())
    .filter(([, net]) => net > 0n)
    .sort((a, b) => (a[1] > b[1] ? -1 : 1))
    .slice(0, limit)
    .map(([pubkey, net]) => ({ pubkey, net }));
  return entries;
}

export function topLamportSenders(graph: LamportFlowGraph, limit = 5): Array<{ pubkey: string; net: bigint }> {
  const entries = Array.from(graph.net_by_account.entries())
    .filter(([, net]) => net < 0n)
    .sort((a, b) => (a[1] < b[1] ? -1 : 1))
    .slice(0, limit)
    .map(([pubkey, net]) => ({ pubkey, net }));
  return entries;
}

export function serializeLamportFlowGraph(graph: LamportFlowGraph): object {
  return {
    signature: graph.signature,
    total_moved: graph.total_moved.toString(),
    net_by_account: Object.fromEntries(
      Array.from(graph.net_by_account.entries()).map(([k, v]) => [k, v.toString()]),
    ),
    flows: graph.flows.map((f) => ({
      ...f,
      lamports: f.lamports.toString(),
    })),
  };
}
