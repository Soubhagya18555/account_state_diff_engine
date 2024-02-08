import {
  TOKEN_PROGRAM_ID,
  type AccountDiff,
  type ByteRangeChange,
  type FieldChange,
  type LayoutKind,
  type ParsedAccountLayout,
  type RawAccountSnapshot,
  type TokenAccountFields,
} from "./types.js";
import {
  annotateTokenFieldAtOffset,
  isTokenAccountLayout,
  parseTokenAccount,
} from "./layouts/token_account.js";
import {
  diffSystemFields,
  isSystemAccountLayout,
  parseSystemAccount,
} from "./layouts/system_account.js";

function detectLayout(snapshot: RawAccountSnapshot): LayoutKind {
  if (isTokenAccountLayout(snapshot.data, snapshot.owner, TOKEN_PROGRAM_ID)) {
    return "token_account";
  }
  if (isSystemAccountLayout(snapshot.owner)) {
    return "system_account";
  }
  return "unknown";
}

function parseLayout(snapshot: RawAccountSnapshot): ParsedAccountLayout | null {
  const kind = detectLayout(snapshot);
  if (kind === "token_account") {
    return { kind, token: parseTokenAccount(snapshot.data) };
  }
  if (kind === "system_account") {
    return {
      kind,
      system: parseSystemAccount(
        snapshot.lamports,
        snapshot.owner,
        snapshot.executable,
        snapshot.rent_epoch,
        snapshot.data,
      ),
    };
  }
  return { kind: "unknown" };
}

function diffTokenFields(before: TokenAccountFields, after: TokenAccountFields): FieldChange[] {
  const changes: FieldChange[] = [];
  const fields: Array<keyof TokenAccountFields> = [
    "mint",
    "owner",
    "amount",
    "delegate",
    "state",
    "is_native",
    "delegated_amount",
    "close_authority",
  ];

  for (const field of fields) {
    const prev = before[field];
    const next = after[field];
    const prevStr = prev === null ? "null" : prev.toString();
    const nextStr = next === null ? "null" : next.toString();
    if (prevStr !== nextStr) {
      changes.push({
        field,
        before: prevStr,
        after: nextStr,
        annotation: `token_account.${field}`,
      });
    }
  }

  return changes;
}

function annotateByteOffset(
  offset: number,
  layoutKind: LayoutKind,
): string {
  if (layoutKind === "token_account") {
    const tokenAnnotation = annotateTokenFieldAtOffset(offset);
    if (tokenAnnotation) {
      return tokenAnnotation;
    }
  }
  return `raw_byte@${offset}`;
}

export function computeByteDiff(
  before: Buffer,
  after: Buffer,
  layoutKind: LayoutKind,
): ByteRangeChange[] {
  const maxLen = Math.max(before.length, after.length);
  const changes: ByteRangeChange[] = [];
  let runStart: number | null = null;

  const flushRun = (end: number) => {
    if (runStart === null) {
      return;
    }
    const length = end - runStart;
    changes.push({
      offset: runStart,
      length,
      before_hex: before.subarray(runStart, end).toString("hex") || "(absent)",
      after_hex: after.subarray(runStart, end).toString("hex") || "(absent)",
      annotation: annotateByteOffset(runStart, layoutKind),
    });
    runStart = null;
  };

  for (let i = 0; i < maxLen; i++) {
    const b = i < before.length ? before[i] : undefined;
    const a = i < after.length ? after[i] : undefined;
    if (b !== a) {
      if (runStart === null) {
        runStart = i;
      }
    } else {
      flushRun(i);
    }
  }
  flushRun(maxLen);

  return changes;
}

function mergeFieldChanges(
  parsedBefore: ParsedAccountLayout | null,
  parsedAfter: ParsedAccountLayout | null,
): FieldChange[] {
  if (!parsedBefore || !parsedAfter) {
    return [];
  }
  if (parsedBefore.kind === "token_account" && parsedAfter.kind === "token_account") {
    return diffTokenFields(parsedBefore.token!, parsedAfter.token!);
  }
  if (parsedBefore.kind === "system_account" && parsedAfter.kind === "system_account") {
    return diffSystemFields(parsedBefore.system!, parsedAfter.system!);
  }
  return [];
}

export function diffAccountSnapshots(
  before: RawAccountSnapshot,
  after: RawAccountSnapshot,
): AccountDiff {
  const layoutKind = detectLayout(after) !== "unknown" ? detectLayout(after) : detectLayout(before);
  const parsedBefore = layoutKind !== "unknown" ? parseLayout(before) : null;
  const parsedAfter = layoutKind !== "unknown" ? parseLayout(after) : null;

  const byteChanges = computeByteDiff(before.data, after.data, layoutKind);
  const fieldChanges = mergeFieldChanges(parsedBefore, parsedAfter);

  return {
    pubkey: before.pubkey,
    layout_kind: layoutKind,
    lamports_before: before.lamports,
    lamports_after: after.lamports,
    lamports_delta: after.lamports - before.lamports,
    owner_changed: before.owner !== after.owner,
    owner_before: before.owner,
    owner_after: after.owner,
    data_length_before: before.data.length,
    data_length_after: after.data.length,
    byte_changes: byteChanges,
    field_changes: fieldChanges,
    parsed_before: parsedBefore,
    parsed_after: parsedAfter,
  };
}

export function diffAccountSets(
  beforeAccounts: RawAccountSnapshot[],
  afterAccounts: RawAccountSnapshot[],
): AccountDiff[] {
  const beforeMap = new Map(beforeAccounts.map((a) => [a.pubkey, a]));
  const diffs: AccountDiff[] = [];

  for (const after of afterAccounts) {
    const before = beforeMap.get(after.pubkey);
    if (!before) {
      continue;
    }
    const diff = diffAccountSnapshots(before, after);
    const hasChange =
      diff.lamports_delta !== 0n ||
      diff.owner_changed ||
      diff.byte_changes.length > 0 ||
      diff.data_length_before !== diff.data_length_after;

    if (hasChange) {
      diffs.push(diff);
    }
  }

  return diffs;
}
