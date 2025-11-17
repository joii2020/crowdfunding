import { hexFrom, ccc, hashTypeToBytes, Hex } from "@ckb-ccc/core";
import scripts from "../deployment/scripts.json";
import systemScripts from "../deployment/system-scripts.json";
import { buildClient, buildSigner } from "./helper";

import scriptsPatch from "../deployment-patch/scripts_patch.json"

import * as misc from "./misc.mock";
import { bigInt } from "@ckb-js-std/core/dist/molecule/codec";

function updateTypeId(tx: ccc.Transaction): ccc.Transaction {
  let prjCodeHash = scripts.devnet["project.bc"].codeHash;
  let getTypeID = (index: number) => {
    let input = tx.inputs[index];

    let hasher = new ccc.HasherCkb();

    hasher.update(input.toBytes());
    hasher.update(ccc.numLeToBytes(index, 8));

    return hasher.digest();
  };

  for (let index = 0; index < tx.inputs.length; index++) {
    const typeScript = tx.outputs[index].type;
    if (typeScript == undefined || typeScript.args.length < 2 + (35 + 32) * 2)
      continue;
    if (typeScript.args.slice(6, 32 * 2 + 6) != prjCodeHash.slice(2)) {
      continue;
    }
    let typeId = getTypeID(index).slice(0);
    let srcArgs = typeScript.args.slice(2);

    // console.log(`typeID : ${typeId}`);

    let args =
      "0x" +
      srcArgs.slice(0, 35 * 2) +
      typeId.slice(2) +
      srcArgs.slice((35 + 32) * 2);
    typeScript.args = hexFrom(args);
    tx.outputs[index].type = typeScript;
  }

  return tx;
}

function sinceFromDate(date: Date): ccc.Since {
  const unixMs = BigInt(date.getTime());
  const unixSeconds = unixMs / 1000n;

  const value = ccc.numFrom(unixSeconds);

  return new ccc.Since(
    "absolute",
    "timestamp",
    value,
  );
}

function updateSince(tx: ccc.Transaction): ccc.Transaction {
  let now = new Date();
  now.setDate(now.getDate() - 1);

  let nowSince = sinceFromDate(now);
  // 
  for (let i = 0; i < tx.inputs.length; i++) {
    tx.inputs[i].since = nowSince.toNum();
  }
  return tx;
}

async function createProject(client: ccc.Client, signer: ccc.SignerCkbPrivateKey): Promise<Hex> {
  const ckbJsVmScript = scriptsPatch.devnet["ckb-js-vm"];
  const projectJsCode = scripts.devnet["project.bc"];

  let prjArgs = new misc.ProjectArgs();
  prjArgs.goalAmount = 100n;

  const prjScript = {
    codeHash: ckbJsVmScript.codeHash,
    hashType: ckbJsVmScript.hashType,
    args: hexFrom(
      "0x0000" +
      projectJsCode.codeHash.slice(2) +
      hexFrom(hashTypeToBytes(projectJsCode.hashType)).slice(2) +
      hexFrom(prjArgs.toBytes()).slice(2),
    ),
  };

  const signerLock = (await signer.getRecommendedAddressObj()).script;
  const toLock = {
    codeHash: signerLock.codeHash,
    hashType: signerLock.hashType,
    args: signerLock.args,
  };

  let tx = ccc.Transaction.from({
    outputs: [
      {
        lock: toLock,
        type: prjScript,
      },
    ],
    cellDeps: [
      ...ckbJsVmScript.cellDeps.map((c) => c.cellDep),
      ...projectJsCode.cellDeps.map((c) => c.cellDep),
    ],
  });

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 1000);
  tx = updateSince(tx);
  tx = updateTypeId(tx);
  const txHash = await signer.sendTransaction(tx);
  return txHash;
}

async function donation(client: ccc.Client, signer: ccc.SignerCkbPrivateKey, projectTxHash: Hex, ckbNum: bigint) {
  // 从Txhash获取Project相关信息
  

}

async function all(client: ccc.Client, signer: ccc.SignerCkbPrivateKey) {
  const projectTxHash = await createProject(client, signer);
  console.log(`Project Tx Hash: ${projectTxHash}`);

  // donation
  const donation1 = await donation(client, signer, projectTxHash, 100n);
  const donation2 = await donation(client, signer, projectTxHash, 200n);
  const donation3 = await donation(client, signer, projectTxHash, 300n);

  // merge

}

describe("devnet-contract", () => {
  let client: ccc.Client;
  let signer: ccc.SignerCkbPrivateKey;

  beforeAll(() => {
    // Create global devnet client and signer for all tests in this describe block
    client = buildClient("devnet");
    signer = buildSigner(client);
  });

  test("all", async () => {
    // await all(client, signer);
  });
});
