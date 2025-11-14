import * as bindings from "@ckb-js-std/bindings";
import { bytesEq, HighLevel, log, logError } from "@ckb-js-std/core";

import { ContributionArgs, PorjectArgs, ScriptStatus } from "../../../libs/utils"
import * as utils from "../../../libs/utils"

function success(prjArgs: PorjectArgs) {
  console.log("Crowdfunding Success");

  let thisTypeHash: ArrayBuffer | null = prjArgs.contributionType;
  if (bytesEq(thisTypeHash, new Uint8Array(32).buffer)) {
    thisTypeHash = null;
  }

  let thisScriptHash = HighLevel.loadScriptHash();
  let iters = new HighLevel.QueryIter(HighLevel.loadCellLockHash, bindings.SOURCE_OUTPUT);
  for (let it of iters) {
    if (bytesEq(thisScriptHash, it)) {
      throw Error("Contribution must be destroyed after success");
    }
  }
}

function merge(args: ContributionArgs, prjArgs: PorjectArgs) {
  console.log("Merge Cell");

  const thisScriptHash = HighLevel.loadScriptHash();

  let inputCapacity = 0n;
  for (const it of new HighLevel.QueryIter(HighLevel.loadCellCapacity, bindings.SOURCE_GROUP_INPUT)) {
    inputCapacity += it;
  }

  let thisTypeHash: ArrayBuffer | null = prjArgs.contributionType;
  if (bytesEq(thisTypeHash, new Uint8Array(32).buffer)) {
    thisTypeHash = null;
  }

  // Check Type ScriptHash
  for (const it of new HighLevel.QueryIter(HighLevel.loadCellTypeHash, bindings.SOURCE_GROUP_INPUT)) {
    if (!utils.optionBytesEq(it, thisTypeHash)) {
      throw Error("Inputs Type Script error");
    }
  }

  let outputCapacity = 0n;
  for (let i = 0; i < utils.MAX_CELLS; i++) {
    try {
      let lockScriptHash = HighLevel.loadCellLockHash(i, bindings.SOURCE_OUTPUT);
      if (bytesEq(lockScriptHash, thisScriptHash)) {
        if (outputCapacity != 0n) {
          throw Error("Merge's output is allowed to exist only once");
        }
        outputCapacity = HighLevel.loadCellCapacity(i, bindings.SOURCE_OUTPUT);

        let typeScriptHash = HighLevel.loadCellTypeHash(i, bindings.SOURCE_OUTPUT);
        if (!utils.optionBytesEq(typeScriptHash, thisTypeHash)) {
          throw Error("Output Type Script error");
        }
      }
    } catch (err: any) {
      if (err.errorCode === bindings.INDEX_OUT_OF_BOUND) {
        break;
      } else {
        throw err;
      }
    }
  }

  if (inputCapacity !== outputCapacity) {
    throw Error(`The total input capacity (${inputCapacity}) is not equal to the output capacity(${outputCapacity})`)
  }
}

function checkProjectCell(args: ContributionArgs): [utils.PorjectArgs, boolean] {
  let inCellDeps!: boolean;

  let prjArgs = utils.getProjectArgs(args.projectScriptHash, bindings.SOURCE_CELL_DEP);
  if (prjArgs == undefined) {
    prjArgs = utils.getProjectArgs(args.projectScriptHash, bindings.SOURCE_INPUT);
    if (prjArgs == undefined) {
      throw Error("Not found Project Cell");
    }
    inCellDeps = false;
  } else {
    inCellDeps = true;
  }

  if (!args.deadline.eq(prjArgs.deadline)) {
    throw Error("Project deadline is not this")
  }
  if (!bytesEq(args.args.jsScript, prjArgs.contributionScript)) {
    throw Error("This Script is not in ProjectCell");
  }

  return [prjArgs, inCellDeps];
}

function main() {
  log.setLevel(log.LogLevel.Debug);
  console.log("Contribution Script");

  let args = new ContributionArgs();
  if (utils.checkDeadline(args.deadline)) {
    let [prjArgs, inCellDeps] = checkProjectCell(args);

    if (!inCellDeps) {
      success(prjArgs);
    } else {
      merge(args, prjArgs);
    }
  } else {
    console.log("deadline timeout");
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
