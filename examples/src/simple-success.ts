import { ccc, Hex, OutPoint } from "@ckb-ccc/core";
import dotenv from "dotenv";
import path from "node:path";

import { buildClient, buildSigner } from "../../tests/helper";
import * as shared from "shared"

async function createProject(signer: ccc.SignerCkbPrivateKey, goalAmount: bigint): Promise<OutPoint> {
  let deadline = new Date();
  deadline.setDate(deadline.getDate() + 7);

  const tx = await shared.createCrowfunding(signer, goalAmount, deadline, "TODO");
  await signer.client.waitTransaction(tx.txHash);
  return tx;
}

async function donation(signer: ccc.SignerCkbPrivateKey, projectTx: OutPoint, ckbNum: bigint, waitSuc?: boolean): Promise<Hex> {
  const txHash = await shared.donationToProject(signer, ckbNum, projectTx);
  if (waitSuc)
    await signer.client.waitTransaction(txHash);
  return txHash
}

async function mergeDonation(signer: ccc.SignerCkbPrivateKey, projectTx: OutPoint, waitSuc?: boolean): Promise<Hex> {

  const projectInfo = await shared.ProjectCellInfo.getByTxHash(signer.client, projectTx);

  let txHash = await shared.mergeDonation(
    signer, projectInfo.tx, projectInfo.contributionInfo);
  if (waitSuc)
    await signer.client.waitTransaction(txHash);
  return txHash;
}

async function projectSuccess(signer: ccc.SignerCkbPrivateKey, projectTx: OutPoint) {
  const txHash = await shared.crowfundingSuccess(signer, projectTx);
  await signer.client.waitTransaction(txHash);
  return txHash;
}

async function main() {
  dotenv.config({
    path: path.resolve(__dirname, "../../.env"),
  });

  console.log(`Network : ${shared.getNetwork()}`);

  let client: ccc.Client;
  let signer: ccc.SignerCkbPrivateKey;

  // Create global devnet client and signer for all tests in this describe block
  client = buildClient("devnet");
  signer = buildSigner(client);

  const projectTx = await createProject(signer, 2000n);
  // const projectTxHash = "0x7f5703f4322eee237e90e9d100febf4dd9547bb0f13425108781728cf511bea8"
  console.log(`Create project done, txHash(${projectTx.txHash})`);

  // donation
  let donations = []
  donations.push(await donation(signer, projectTx, 400n));
  donations.push(await donation(signer, projectTx, 800n));
  donations.push(await donation(signer, projectTx, 700n));


  // wait all 
  for (const it of donations) {
    await signer.client.waitTransaction(it);
  }
  console.log(`Donations done: \n${ccc.stringify(donations)}`);

  // merge
  let donationMerged = await mergeDonation(signer, projectTx);
  console.log(`Donation (merged) TxHash: ${donationMerged}`);
  const lastDonation = await donation(signer, projectTx, 300n);
  donations.push(lastDonation);

  await signer.client.waitTransaction(donationMerged);
  await signer.client.waitTransaction(lastDonation);

  // Success
  const successTxHash = await projectSuccess(signer, projectTx);
  console.log(`Success, txHash: ${successTxHash}`)
}
main();
