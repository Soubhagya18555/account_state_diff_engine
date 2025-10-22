import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PublicKey } from "@solana/web3.js";
import { buildTokenAccountBuffer } from "../layouts/account_builder.js";
import { diffAccountSnapshots } from "../diff_engine.js";
import { buildSemanticDiff, filterBySeverity, groupByKind } from "../semantic_diff.js";
import {
  buildLamportFlowGraph,
  topLamportReceivers,
  topLamportSenders,
  serializeLamportFlowGraph,
} from "../lamport_tracker.js";
import {
  extractSplTokenDiffs,
  summarizeByMint,
  findDelegateChanges,
  computeMintSupplyDelta,
} from "../spl_token_diff.js";
import { renderHtmlReport } from "../html_report.js";
import type { TransactionDiffReport } from "../types.js";

const MINT = "So11111111111111111111111111111111111111112";
const OWNER = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SYSTEM = "11111111111111111111111111111111";

function makeTokenDiff(amountBefore: bigint, amountAfter: bigint, lamportsDelta = 0n) {
  const pubkey = new PublicKey("11111111111111111111111111111112").toBase58();
  return diffAccountSnapshots(
    {
      pubkey,
      lamports: 2_039_280n,
      owner: TOKEN_PROGRAM,
      executable: false,
      rent_epoch: 0n,
      data: buildTokenAccountBuffer({ mint: MINT, owner: OWNER, amount: amountBefore }),
    },
    {
      pubkey,
      lamports: 2_039_280n + lamportsDelta,
      owner: TOKEN_PROGRAM,
      executable: false,
      rent_epoch: 0n,
      data: buildTokenAccountBuffer({ mint: MINT, owner: OWNER, amount: amountAfter }),
    },
  );
}

function wrapReport(diffs: TransactionDiffReport["diffs"]): TransactionDiffReport {
  return {
    signature: "test_sig",
    slot: 100,
    block_time: 1_700_000_000,
    rpc_url: "https://api.mainnet-beta.solana.com",
    accounts_changed: diffs.length,
    diffs,
  };
}

describe("semantic_diff", () => {
  it("classifies token balance increase as token_mint", () => {
    const diff = makeTokenDiff(100n, 500n);
    const report = buildSemanticDiff(wrapReport([diff]));
    assert.equal(report.changes[0]?.kind, "token_mint");
    assert.equal(report.token_transfers, 1);
  });

  it("classifies lamport debit as sol_transfer", () => {
    const pubkey = new PublicKey("11111111111111111111111111111112").toBase58();
    const diff = diffAccountSnapshots(
      { pubkey, lamports: 10_000n, owner: SYSTEM, executable: false, rent_epoch: 0n, data: Buffer.alloc(0) },
      { pubkey, lamports: 5_000n, owner: SYSTEM, executable: false, rent_epoch: 0n, data: Buffer.alloc(0) },
    );
    const report = buildSemanticDiff(wrapReport([diff]));
    assert.equal(report.changes[0]?.kind, "sol_transfer");
    assert.ok(report.total_lamports_moved >= 5_000n);
  });

  it("filters by severity", () => {
    const diff = makeTokenDiff(100n, 500n);
    const report = buildSemanticDiff(wrapReport([diff]));
    const warnings = filterBySeverity(report, "warning");
    assert.ok(warnings.length <= report.changes.length);
  });

  it("groups changes by kind", () => {
    const diff = makeTokenDiff(100n, 50n);
    const report = buildSemanticDiff(wrapReport([diff]));
    const groups = groupByKind(report);
    assert.ok(groups.has("token_burn"));
  });
});

