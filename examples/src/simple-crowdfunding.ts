import { ccc, Hex, OutPoint } from "@ckb-ccc/core";
import dotenv from "dotenv";
import path from "node:path";

import { buildClient, buildSigner } from "../../tests/helper";
import * as shared from "shared"

async function createProject(signer: ccc.SignerCkbPrivateKey, goalAmount: bigint): Promise<Hex> {
  let deadline = new Date();
  deadline.setDate(deadline.getDate() + 7);

  const txHash = await shared.createCrowfunding(signer, goalAmount, deadline, "TODO");
  await signer.client.waitTransaction(txHash);
  return txHash;
}

async function donation(signer: ccc.SignerCkbPrivateKey, projectTxHash: Hex, ckbNum: bigint, waitSuc?: boolean): Promise<Hex> {
  const txHash = await shared.donationToProject(signer, ckbNum, new OutPoint(projectTxHash, 0n));
  if (waitSuc)
    await signer.client.waitTransaction(txHash);
  return txHash
}

async function mergeDonation(signer: ccc.SignerCkbPrivateKey, projectTxHash: Hex, waitSuc?: boolean): Promise<Hex> {

  const projectInfo = await shared.PrjectCellInfo.getByTxHash(signer.client, new OutPoint(projectTxHash, 0n));

  let txHash = await shared.mergeDonation(
    signer, projectInfo.tx, projectInfo.contributionInfo);
  if (waitSuc)
    await signer.client.waitTransaction(txHash);
  return txHash;
}

async function projectSuccess(signer: ccc.SignerCkbPrivateKey, projectTxHash: Hex) {
  const txHash = await shared.crowfundingSuccess(signer, new OutPoint(projectTxHash, 0n));
  await signer.client.waitTransaction(txHash);
  return txHash;
}

async function all(signer: ccc.SignerCkbPrivateKey) {
  const projectTxHash = await createProject(signer, 2000n);
  // const projectTxHash = "0x7f5703f4322eee237e90e9d100febf4dd9547bb0f13425108781728cf511bea8"

  // donation
  let donations = []
  donations.push(await donation(signer, projectTxHash, 400n));
  donations.push(await donation(signer, projectTxHash, 800n));
  donations.push(await donation(signer, projectTxHash, 700n));

  // wait all 
  for (const it of donations) {
    await signer.client.waitTransaction(it);
  }

  // merge
  let donationMerged = await mergeDonation(signer, projectTxHash);
  console.log(`donation (merged) TxHash: ${donationMerged}`);
  const lastDonation = await donation(signer, projectTxHash, 300n);
  donations.push(lastDonation);

  await signer.client.waitTransaction(donationMerged);
  await signer.client.waitTransaction(lastDonation);

  // Success
  const successTxHash = await projectSuccess(signer, projectTxHash);
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

  let infos = await shared.PrjectCellInfo.getAll(signer.client);
  console.log(`${ccc.stringify(infos)}`);

  await all(signer);
}
main();
