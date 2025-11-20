import { hexFrom, ccc, hashTypeToBytes, Hex, bytesFrom, numLeToBytes, Cell } from "@ckb-ccc/core";
import dotenv from "dotenv";
import path from "node:path";

import scripts from "../../deployment/scripts.json";
import systemScript from "../../deployment/system-scripts.json"
import scriptsPatch from "../../deployment-patch/scripts_patch.json"
import { buildClient, buildSigner } from "../../tests/helper";

import { ProjectArgs, ContributionArgs, ClaimArgs, CKBToShannon, shannonToCKB, sinceFromDate, } from "crowdfunding-helper"

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
    const output = tx.outputs[index];
    if (!output || !output.type)
      continue;
    const typeScript = output.type;
    if (typeScript == undefined || typeScript.args.length < 2 + (35 + 32) * 2)
      continue;
    if (typeScript.args.slice(6, 32 * 2 + 6) != prjCodeHash.slice(2)) {
      continue;
    }
    let typeId = getTypeID(index).slice(0);
    let srcArgs = typeScript.args.slice(2);
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

function updateSince(tx: ccc.Transaction): ccc.Transaction {
  let now = new Date();
  now.setDate(now.getDate() - 1);

  let nowSince = sinceFromDate(now);
  for (let i = 0; i < tx.inputs.length; i++) {
    tx.inputs[i].since = nowSince.toNum();
  }
  return tx;
}

async function sendTx(signer: ccc.SignerCkbPrivateKey, tx: ccc.Transaction): Promise<Hex> {
  await tx.completeInputsByCapacity(signer);
  tx = updateSince(tx);
  tx = updateTypeId(tx);
  tx = await setFee(signer, tx);
  console.log(`${ccc.stringify(tx)}`);
  const txHash = await signer.sendTransaction(tx);

  await signer.client.waitTransaction(txHash);

  return txHash;
}

async function setFee(signer: ccc.SignerCkbPrivateKey, tx: ccc.Transaction): Promise<ccc.Transaction> {
  tx = await signer.prepareTransaction(tx);

  let feeRate = 1000n;
  try {
    feeRate = await signer.client.getFeeRate();
  } catch { }
  await tx.completeFeeBy(signer, feeRate);
  console.log(
    "fee need=",
    tx.estimateFee(feeRate),
    "actual=",
    await tx.getFee(signer.client),
  );

  return tx;
}

async function getProjectCell(client: ccc.Client, txHash: Hex, index: number): Promise<Cell> {
  const cell = await client.getCellLive({ txHash: txHash, index: index });
  if (cell == undefined) {
    throw Error(`Load ProjectCell Failed, txHash: ${txHash}, index: ${index}`);
  }
  return cell;
}

async function createProject(client: ccc.Client, signer: ccc.SignerCkbPrivateKey, goalAmount: bigint): Promise<Hex> {
  const ckbJsVmScript = scriptsPatch.devnet["ckb-js-vm"];
  const projectJsCode = scripts.devnet["project.bc"];
  const contributionJsCode = scripts.devnet["contribution.bc"];
  const claimJsCode = scripts.devnet["claim.bc"];

  const signerLock = (await signer.getRecommendedAddressObj()).script;

  let prjArgs = new ProjectArgs();
  prjArgs.creatorLockScriptHash = signerLock.hash();
  prjArgs.goalAmount = CKBToShannon(goalAmount);
  prjArgs.contributionScript = hexFrom(contributionJsCode.codeHash + hexFrom(hashTypeToBytes(contributionJsCode.hashType)).slice(2));
  prjArgs.claimScript = hexFrom(claimJsCode.codeHash + hexFrom(hashTypeToBytes(claimJsCode.hashType)).slice(2));
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

  const txHash = await sendTx(signer, tx);
  return txHash;
}

