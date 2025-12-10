import { ccc, hexFrom, Hex, bytesFrom, } from "@ckb-ccc/core"
import * as shared from "./index"

async function updateSince(signer: ccc.SignerCkbPrivateKey, tx: ccc.Transaction): Promise<ccc.Transaction> {
    // Update Since
    await tx.completeInputsByCapacity(signer);
    
    let now = shared.newSince(-2)   // 2min
    if (shared.getNetwork() != "devnet") {
        now = shared.newSince(-10)  // 10min
    }

    for (let i = 0; i < tx.inputs.length; i++) {
        tx.inputs[i].since = now.toNum();
    }
    return tx;
}

export async function sendTx(
    signer: ccc.SignerCkbPrivateKey, tx: ccc.Transaction
): Promise<Hex> {
    tx = await updateSince(signer, tx);

    // Update Type ID
    let prjCodeHash = shared.projectScript().codeHash;
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

        let typeId = ccc.hashTypeId(tx.inputs[index], index);
        let srcArgs = typeScript.args.slice(2);
        let args =
            "0x" +
            srcArgs.slice(0, 35 * 2) +
            typeId.slice(2) +
            srcArgs.slice((35 + 32) * 2);
        typeScript.args = hexFrom(args);
        tx.outputs[index].type = typeScript;
    }

    tx = await signer.prepareTransaction(tx);

    // Set fee
    let feeRate = 1000n;
    try {
        feeRate = await signer.client.getFeeRate();
    } catch { }
    await tx.completeFeeBy(signer, feeRate);

    // console.log(`${ccc.stringify(tx)}`);
    const txHash = await signer.sendTransaction(tx);
    return txHash;
}