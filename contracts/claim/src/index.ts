import * as bindings from "@ckb-js-std/bindings";
import { HighLevel, bytesEq, log, logError, numFromBytes } from "@ckb-js-std/core";

import { ClaimArgs, PorjectArgs, ScriptStatus } from "utils";
import * as utils from "utils";

function checkContribution(args: ClaimArgs, prjArgs: PorjectArgs) {
  let capacity = undefined;

  let iters = new HighLevel.QueryIter(HighLevel.loadCellLock, bindings.SOURCE_OUTPUT);
  for (let index = 0; index < utils.MAX_CELLS; index++) {
    const it = iters.next();
    if (it.done)
      break;

    // Not Contribution (Code Hash)
    if (!bytesEq(new utils.JsVMArgs(it.value.args).jsScript, prjArgs.contributionScript))
      continue;
    let contributionArgs = new utils.ContributionArgs(it.value.args);

    // Not same Project
    if (!bytesEq(args.projectScriptHash, contributionArgs.projectScriptHash))
      continue;
    if (!contributionArgs.deadline.eq(prjArgs.deadline))
      continue;

    if (capacity != undefined) {
      throw Error("There can contribution (same Project) only be one tx");
    }
    capacity = HighLevel.loadCellCapacity(index, bindings.SOURCE_OUTPUT);

    // Check Type Script
    const typeScriptHash = HighLevel.loadCellTypeHash(index, bindings.SOURCE_OUTPUT);
    if (!utils.optionBytesEq(typeScriptHash, prjArgs.contributionType)) {
      throw Error(`Contribution Cell Type error, index: ${index}`);
    }
  }

  let data = HighLevel.loadCellData(0, bindings.SOURCE_GROUP_OUTPUT);
  if (data.byteLength < 16)
    throw Error("Cell Data is not Int128");
  const udt = numFromBytes(data);
  if (udt != capacity) {
    throw Error(`Contribution capacity (${capacity}) not equal to Claim cell data (${udt})`)
  }
}

function checkProjectCell(args: ClaimArgs): utils.PorjectArgs {
  let prjArgs = utils.getProjectArgs(args.projectScriptHash, bindings.SOURCE_CELL_DEP);
  if (prjArgs == undefined) {
    throw Error("Not found Project Cell");
  }

  if (!args.deadline.eq(prjArgs.deadline)) {
    throw Error("Project deadline is not this")
  }
  if (!bytesEq(args.args.jsScript, prjArgs.claimScript)) {
    throw Error("This Script is not in ProjectCell");
  }

  return prjArgs;
}

function checkBacker(args: ClaimArgs): bigint {
  let count = 0n;
  for (const it of new HighLevel.QueryIter((index, source) => {
    let hash = HighLevel.loadCellLockHash(index, source);
    if (!bytesEq(hash, args.backerLockScript))
      return undefined;
    return HighLevel.loadCellCapacity(index, source);
  }, bindings.SOURCE_OUTPUT)) {
    if (it != undefined)
      count += it;
  }

  if (count == 0n) {
    throw "Bakcer not found in outputs";
  }
  return count;
}

function expired(args: ClaimArgs) {
  console.log("Claim Destruction");
  let contributionTotal = 0n;

  for (let index = 0; index < utils.MAX_CELLS; index++) {
    try {
      let scriptArgs = HighLevel.loadCellLock(index, bindings.SOURCE_INPUT).args;
      if (scriptArgs.byteLength < 35)
        continue;
      const jsVmArgs = new utils.JsVMArgs(scriptArgs);
      if (jsVmArgs.jsArgs.byteLength != utils.ContributionArgs.len())
        continue;

      let contributionArgs = new utils.ContributionArgs(jsVmArgs);
      if (!bytesEq(contributionArgs.projectScriptHash, args.projectScriptHash))
        continue;
      contributionTotal += HighLevel.loadCellCapacity(index, bindings.SOURCE_INPUT);
    } catch (err: any) {
      if (err.errorCode === bindings.INDEX_OUT_OF_BOUND) {
        return false;
      } else {
        throw err;
      }
    }
  }

  // for (const it of new HighLevel.QueryIter(
  //   (index, source) => {
  //     let jsVmArgs = utils.JsVMArgs.loadLockJSVmArgs(index, source);
  //     if (jsVmArgs == undefined)
  //       return undefined;
  //     if (jsVmArgs.jsArgs.byteLength != utils.ContributionArgs.len())
  //       return undefined;
  //     let contributionArgs = new utils.ContributionArgs(jsVmArgs);
  //     if (!bytesEq(contributionArgs.projectScriptHash, args.projectScriptHash))
  //       return undefined;
  //     return HighLevel.loadCellCapacity(index, source);
  //   }, bindings.SOURCE_INPUT)
  // ) {
  //   if (it == undefined)
  //     continue;
  //   contributionTotal += it;
  // }

  let claimTotal = 0n;
  for (let it of new HighLevel.QueryIter(HighLevel.loadCellData, bindings.SOURCE_GROUP_INPUT)) {
    if (it.byteLength < 16) {
      throw Error("Unknow Error, output data is not bigint");
    }
    claimTotal += numFromBytes(it.slice(0, 16));
  }
  if (contributionTotal < claimTotal) {
    throw Error(`Insufficient refund amount, need: ${claimTotal}, actual: ${contributionTotal}`);
  }

  for (let it of new HighLevel.QueryIter(HighLevel.loadCellCapacity, bindings.SOURCE_GROUP_INPUT)) {
    claimTotal += it;
  }
  let backerCapacity = checkBacker(args);
  if (claimTotal < backerCapacity) {
    throw Error(`The actual number of refunds was too small. need: ${claimTotal}, actual: ${backerCapacity}`);
  }
}

function main() {
  log.setLevel(log.LogLevel.Debug);
  console.log("Claim Script");

  const status = utils.getScriptStatus();
  const args = new ClaimArgs();

  if (status == ScriptStatus.TRANSACTION) {
    return 0;
  }

  if (utils.checkDeadline(args.deadline)) {
    if (status != ScriptStatus.CREATED) {
      throw Error("Claim cannot be used for transactions.");
    }
    const prjArgs = checkProjectCell(args);
    checkContribution(args, prjArgs);
  } else {
    if (status == ScriptStatus.CREATED) {
      throw Error("Claims cannot be created independently after they expire.");
    }
    expired(args);
  }

  return 0;
}

try {
  bindings.exit(main());
} catch (e) {
  if (e instanceof Error) {
    console.log(`${e.name} : ${e.message}`);
  }
  logError(e);
  bindings.exit(-1);
}
