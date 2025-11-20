import * as bindings from "@ckb-js-std/bindings";
import { HighLevel, log, logError, numFromBytes, bytesEq } from "@ckb-js-std/core";
import * as utils from "../../../libs/utils"
import { PorjectArgs, ScriptStatus } from "../../../libs/utils"

function create(args: PorjectArgs) {
  console.log("Create crowdfunding");

  if (args.goalAmount === 0n) {
    throw Error("Args goalAmount is not 0");
  }
}

function success(args: PorjectArgs) {
  console.log("Crowdfunding success");

  let totalCapacity = 0n;

  let thisScriptHash = HighLevel.loadScriptHash();
  for (const it of new HighLevel.QueryIter((index, source) => {
    let lockScript = HighLevel.loadCellLock(index, source);

    // Not Contribution (Code Hash)
    if (!bytesEq(new utils.JsVMArgs(lockScript.args).jsScript, args.contributionScript))
      return null;
    let contributionArgs = new utils.ContributionArgs(lockScript.args);
    if (!bytesEq(thisScriptHash, contributionArgs.projectScriptHash))
      return null;
    if (!contributionArgs.deadline.eq(args.deadline))
      return null;
    let typeScriptHash = HighLevel.loadCellTypeHash(index, source);
    if (typeScriptHash == null) {
      typeScriptHash = new ArrayBuffer(32);
    }
    if (!utils.optionBytesEq(typeScriptHash, args.contributionType)) {
      throw Error(`Contribution Cell Type error, index: ${index}`);
    }
    return HighLevel.loadCellCapacity(index, source);
  }, bindings.SOURCE_INPUT)) {
    if (it == null)
      continue;
    totalCapacity += it;
  }

  if (args.goalAmount > totalCapacity) {
    throw Error(`Not enough funds raised, need: ${args.goalAmount}, actual: ${totalCapacity}`);
  }

  for (const it of new HighLevel.QueryIter((index, source) => {
    let lockHash = HighLevel.loadCellLockHash(index, source);
    if (!bytesEq(lockHash, args.creatorLockScriptHash))
      return null;

    return HighLevel.loadCellCapacity(index, source);
  }, bindings.SOURCE_OUTPUT)) {
    if (it == null)
      continue;
    if (it == totalCapacity)
      return;
  }
  throw Error("After success, the funds need to be transferred to the designated account");
}

function fail(args: PorjectArgs) {
  // not on output

  let thisScriptHash = HighLevel.loadScriptHash();

  for (let it of new HighLevel.QueryIter(HighLevel.loadCellTypeHash, bindings.SOURCE_OUTPUT)) {
    if (utils.optionBytesEq(it, thisScriptHash)) {
      throw Error("After expiration, only the Project Cell can be destroyed");
    }
  }
}

function main() {
  log.setLevel(log.LogLevel.Debug);
  console.log("Project Script");

  HighLevel.checkTypeId(35);
  const status = utils.getScriptStatus();
  let args = new PorjectArgs();

  if (utils.checkDeadline(args.deadline)) {
    if (status == ScriptStatus.CREATED) {
      create(args);
    } else if (status == ScriptStatus.DESTROYED) {
      success(args);
    } else {
      throw Error("Project does not allow transactions ");
    }
  } else {
    if (status == ScriptStatus.DESTROYED) {
      fail(args);
    } else {
      throw Error("After Deadline, it can only be destroyed.");
    }
  }

  return 0;
}

try {
  bindings.exit(main());
} catch (e) {
  if (e instanceof Error) {
    console.log(`Error ${e.name} : ${e.message}`);
  }
  logError(e);
  bindings.exit(-1);
}
