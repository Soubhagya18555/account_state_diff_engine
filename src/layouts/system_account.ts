import {
  SYSTEM_PROGRAM_ID,
  type SystemAccountFields,
} from "../types.js";

export function isSystemAccountLayout(owner: string): boolean {
  return owner === SYSTEM_PROGRAM_ID;
}

export function parseSystemAccount(
  lamports: bigint,
  owner: string,
  executable: boolean,
  rent_epoch: bigint,
  data: Buffer,
): SystemAccountFields {
  return {
    lamports,
    owner,
    executable,
    rent_epoch,
    data_length: data.length,
    data_hex: data.length > 0 ? data.toString("hex") : "",
  };
}

export function annotateSystemField(field: string): string {
  return `system_account.${field}`;
}

export function diffSystemFields(
  before: SystemAccountFields,
  after: SystemAccountFields,
): Array<{ field: string; before: string; after: string; annotation: string }> {
  const changes: Array<{ field: string; before: string; after: string; annotation: string }> = [];

  if (before.lamports !== after.lamports) {
    changes.push({
      field: "lamports",
      before: before.lamports.toString(),
      after: after.lamports.toString(),
      annotation: annotateSystemField("lamports"),
    });
  }

  if (before.owner !== after.owner) {
    changes.push({
      field: "owner",
      before: before.owner,
      after: after.owner,
      annotation: annotateSystemField("owner"),
    });
  }

  if (before.executable !== after.executable) {
    changes.push({
      field: "executable",
      before: String(before.executable),
      after: String(after.executable),
      annotation: annotateSystemField("executable"),
    });
  }

  if (before.rent_epoch !== after.rent_epoch) {
    changes.push({
      field: "rent_epoch",
      before: before.rent_epoch.toString(),
      after: after.rent_epoch.toString(),
      annotation: annotateSystemField("rent_epoch"),
    });
  }

  if (before.data_hex !== after.data_hex) {
    changes.push({
      field: "data",
      before: before.data_hex || "(empty)",
      after: after.data_hex || "(empty)",
      annotation: annotateSystemField("data"),
    });
  }

  return changes;
}
