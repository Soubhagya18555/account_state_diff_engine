import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PublicKey } from "@solana/web3.js";
import { buildTokenAccountBuffer } from "../layouts/account_builder.js";
import { parseTokenAccount, annotateTokenFieldAtOffset } from "../layouts/token_account.js";
import { parseSystemAccount, diffSystemFields } from "../layouts/system_account.js";
import { computeByteDiff, diffAccountSnapshots } from "../diff_engine.js";
import { TOKEN_ACCOUNT_SIZE } from "../types.js";

const MINT = "So11111111111111111111111111111111111111112";
const OWNER = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const DELEGATE = "11111111111111111111111111111112";

describe("token_account layout parser", () => {
  it("parses mint owner amount delegate and state", () => {
    const data = buildTokenAccountBuffer({
      mint: MINT,
      owner: OWNER,
      amount: 1_500_000n,
      delegate: DELEGATE,
      state: 1,
      delegated_amount: 500n,
    });

    assert.equal(data.length, TOKEN_ACCOUNT_SIZE);
    const parsed = parseTokenAccount(data);
    assert.equal(parsed.mint, MINT);
    assert.equal(parsed.owner, OWNER);
    assert.equal(parsed.amount, 1_500_000n);
    assert.equal(parsed.delegate, DELEGATE);
    assert.equal(parsed.state, "initialized");
    assert.equal(parsed.delegated_amount, 500n);
    assert.equal(parsed.is_native, null);
    assert.equal(parsed.close_authority, null);
  });

  it("annotates token field offsets", () => {
    assert.equal(annotateTokenFieldAtOffset(0), "token_account.mint");
    assert.equal(annotateTokenFieldAtOffset(64), "token_account.amount");
    assert.equal(annotateTokenFieldAtOffset(108), "token_account.state");
    assert.equal(annotateTokenFieldAtOffset(200), null);
  });
});

describe("system_account layout parser", () => {
  it("parses system account metadata fields", () => {
    const parsed = parseSystemAccount(1_000_000n, "11111111111111111111111111111111", false, 250n, Buffer.alloc(0));
    assert.equal(parsed.lamports, 1_000_000n);
    assert.equal(parsed.owner, "11111111111111111111111111111111");
    assert.equal(parsed.executable, false);
    assert.equal(parsed.rent_epoch, 250n);
    assert.equal(parsed.data_length, 0);
    assert.equal(parsed.data_hex, "");
  });

  it("detects lamports field changes", () => {
    const before = parseSystemAccount(1_000n, "11111111111111111111111111111111", false, 0n, Buffer.alloc(0));
    const after = parseSystemAccount(2_000n, "11111111111111111111111111111111", false, 0n, Buffer.alloc(0));
    const changes = diffSystemFields(before, after);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].field, "lamports");
    assert.equal(changes[0].before, "1000");
    assert.equal(changes[0].after, "2000");
  });
});

describe("diff_engine", () => {
  it("computes byte ranges for amount change", () => {
    const before = buildTokenAccountBuffer({ mint: MINT, owner: OWNER, amount: 100n });
    const after = buildTokenAccountBuffer({ mint: MINT, owner: OWNER, amount: 200n });
    const changes = computeByteDiff(before, after, "token_account");
    assert.ok(changes.length >= 1);
    assert.equal(changes[0].offset, 64);
    assert.equal(changes[0].annotation, "token_account.amount");
  });

  it("diffs account snapshots with semantic field changes", () => {
    const pubkey = new PublicKey("11111111111111111111111111111112").toBase58();
    const beforeData = buildTokenAccountBuffer({ mint: MINT, owner: OWNER, amount: 100n });
    const afterData = buildTokenAccountBuffer({ mint: MINT, owner: OWNER, amount: 250n });

    const diff = diffAccountSnapshots(
      {
        pubkey,
        lamports: 2_039_280n,
        owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        executable: false,
        rent_epoch: 0n,
        data: beforeData,
      },
      {
        pubkey,
        lamports: 2_039_280n,
        owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        executable: false,
        rent_epoch: 0n,
        data: afterData,
      },
    );

    assert.equal(diff.layout_kind, "token_account");
    assert.equal(diff.lamports_delta, 0n);
    assert.ok(diff.field_changes.some((c) => c.field === "amount"));
    assert.ok(diff.byte_changes.length > 0);
  });

  it("reports lamports delta for system accounts", () => {
    const pubkey = new PublicKey("11111111111111111111111111111112").toBase58();
    const diff = diffAccountSnapshots(
      {
        pubkey,
        lamports: 5_000n,
        owner: "11111111111111111111111111111111",
        executable: false,
        rent_epoch: 0n,
        data: Buffer.alloc(0),
      },
      {
        pubkey,
        lamports: 3_000n,
        owner: "11111111111111111111111111111111",
        executable: false,
        rent_epoch: 0n,
        data: Buffer.alloc(0),
      },
    );

    assert.equal(diff.layout_kind, "system_account");
    assert.equal(diff.lamports_delta, -2_000n);
    assert.ok(diff.field_changes.some((c) => c.field === "lamports"));
  });
});
