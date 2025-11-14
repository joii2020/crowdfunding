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
  let iters = new HighLevel.QueryIter(HighLevel.loadCellLock, bindings.SOURCE_INPUT);
  for (let index = 0; index < utils.MAX_CELLS; index++) {
    const it = iters.next();
    if (it.done)
      break;

    // Not Contribution (Code Hash)
    if (!bytesEq(new utils.JsVMArgs(it.value.args).jsScript, args.contributionScript))
      continue;
    let contributionArgs = new utils.ContributionArgs(it.value.args);
    if (!bytesEq(thisScriptHash, contributionArgs.projectScriptHash))
      continue;
    if (!contributionArgs.deadline.eq(args.deadline))
      continue;
    const typeScriptHash = HighLevel.loadCellTypeHash(index, bindings.SOURCE_INPUT);
    if (!utils.optionBytesEq(typeScriptHash, args.contributionType)) {
      throw Error(`Contribution Cell Type error, index: ${index}`);
    }

    totalCapacity += HighLevel.loadCellCapacity(index, bindings.SOURCE_INPUT);
  }

  if (args.goalAmount > totalCapacity) {
    throw Error(`Not enough funds raised, need: ${args.goalAmount}, actual: ${totalCapacity}`);
  }

  let outputIters = new HighLevel.QueryIter(HighLevel.loadCellLockHash, bindings.SOURCE_OUTPUT);
  for (let index = 0; index < utils.MAX_CELLS; index++) {
    const it = outputIters.next();
    if (it.done) {
      break;
    }
    if (!bytesEq(it.value, args.creatorLockScriptHash)) {
      continue;
    }

    let capacity = HighLevel.loadCellCapacity(index, bindings.SOURCE_OUTPUT);
    if (capacity != totalCapacity) {
      continue;
    }
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