async function donation(
  client: ccc.Client,
  signer: ccc.SignerCkbPrivateKey,
  projectTxHash: Hex,
  ckbNum: bigint
): Promise<Hex> {
  const ckbJsVmScript = scriptsPatch.devnet["ckb-js-vm"];
  const contributionJsCode = scripts.devnet["contribution.bc"];
  const claimJsCode = scripts.devnet["claim.bc"];

  const projectCell = await getProjectCell(client, projectTxHash, 0);
  const projectScript = projectCell?.cellOutput.type!;
  const projectArgs = ProjectArgs.fromBytes(bytesFrom(projectScript.args!).slice(35));

  let contributionArgs = new ContributionArgs();
  contributionArgs.projectScript = projectScript.hash();
  contributionArgs.deadline = projectArgs.deadline;

  const outputCapacity = CKBToShannon(ckbNum);
  const contributionScript = {
    codeHash: ckbJsVmScript.codeHash,
    hashType: ckbJsVmScript.hashType,
    args: hexFrom(
      "0x0000" +
      contributionJsCode.codeHash.slice(2) +
      hexFrom(hashTypeToBytes(contributionJsCode.hashType)).slice(2) +
      hexFrom(contributionArgs.toBytes()).slice(2),
    ),
  };

  const usersLock = (await signer.getRecommendedAddressObj()).script;
  let claimArgs = new ClaimArgs();
  claimArgs.projectScript = projectScript.hash();
  claimArgs.deadline = projectArgs.deadline;
  claimArgs.backerLockScript = usersLock.hash();

  const claimScript = {
    codeHash: ckbJsVmScript.codeHash,
    hashType: ckbJsVmScript.hashType,
    args: hexFrom(
      "0x0000" +
      claimJsCode.codeHash.slice(2) +
      hexFrom(hashTypeToBytes(claimJsCode.hashType)).slice(2) +
      hexFrom(claimArgs.toBytes()).slice(2),
    ),
  };

  let tx = ccc.Transaction.from({
    outputs: [
      {
        lock: contributionScript,
        type: null,
        capacity: outputCapacity,
      },
      {
        lock: usersLock,
        type: claimScript,
      },
    ],
    outputsData: [
      "0x",
      numLeToBytes(outputCapacity, 16)
    ],
    cellDeps: [
      ...ckbJsVmScript.cellDeps.map((c) => c.cellDep),
      ...contributionJsCode.cellDeps.map((c) => c.cellDep),
      ...claimJsCode.cellDeps.map((c) => c.cellDep),
      {
        outPoint: {
          txHash: projectTxHash,
          index: 0,
        },
        depType: "code"
      },
    ],
  });

  const txHash = await sendTx(signer, tx);
  return txHash;
}

async function mergeDonation(client: ccc.Client, signer: ccc.SignerCkbPrivateKey, projectTxHash: Hex): Promise<Hex> {
  const ckbJsVmScript = scriptsPatch.devnet["ckb-js-vm"];
  const contributionJsCode = scripts.devnet["contribution.bc"];

  const projectCell = await getProjectCell(client, projectTxHash, 0);
  const projectScript = projectCell?.cellOutput.type!;
  const projectArgs = ProjectArgs.fromBytes(bytesFrom(projectScript.args!).slice(35));

  let contributionArgs = new ContributionArgs();
  contributionArgs.projectScript = projectScript.hash();
  contributionArgs.deadline = projectArgs.deadline;

  const contributionScript = {
    codeHash: ckbJsVmScript.codeHash,
    hashType: ckbJsVmScript.hashType,
    args: hexFrom(
      "0x0000" +
      contributionJsCode.codeHash.slice(2) +
      hexFrom(hashTypeToBytes(contributionJsCode.hashType)).slice(2) +
      hexFrom(contributionArgs.toBytes()).slice(2),
    ),
  };

  let donations = []
  let totalCapacity = 0n;
  let inputs = [];
  for await (const cell of client.findCellsByLock(contributionScript)) {
    totalCapacity += cell.cellOutput.capacity;
    inputs.push({ outPoint: cell.outPoint });
    donations.push(cell);
  }

  if (donations.length == 1) {
    console.log(`Only one, no need to merge, TxHash: ${donations[0].outPoint.txHash}`);
    return donations[0].outPoint.txHash;
  }

  // Merge All
  let tx = ccc.Transaction.from({
    inputs: inputs,
    outputs: [
      {
        lock: contributionScript,
        type: null,
        capacity: totalCapacity,
      },
    ],
    cellDeps: [
      ...ckbJsVmScript.cellDeps.map((c) => c.cellDep),
      ...contributionJsCode.cellDeps.map((c) => c.cellDep),
      {
        outPoint: {
          txHash: projectTxHash,
          index: 0,
        },
        depType: "code"
      },
    ],
  });

  const txHash = await sendTx(signer, tx);
  return txHash;
}

