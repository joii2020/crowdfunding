import { hexFrom, Transaction, Hex, numLeToBytes } from "@ckb-ccc/core";
import { Resource, Verifier } from "ckb-testtool";
import { ProjectArgs } from "crowdfunding-helper"

import { TxHelper } from "./tx-helper.mock";
import { scriptProject } from "./helper";

async function createSuccess() {
  let helper = new TxHelper();

  const userLock = helper.createAlwaySuc("UserLock");
  const input_0 = helper.resource.mockCell(userLock);

  const prjLock = helper.createAlwaySuc("Project");
  let prjArgs = new ProjectArgs();
  prjArgs.goalAmount = 1000000n;
  const prjScript = helper.createJsScript(scriptProject, prjArgs.toBytes());

  const output_0 = Resource.createCellOutput(prjLock, prjScript);
  const output_1 = Resource.createCellOutput(userLock);

  let tx = Transaction.from({
    inputs: [input_0],
    outputs: [output_0, output_1],
    outputsData: [hexFrom("0x"), hexFrom("0x")],
  });
  tx = TxHelper.updateSince(tx);
  tx = helper.updateScriptDeps(tx);
  tx = helper.setTypeID(tx, prjScript.hash(), 0, true);

  const verifier = Verifier.from(helper.resource, tx);
  verifier.verifySuccess(true);
}

describe("unit test create", () => {
  test("createSuccess", () => {
    createSuccess();
  });
});
