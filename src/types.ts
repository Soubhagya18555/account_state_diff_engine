import type { PublicKey } from "@solana/web3.js";

export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";

export const TOKEN_ACCOUNT_SIZE = 165;

export type AccountStateLabel =
  | "uninitialized"
  | "initialized"
  | "frozen";

export interface TokenAccountFields {
  mint: string;
  owner: string;
  amount: bigint;
  delegate: string | null;
  state: AccountStateLabel;
  is_native: bigint | null;
  delegated_amount: bigint;
  close_authority: string | null;
}

export interface SystemAccountFields {
  lamports: bigint;
  owner: string;
  executable: boolean;
  rent_epoch: bigint;
  data_length: number;
  data_hex: string;
}

export type LayoutKind = "token_account" | "system_account" | "unknown";

export interface ParsedAccountLayout {
  kind: LayoutKind;
  token?: TokenAccountFields;
  system?: SystemAccountFields;
}

export interface RawAccountSnapshot {
  pubkey: string;
  lamports: bigint;
  owner: string;
  executable: boolean;
  rent_epoch: bigint;
  data: Buffer;
}

export interface ByteRangeChange {
  offset: number;
  length: number;
  before_hex: string;
  after_hex: string;
  annotation: string;
}

export interface FieldChange {
  field: string;
  before: string;
  after: string;
  annotation: string;
}

export interface AccountDiff {
  pubkey: string;
  layout_kind: LayoutKind;
  lamports_before: bigint;
  lamports_after: bigint;
  lamports_delta: bigint;
  owner_changed: boolean;
  owner_before: string;
  owner_after: string;
  data_length_before: number;
  data_length_after: number;
  byte_changes: ByteRangeChange[];
  field_changes: FieldChange[];
  parsed_before: ParsedAccountLayout | null;
  parsed_after: ParsedAccountLayout | null;
}

export interface TransactionDiffReport {
  signature: string;
  slot: number;
  block_time: number | null;
  rpc_url: string;
  accounts_changed: number;
  diffs: AccountDiff[];
}

export interface RpcFetcherOptions {
  rpc_url: string;
  commitment?: "confirmed" | "finalized";
}

export interface CliOptions {
  signature: string;
  json: boolean;
  rpc_url: string;
}

export type PubkeyLike = PublicKey | string;