async function projectSuccess(client: ccc.Client, signer: ccc.SignerCkbPrivateKey, projectTxHash: Hex) {
  const ckbJsVmScript = scriptsPatch.devnet["ckb-js-vm"];
  const projectJsCode = scripts.devnet["project.bc"];
  const contributionJsCode = scripts.devnet["contribution.bc"];

  const projectCell = await getProjectCell(client, projectTxHash, 0);
  const projectScript = projectCell?.cellOutput.type!;
  const projectArgs = ProjectArgs.fromBytes(bytesFrom(projectScript.args!).slice(35));

  console.log(`Project Cell: ${ccc.stringify(projectCell)}`);

  let contributionArgs = new ContributionArgs();
  contributionArgs.projectScript = projectScript.hash();
  contributionArgs.deadline = projectArgs.deadline;

  const contributionScript = {
    codeHash: ckbJsVmScript.codeHash,
    hashType: ckbJsVmScript.hashType,
    args: hexFrom(
      "0x0000" +
      contributionJsCode.codeHash.slice(2) +
      hexFrom(hashTypeToBytes(contributionJsCode.hashType)).slice(2) +
      hexFrom(contributionArgs.toBytes()).slice(2),
    ),
  };

  let donations = []
  let totalCapacity = 0n;
  let inputs = [];
  for await (const cell of client.findCellsByLock(contributionScript)) {
    totalCapacity += cell.cellOutput.capacity;
    inputs.push({ outPoint: cell.outPoint });
    donations.push(cell);
  }

  if (totalCapacity < projectArgs.goalAmount) {
    throw Error("Capacity is not enough");
  }
  console.log(`Total: ${totalCapacity}, Project need: ${projectArgs.goalAmount}`);

  inputs.push({ outPoint: projectCell.outPoint })

  const signerLock = (await signer.getRecommendedAddressObj()).script;

  let tx = ccc.Transaction.from({
    inputs: inputs,
    outputs: [
      {
        lock: signerLock,
        type: null,
        capacity: totalCapacity,
      },
      {
        lock: signerLock,
        type: null,
        capacity: projectCell.cellOutput.capacity,
      },
    ],
    cellDeps: [
      ...ckbJsVmScript.cellDeps.map((c) => c.cellDep),
      ...projectJsCode.cellDeps.map((c) => c.cellDep),
      ...contributionJsCode.cellDeps.map((c) => c.cellDep),
    ],
  });

  const txHash = await sendTx(signer, tx);
  return txHash;
}

async function all(client: ccc.Client, signer: ccc.SignerCkbPrivateKey) {
  // const projectTxHash = await createProject(client, signer, 2000n);
  const projectTxHash = "0xa677021904dee049600b2c9d50020192518413878505e2d390be107628327222"
  console.log(`Project Tx Hash: ${projectTxHash}`);

  // donation
  let donations = []
  donations.push(await donation(client, signer, projectTxHash, 400n));
  donations.push(await donation(client, signer, projectTxHash, 800n));
  donations.push(await donation(client, signer, projectTxHash, 700n));

  // merge
  let donationMerged = await mergeDonation(client, signer, projectTxHash);
  console.log(`donation (merged) TxHash: ${donationMerged}`);
  donations.push(await donation(client, signer, projectTxHash, 300n));

  // Success
  const successTxHash = await projectSuccess(client, signer, projectTxHash);
  console.log(`Success, txHash: ${successTxHash}`)
}

async function main() {
  dotenv.config({
    path: path.resolve(__dirname, "../../.env"),
  });

  let client: ccc.Client;
  let signer: ccc.SignerCkbPrivateKey;

  // Create global devnet client and signer for all tests in this describe block
  client = buildClient("devnet");
  signer = buildSigner(client);

  await all(client, signer);
}
main();
