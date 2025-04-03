import {
  Connection,
  type TokenBalance,
  type VersionedTransactionResponse,
} from "@solana/web3.js";
import {
  buildEmptySystemData,
  buildTokenAccountBuffer,
  defaultSystemOwner,
  tokenProgramOwner,
} from "./layouts/account_builder.js";
import type { RawAccountSnapshot, RpcFetcherOptions } from "./types.js";

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

export function resolveRpcUrl(override?: string): string {
  return override ?? process.env.SOLANA_RPC_URL ?? DEFAULT_RPC;
}

export async function fetchTransaction(
  signature: string,
  options: RpcFetcherOptions,
): Promise<VersionedTransactionResponse> {
  const connection = new Connection(options.rpc_url, options.commitment ?? "confirmed");
  const tx = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: options.commitment ?? "confirmed",
  });

  if (!tx) {
    throw new Error(`transaction not found: ${signature}`);
  }

  if (!tx.meta) {
    throw new Error(`transaction metadata missing for: ${signature}`);
  }

  return tx;
}

function collectAccountKeys(tx: VersionedTransactionResponse): string[] {
  const message = tx.transaction.message;
  const staticKeys = message.getAccountKeys().staticAccountKeys.map((k) => k.toBase58());
  const loaded = tx.meta!.loadedAddresses;
  return [
    ...staticKeys,
    ...(loaded?.writable.map((k) => k.toBase58()) ?? []),
    ...(loaded?.readonly.map((k) => k.toBase58()) ?? []),
  ];
}

function tokenBalanceMap(
  balances: TokenBalance[] | null | undefined,
): Map<number, TokenBalance> {
  const map = new Map<number, TokenBalance>();
  for (const balance of balances ?? []) {
    map.set(balance.accountIndex, balance);
  }
  return map;
}

function snapshotFromMeta(
  pubkey: string,
  lamports: number,
  tokenBalance: TokenBalance | undefined,
): RawAccountSnapshot {
  if (tokenBalance) {
    const amount = BigInt(tokenBalance.uiTokenAmount.amount);
    const owner = tokenBalance.owner ?? defaultSystemOwner();
    return {
      pubkey,
      lamports: BigInt(lamports),
      owner: tokenBalance.programId ?? tokenProgramOwner(),
      executable: false,
      rent_epoch: 0n,
      data: buildTokenAccountBuffer({
        mint: tokenBalance.mint,
        owner,
        amount,
        state: 1,
      }),
    };
  }

  return {
    pubkey,
    lamports: BigInt(lamports),
    owner: defaultSystemOwner(),
    executable: false,
    rent_epoch: 0n,
    data: buildEmptySystemData(),
  };
}

export function extractAccountSnapshots(
  tx: VersionedTransactionResponse,
): { before: RawAccountSnapshot[]; after: RawAccountSnapshot[] } {
  const meta = tx.meta!;
  const keys = collectAccountKeys(tx);
  const preTokens = tokenBalanceMap(meta.preTokenBalances);
  const postTokens = tokenBalanceMap(meta.postTokenBalances);

  const before: RawAccountSnapshot[] = [];
  const after: RawAccountSnapshot[] = [];

  for (let i = 0; i < keys.length; i++) {
    const pubkey = keys[i];
    const preLamports = meta.preBalances[i] ?? 0;
    const postLamports = meta.postBalances[i] ?? 0;

    before.push(snapshotFromMeta(pubkey, preLamports, preTokens.get(i)));
    after.push(snapshotFromMeta(pubkey, postLamports, postTokens.get(i)));
  }

  return { before, after };
}

export async function fetchAccountSnapshots(
  signature: string,
  rpcUrl?: string,
): Promise<{
  tx: VersionedTransactionResponse;
  before: RawAccountSnapshot[];
  after: RawAccountSnapshot[];
}> {
  const url = resolveRpcUrl(rpcUrl);
  const tx = await fetchTransaction(signature, { rpc_url: url });
  const snapshots = extractAccountSnapshots(tx);
  return { tx, ...snapshots };
}