describe("lamport_tracker", () => {
  it("builds flow graph from mixed diffs", () => {
    const sender = new PublicKey("11111111111111111111111111111112").toBase58();
    const receiver = new PublicKey("11111111111111111111111111111113").toBase58();

    const diffs = [
      diffAccountSnapshots(
        { pubkey: sender, lamports: 10_000n, owner: SYSTEM, executable: false, rent_epoch: 0n, data: Buffer.alloc(0) },
        { pubkey: sender, lamports: 4_000n, owner: SYSTEM, executable: false, rent_epoch: 0n, data: Buffer.alloc(0) },
      ),
      diffAccountSnapshots(
        { pubkey: receiver, lamports: 1_000n, owner: SYSTEM, executable: false, rent_epoch: 0n, data: Buffer.alloc(0) },
        { pubkey: receiver, lamports: 7_000n, owner: SYSTEM, executable: false, rent_epoch: 0n, data: Buffer.alloc(0) },
      ),
    ];

    const graph = buildLamportFlowGraph(wrapReport(diffs));
    assert.equal(graph.total_moved, 12_000n);
    assert.ok(graph.net_by_account.get(sender)! < 0n);
    assert.ok(graph.net_by_account.get(receiver)! > 0n);

    const serialized = serializeLamportFlowGraph(graph) as { total_moved: string };
    assert.equal(serialized.total_moved, "12000");
  });

  it("identifies top receivers and senders", () => {
    const diffs = [
      diffAccountSnapshots(
        { pubkey: "A", lamports: 10_000n, owner: SYSTEM, executable: false, rent_epoch: 0n, data: Buffer.alloc(0) },
        { pubkey: "A", lamports: 0n, owner: SYSTEM, executable: false, rent_epoch: 0n, data: Buffer.alloc(0) },
      ),
      diffAccountSnapshots(
        { pubkey: "B", lamports: 0n, owner: SYSTEM, executable: false, rent_epoch: 0n, data: Buffer.alloc(0) },
        { pubkey: "B", lamports: 10_000n, owner: SYSTEM, executable: false, rent_epoch: 0n, data: Buffer.alloc(0) },
      ),
    ];

    const graph = buildLamportFlowGraph(wrapReport(diffs));
    assert.equal(topLamportReceivers(graph)[0]?.pubkey, "B");
    assert.equal(topLamportSenders(graph)[0]?.pubkey, "A");
  });
});

describe("spl_token_diff", () => {
  it("extracts token diffs and summarizes by mint", () => {
    const diff = makeTokenDiff(100n, 300n);
    const report = wrapReport([diff]);
    const tokenDiffs = extractSplTokenDiffs(report);
    assert.equal(tokenDiffs.length, 1);
    assert.equal(tokenDiffs[0]?.amount_delta, 200n);

    const summaries = summarizeByMint(tokenDiffs);
    assert.equal(summaries[0]?.total_minted, 200n);
    assert.equal(computeMintSupplyDelta(tokenDiffs), 200n);
  });

  it("detects delegate changes", () => {
    const pubkey = new PublicKey("11111111111111111111111111111112").toBase58();
    const delegate = "11111111111111111111111111111111";
    const diff = diffAccountSnapshots(
      {
        pubkey,
        lamports: 2_039_280n,
        owner: TOKEN_PROGRAM,
        executable: false,
        rent_epoch: 0n,
        data: buildTokenAccountBuffer({ mint: MINT, owner: OWNER, amount: 100n }),
      },
      {
        pubkey,
        lamports: 2_039_280n,
        owner: TOKEN_PROGRAM,
        executable: false,
        rent_epoch: 0n,
        data: buildTokenAccountBuffer({ mint: MINT, owner: OWNER, amount: 100n, delegate }),
      },
    );
    const tokenDiffs = extractSplTokenDiffs(wrapReport([diff]));
    assert.equal(findDelegateChanges(tokenDiffs).length, 1);
  });
});

describe("html_report", () => {
  it("renders valid HTML with semantic sections", () => {
    const diff = makeTokenDiff(100n, 200n);
    const html = renderHtmlReport(wrapReport([diff]), { title: "Test Report" });
    assert.ok(html.includes("<!DOCTYPE html>"));
    assert.ok(html.includes("Test Report"));
    assert.ok(html.includes("Semantic Changes"));
    assert.ok(html.includes("token_mint"));
  });
});
