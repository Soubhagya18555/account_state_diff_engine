import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_ACCOUNT_SIZE,
  type AccountStateLabel,
  type TokenAccountFields,
} from "../types.js";

const STATE_LABELS: Record<number, AccountStateLabel> = {
  0: "uninitialized",
  1: "initialized",
  2: "frozen",
};

function readPubkey(data: Buffer, offset: number): string {
  return new PublicKey(data.subarray(offset, offset + 32)).toBase58();
}

function readU64(data: Buffer, offset: number): bigint {
  return data.readBigUInt64LE(offset);
}

function readCOptionPubkey(data: Buffer, offset: number): string | null {
  const tag = data.readUInt32LE(offset);
  if (tag === 0) {
    return null;
  }
  if (tag !== 1) {
    throw new Error(`invalid COption pubkey tag at offset ${offset}: ${tag}`);
  }
  return readPubkey(data, offset + 4);
}

function readCOptionU64(data: Buffer, offset: number): bigint | null {
  const tag = data.readUInt32LE(offset);
  if (tag === 0) {
    return null;
  }
  if (tag !== 1) {
    throw new Error(`invalid COption u64 tag at offset ${offset}: ${tag}`);
  }
  return readU64(data, offset + 4);
}

export function isTokenAccountLayout(data: Buffer, owner: string, tokenProgramId: string): boolean {
  return owner === tokenProgramId && data.length === TOKEN_ACCOUNT_SIZE;
}

export function parseTokenAccount(data: Buffer): TokenAccountFields {
  if (data.length !== TOKEN_ACCOUNT_SIZE) {
    throw new Error(`token account data must be ${TOKEN_ACCOUNT_SIZE} bytes, got ${data.length}`);
  }

  const stateByte = data.readUInt8(108);
  const state = STATE_LABELS[stateByte];
  if (!state) {
    throw new Error(`unknown token account state byte: ${stateByte}`);
  }

  return {
    mint: readPubkey(data, 0),
    owner: readPubkey(data, 32),
    amount: readU64(data, 64),
    delegate: readCOptionPubkey(data, 72),
    state,
    is_native: readCOptionU64(data, 109),
    delegated_amount: readU64(data, 121),
    close_authority: readCOptionPubkey(data, 129),
  };
}

export const TOKEN_FIELD_OFFSETS: Record<string, { offset: number; length: number }> = {
  mint: { offset: 0, length: 32 },
  owner: { offset: 32, length: 32 },
  amount: { offset: 64, length: 8 },
  delegate_tag: { offset: 72, length: 4 },
  delegate_key: { offset: 76, length: 32 },
  state: { offset: 108, length: 1 },
  is_native_tag: { offset: 109, length: 4 },
  is_native_amount: { offset: 113, length: 8 },
  delegated_amount: { offset: 121, length: 8 },
  close_authority_tag: { offset: 129, length: 4 },
  close_authority_key: { offset: 133, length: 32 },
};

export function annotateTokenFieldAtOffset(offset: number): string | null {
  for (const [field, range] of Object.entries(TOKEN_FIELD_OFFSETS)) {
    if (offset >= range.offset && offset < range.offset + range.length) {
      return `token_account.${field}`;
    }
  }
  return null;
}
