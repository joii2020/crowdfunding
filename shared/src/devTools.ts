import { ccc, Hex, hexFrom, } from "@ckb-ccc/core"
import * as shared from "./index"

export async function createProject(
    signer: ccc.SignerCkbPrivateKey,
    deadline?: Date,
): Promise<Hex> {
    if (deadline == undefined)
        deadline = new Date(Date.now() + 3 * 60 * 1000); // Default : 3min

    const prjOutpoint = await shared.createCrowfunding(signer, 3000n, deadline, '');
    await signer.client.waitTransaction(prjOutpoint.txHash);

    let donatoinTx: Hex[] = [];
    donatoinTx.push(await shared.donationToProject(signer, 1000n, prjOutpoint));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    donatoinTx.push(await shared.donationToProject(signer, 1000n, prjOutpoint));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    donatoinTx.push(await shared.donationToProject(signer, 800n, prjOutpoint));

    for (const tx of donatoinTx) {
        await signer.client.waitTransaction(tx);
    }

    return hexFrom(prjOutpoint.txHash);
}
