import { PublicKey } from "@solana/web3.js";
import { TOKEN_ACCOUNT_SIZE, TOKEN_PROGRAM_ID } from "../types.js";

export function buildTokenAccountBuffer(fields: {
  mint: string;
  owner: string;
  amount: bigint;
  delegate?: string | null;
  state?: number;
  delegated_amount?: bigint;
  close_authority?: string | null;
}): Buffer {
  const buf = Buffer.alloc(TOKEN_ACCOUNT_SIZE, 0);
  new PublicKey(fields.mint).toBuffer().copy(buf, 0);
  new PublicKey(fields.owner).toBuffer().copy(buf, 32);
  buf.writeBigUInt64LE(fields.amount, 64);

  if (fields.delegate) {
    buf.writeUInt32LE(1, 72);
    new PublicKey(fields.delegate).toBuffer().copy(buf, 76);
  }

  buf.writeUInt8(fields.state ?? 1, 108);
  buf.writeUInt32LE(0, 109);
  buf.writeBigUInt64LE(fields.delegated_amount ?? 0n, 121);

  if (fields.close_authority) {
    buf.writeUInt32LE(1, 129);
    new PublicKey(fields.close_authority).toBuffer().copy(buf, 133);
  }

  return buf;
}

export function buildEmptySystemData(): Buffer {
  return Buffer.alloc(0);
}

export function defaultSystemOwner(): string {
  return "11111111111111111111111111111111";
}

export function tokenProgramOwner(): string {
  return TOKEN_PROGRAM_ID;
}
