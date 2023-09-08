# Architecture

## Overview

`account_state_diff_engine` compares account state before and after a single Solana transaction. The pipeline has four stages: fetch, snapshot extraction, differential analysis, and report formatting.

```
signature + RPC URL
        |
        v
  rpc_fetcher (getTransaction, version 0)
        |
        v
  snapshot extraction (pre/post arrays)
        |
        v
  diff_engine (byte + semantic fields)
        |
        v
  report (human | JSON)
```

## RPC layer

`rpc_fetcher.ts` calls `Connection.getTransaction` with:

- `maxSupportedTransactionVersion: 0` to support versioned transactions
- `commitment: confirmed` by default

The response `meta` block supplies:

- `preBalances` / `postBalances` per account index
- `preTokenBalances` / `postTokenBalances` for SPL token state
- static and loaded account keys from the versioned message

## Snapshot model

Each `RawAccountSnapshot` contains:

| field | source |
|-------|--------|
| pubkey | message account keys |
| lamports | pre/post balance arrays |
| owner | token program id or system program |
| data | reconstructed token layout or empty system buffer |

Token account data is rebuilt with `account_builder.ts` using mint, owner, and amount from token balance entries. This enables byte accurate comparison of amount and pubkey fields even when raw account data is not present in transaction metadata.

## Layout parsers

### token_account.ts

Parses the canonical 165 byte SPL token account layout:

| offset | field |
|--------|-------|
| 0 | mint (32) |
| 32 | owner (32) |
| 64 | amount u64 |
| 72 | delegate COption |
| 108 | state u8 |
| 109 | is_native COption |
| 121 | delegated_amount u64 |
| 129 | close_authority COption |

`annotateTokenFieldAtOffset` maps byte offsets to field names for diff annotations.

### system_account.ts

System program accounts are compared on account level metadata: lamports, owner, executable flag, rent epoch, and optional data bytes. Native SOL accounts typically carry zero length data.

## Diff engine

`diff_engine.ts` performs two complementary analyses:

1. **Byte diff**: contiguous changed ranges across pre and post data buffers with layout aware annotations.
2. **Field diff**: structured comparison of parsed layouts for token and system accounts.

An account is included in the report when any of the following differ: lamports, owner, data length, or data bytes.

## Reporting

`report.ts` serializes `TransactionDiffReport` for CLI consumers. Big integers are stringified in JSON output to preserve precision.

## Extension points

- plug in archive RPC providers that return full account data at slot boundaries
- add parsers for Token 2022, stake, and program owned layouts
- export SARIF or CSV report targets for case management systems

## Testing strategy

Unit tests construct deterministic token account buffers, mutate fields, and assert byte ranges and semantic field changes. RPC integration is not required for CI because snapshot extraction is tested through in memory fixtures.
