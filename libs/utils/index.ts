import * as bindings from "@ckb-js-std/bindings";
import { HighLevel, bytesEq } from "@ckb-js-std/core";

import { Since } from "../ckb-since/src";
import { PorjectArgs } from "./args";

export * from "./args";

export enum ScriptStatus {
  CREATED = "created",
  TRANSACTION = "transaction",
  DESTROYED = "destroyed",
}

export function isCellPresent(
  index: number,
  source: bindings.SourceType,
): boolean {
  try {
    bindings.loadCellByField(index, source, bindings.CELL_FIELD_CAPACITY);
  } catch (err: any) {
    if (err.errorCode === bindings.INDEX_OUT_OF_BOUND) {
      return false;
    } else {
      throw err;
    }
  }
  return true;
}

export function getScriptStatus(): ScriptStatus {
  let input = isCellPresent(0, bindings.SOURCE_GROUP_INPUT);
  let output = isCellPresent(0, bindings.SOURCE_GROUP_OUTPUT);

  if (input && output) {
    return ScriptStatus.TRANSACTION;
  } else if (!input && output) {
    return ScriptStatus.CREATED;
  } else if (input && !output) {
    return ScriptStatus.DESTROYED;
  } else {
    throw Error("Unknow");
  }
}

// Return false to indicate it has expired
export function checkDeadline(deadline: Since): boolean {
  const since = new Since(HighLevel.loadInputSince(0, bindings.SOURCE_INPUT));
  let ording = deadline.cmp(since);
  if (ording == null) {
    throw Error("deadline and since types do not match");
  }
  return ording === 1;
}

export function getProjectArgs(scritpHash: ArrayBuffer, source: bindings.SourceType): PorjectArgs | undefined {
  let iters = new HighLevel.QueryIter(HighLevel.loadCellType, source);
  for (let it of iters) {
    if (it == undefined)
      continue;
    if (bytesEq(it.hash(), scritpHash))
      return new PorjectArgs(it.args);
  }

  return undefined;
}

export const MAX_CELLS = 256;

export function optionBytesEq(a: ArrayBuffer | null, b: ArrayBuffer | null): boolean {
  if (a === null)
    return b === null
  if (b === null)
    return false;

  return bytesEq(a, b);
}
