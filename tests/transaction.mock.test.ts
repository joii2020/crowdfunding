import { hexFrom, Transaction, stringify, numLeToBytes, hashCkb, hashTypeToBytes } from "@ckb-ccc/core";
import { Resource, Verifier, } from "ckb-testtool";

import * as misc from "./misc.mock"
import { TxHelper, generateRandHash, joinHex } from "./tx-helper.mock";


async function donationSuccess() {
  let helper = new TxHelper();

  const inputCapacity = misc.CKBToShannon(1001n);

  const userLock1 = helper.createAlwaySuc("UserLock1");
  const input_0 = helper.resource.mockCell(userLock1, undefined, undefined, inputCapacity);
  const contributionType = helper.createAlwaySuc("contributionType");

  let prjArgs = new misc.ProjectArgs();
  prjArgs.typeID = generateRandHash();
  prjArgs.contributionType = contributionType.hash();
  prjArgs.contributionScript =
    joinHex(
      hashCkb(helper.appendCell(misc.scriptContribution).outputData),
      hexFrom(hashTypeToBytes("data2")));
  prjArgs.claimScript =
    joinHex(
      hashCkb(helper.appendCell(misc.scriptClaim).outputData),
      hexFrom(hashTypeToBytes("data2")));

  const prjLock = helper.createAlwaySuc("Project");
  const prjScript = helper.createJsScript(misc.scriptProject, prjArgs.toBytes());
  const prjDeps = Resource.createCellDep(helper.resource.mockCell(prjLock, prjScript), "code");

  let contributionArgs = new misc.ContributionArgs();
  contributionArgs.projectScript = prjScript.hash();
  contributionArgs.deadline = prjArgs.deadline;

  let claimArgs = new misc.ClaimArgs()
  claimArgs.projectScript = prjScript.hash();
  claimArgs.deadline = prjArgs.deadline;

  const outputCapacity = misc.CKBToShannon(1000n);
  const contributionScript = helper.createJsScript(misc.scriptContribution, contributionArgs.toBytes());
  const output_0 = Resource.createCellOutput(contributionScript, contributionType, outputCapacity);

  const userLock2 = helper.createAlwaySuc("UserLock2");
  const claimScript = helper.createJsScript(misc.scriptClaim, claimArgs.toBytes());
  const output_1 = Resource.createCellOutput(userLock2, claimScript);

  let tx = Transaction.from({
    inputs: [
      input_0,
    ],
    outputs: [
      output_0,
      output_1,
    ],
    outputsData: [
      hexFrom("0x"),
      hexFrom(numLeToBytes(outputCapacity, 16)),
    ],
  });

  tx = TxHelper.updateSince(tx);
  tx = helper.updateScriptDeps(tx);
  tx.addCellDeps([prjDeps,]);

  const verifier = Verifier.from(helper.resource, tx);
  verifier.verifySuccess(true);
}

async function mergeContributionSuccess() {
  let helper = new TxHelper();

  const defTypeScript = helper.createAlwaySuc("Def");
  const defScript = helper.createAlwaySuc("Def Script");

  let prjArgs = new misc.ProjectArgs();
  prjArgs.typeID = generateRandHash();
  prjArgs.contributionType = defTypeScript.hash();
  prjArgs.contributionScript =
    joinHex(
      hashCkb(helper.appendCell(misc.scriptContribution).outputData),
      hexFrom(hashTypeToBytes("data2")));
  prjArgs.claimScript =
    joinHex(
      hashCkb(helper.appendCell(misc.scriptClaim).outputData),
      hexFrom(hashTypeToBytes("data2")));

  const prjLock = helper.createAlwaySuc("Project");
  const prjScript = helper.createJsScript(misc.scriptProject, prjArgs.toBytes());
  const prjDeps = Resource.createCellDep(helper.resource.mockCell(prjLock, prjScript), "code");

  let contributionArgs = new misc.ContributionArgs();
  contributionArgs.projectScript = prjScript.hash();
  contributionArgs.deadline = prjArgs.deadline;
  const contributionScript = helper.createJsScript(misc.scriptContribution, contributionArgs.toBytes());

  const capacity_0 = 100000000n;
  const capacity_1 = 200000000n;
  const capacity_2 = 200000000n;
  const capacity_3 = 200000000n;

  const input_fee = helper.resource.mockCell(defScript, undefined, "0x", 100000n); // fee
  const input_0 = helper.resource.mockCell(contributionScript, defTypeScript, "0x", capacity_0);
  const input_1 = helper.resource.mockCell(contributionScript, defTypeScript, "0x", capacity_1);
  const input_2 = helper.resource.mockCell(contributionScript, defTypeScript, "0x", capacity_2);
  const input_3 = helper.resource.mockCell(contributionScript, defTypeScript, "0x", capacity_3);

  const output_change = Resource.createCellOutput(defScript, undefined, 80000n); // change
  const output_0 = Resource.createCellOutput(contributionScript, defTypeScript, capacity_0 + capacity_1 + capacity_2 + capacity_3);

  let tx = Transaction.from({
    inputs: [
      input_fee,
      input_0,
      input_1,
      input_2,
      input_3,
    ],
    outputs: [
      output_change,
      output_0,
    ],
    outputsData: [
      hexFrom("0x"),
      hexFrom("0x"),
    ],
  });

  tx = TxHelper.updateSince(tx);
  tx = helper.updateScriptDeps(tx);
  tx.addCellDeps([prjDeps,]);

  const verifier = Verifier.from(helper.resource, tx);
  verifier.verifySuccess(true);
}

describe("unit test transaction", () => {
  test("donationSuccess", () => {
    donationSuccess();
  });
  test("mergeContributionSuccess", () => {
    mergeContributionSuccess();
  });
});
