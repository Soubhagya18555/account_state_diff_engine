#!/usr/bin/env node

export * from "./diff_engine.js";
export * from "./html_report.js";
export * from "./lamport_tracker.js";
export * from "./report.js";
export * from "./rpc_fetcher.js";
export * from "./semantic_diff.js";
export * from "./spl_token_diff.js";
export type * from "./types.js";

import { diffAccountSets } from "./diff_engine.js";
import { fetchAccountSnapshots, resolveRpcUrl } from "./rpc_fetcher.js";
import { formatHumanReport, formatJsonReport } from "./report.js";
import type { CliOptions, TransactionDiffReport } from "./types.js";

function printUsage(): void {
  console.error("usage: account_state_diff_engine <signature> [--json] [--rpc url]");
  process.exit(1);
}

export function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
  }

  let signature = "";
  let json = false;
  let rpc_url = resolveRpcUrl();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--rpc") {
      const next = args[i + 1];
      if (!next) {
        printUsage();
      }
      rpc_url = next;
      i++;
    } else if (!signature) {
      signature = arg;
    } else {
      printUsage();
    }
  }

  if (!signature) {
    printUsage();
  }

  return { signature, json, rpc_url };
}

export async function runAnalysis(options: CliOptions): Promise<TransactionDiffReport> {
  const { tx, before, after } = await fetchAccountSnapshots(options.signature, options.rpc_url);
  const diffs = diffAccountSets(before, after);

  return {
    signature: options.signature,
    slot: tx.slot,
    block_time: tx.blockTime ?? null,
    rpc_url: options.rpc_url,
    accounts_changed: diffs.length,
    diffs,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);
  const report = await runAnalysis(options);
  const output = options.json ? formatJsonReport(report) : formatHumanReport(report);
  console.log(output);
}

import { fileURLToPath } from "node:url";

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`error: ${message}`);
    process.exit(1);
  });
}
