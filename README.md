# account_state_diff_engine

Forensic analysis tool for Solana transactions. Given a transaction signature, the engine fetches confirmed transaction metadata over RPC, reconstructs pre and post account snapshots, and emits byte level differentials with semantic field annotations for SPL token accounts and system program accounts.

**Author:** Soubhagya  
**License:** MIT

## Features

- RPC transaction fetch with `maxSupportedTransactionVersion: 0`
- SPL token account layout parser (mint, owner, amount, delegate, state, delegated_amount, close_authority)
- System account metadata parser (lamports, owner, executable, rent_epoch, data)
- Byte range diff engine with layout aware annotations
- Human readable and JSON report output
- CLI for pipeline integration

## Install

```bash
npm install
npm run build
```

## Usage

```bash
account_state_diff_engine <signature> [--json] [--rpc url]
```

### Examples

```bash
# human readable report (default mainnet RPC)
npx account_state_diff_engine 5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW

# JSON output with custom RPC endpoint
npx account_state_diff_engine <signature> --json --rpc https://api.mainnet-beta.solana.com
```

Set `SOLANA_RPC_URL` to override the default RPC without passing `--rpc`.

## Output

Human output lists each changed account with:

- layout classification (`token_account`, `system_account`, `unknown`)
- lamport delta
- semantic field changes (for example `token_account.amount`)
- raw byte ranges with hex before and after values

JSON output mirrors the same structure for downstream tooling.

## Development

```bash
npm test
npm run build
```

## Project layout

```
src/
  layouts/          SPL and system account parsers
  diff_engine.ts    byte and field differential logic
  rpc_fetcher.ts    Solana RPC getTransaction integration
  report.ts         human and JSON formatters
  index.ts          CLI entrypoint
  tests/            unit tests
docs/
  ARCHITECTURE.md   design notes
```

## Limitations

Historical account data bytes are not returned directly by standard `getTransaction` metadata. Token account buffers are reconstructed from `preTokenBalances` and `postTokenBalances` fields when present. System accounts are compared on lamport balances and empty data payloads unless extended RPC sources are added.

## Security

This tool performs read only RPC queries. Do not embed private keys. Use dedicated RPC infrastructure for high volume forensic workloads.
