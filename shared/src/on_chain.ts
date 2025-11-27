import { ccc, hexFrom, hashTypeToBytes, Hex, Cell } from "@ckb-ccc/core"

import { ProjectArgs, ContributionArgs, sinceToDate, sinceFromDate, shannonToCKB, CKBToShannon, joinHex, getCellByJsType as getCellByType } from "./index"

import scripts from "artifacts/deployment/scripts.json";
import systemScript from "artifacts/deployment/system-scripts.json"
import scriptsPatch from "artifacts/deployment-patch/scripts_patch.json"

export class PrjectCellInfo {
    public txHash!: Hex;
    public txIndex!: bigint;
    public typeId!: Hex;
    public raised!: bigint;
    public goal!: bigint;
    public deadline!: Date;
    public status!: "Active" | "ReadyFinish" | "Expired";
    public owner!: boolean;
    public contributionInfo!: ContributionCellInfo[];

    static async newByCell(signer: ccc.SignerCkbPrivateKey, cell: Cell): Promise<PrjectCellInfo> {
        let projectScript = cell.cellOutput.type!;
        const prjArgs = ProjectArgs.fromBytes(ccc.bytesFrom(projectScript.args!).slice(35));
        let info = new PrjectCellInfo();

        info.txHash = cell.outPoint.txHash;
        info.txIndex = cell.outPoint.index;
        info.typeId = prjArgs.typeID;

        info.goal = shannonToCKB(prjArgs.goalAmount);
        if (prjArgs.deadline instanceof Date) {
            info.deadline = prjArgs.deadline;
        } else {
            info.deadline = sinceToDate(prjArgs.deadline);
        }
        let lockScriptHash = cell.cellOutput.lock.hash();
        const usersLockHash = (await signer.getRecommendedAddressObj()).script.hash();
        info.owner = lockScriptHash === usersLockHash;

        const cInfos = await ContributionCellInfo.getAll(signer, info);
        info.contributionInfo = cInfos;
        let totalAmount = 0n;
        for (const it of cInfos) {
            totalAmount += it.capacity;
        }
        info.raised = shannonToCKB(totalAmount);

        if (info.raised >= info.goal) {
            info.status = "ReadyFinish"
        } else {
            if (info.deadline <= new Date())
                info.status = "Expired"
            else
                info.status = "Active";
        }
        return info;
    }

    static async getAll(signer: ccc.SignerCkbPrivateKey): Promise<PrjectCellInfo[]> {
        let cells = getCellByType(signer.client, hexFrom(scripts.devnet["project.bc"].codeHash));

        let infos: PrjectCellInfo[] = [];
        for await (const cell of cells) {
            const info = await this.newByCell(signer, cell);
            infos.push(info);
        }

        return infos;
    }

    static async getByTxHash(signer: ccc.SignerCkbPrivateKey, txHash: Hex, txIndex: bigint): Promise<PrjectCellInfo> {
        let cell = await getCellByTxHash(signer.client, txHash, txIndex);
        return PrjectCellInfo.newByCell(signer, cell);
    }
}

export class ContributionCellInfo {
    public projectScriptHash!: Hex;
    public scriptHash!: Hex;
    public capacity!: bigint;

    static async getAll(
        signer: ccc.SignerCkbPrivateKey, projectInfo: PrjectCellInfo
    ): Promise<ContributionCellInfo[]> {
        let args = new ContributionArgs();

        let cell = await getCellByTxHash(signer.client, projectInfo.txHash, projectInfo.txIndex);
        args.projectScript = cell.cellOutput.type!.hash();
        args.deadline = projectInfo.deadline;
        args.claimScript =
            joinHex(
                hexFrom(scripts.devnet["claim.bc"].codeHash),
                hexFrom(hashTypeToBytes(scripts.devnet["claim.bc"].hashType))
            );
        const contributionScript = {
            codeHash: scriptsPatch.devnet["ckb-js-vm"].codeHash,
            hashType: scriptsPatch.devnet["ckb-js-vm"].hashType,
            args: joinHex(
                "0x0000",
                hexFrom(scripts.devnet["contribution.bc"].codeHash),
                hexFrom(hashTypeToBytes(scripts.devnet["contribution.bc"].hashType)),
                hexFrom(args.toBytes()),
            ),
        };

        let infos: ContributionCellInfo[] = [];
        for await (const cell of signer.client.findCellsByLock(contributionScript)) {
            let info = new ContributionCellInfo();
            info.projectScriptHash = args.projectScript;
            info.scriptHash = cell.cellOutput.lock.hash();
            info.capacity = cell.cellOutput.capacity;

            infos.push(info);
        }
        return infos;
    }
}

function updateTypeId(tx: ccc.Transaction): ccc.Transaction {
    let prjCodeHash = scripts.devnet["project.bc"].codeHash;
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

async function setFee(signer: ccc.SignerCkbPrivateKey, tx: ccc.Transaction): Promise<ccc.Transaction> {
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

async function sendTx(
    signer: ccc.SignerCkbPrivateKey, tx: ccc.Transaction
): Promise<Hex> {
    await tx.completeInputsByCapacity(signer);
    tx = updateSince(tx);
    tx = updateTypeId(tx);

    tx = await signer.prepareTransaction(tx);
    tx = await setFee(signer, tx);
    console.log(`${ccc.stringify(tx)}`);
    const txHash = await signer.sendTransaction(tx);
    return txHash;
}

export async function createCrowfunding(
    signer: ccc.SignerCkbPrivateKey,
    goal: bigint,
    deadline: Date,
    description: String
): Promise<PrjectCellInfo> {
    const signerLock = (await signer.getRecommendedAddressObj()).script;

    const ckbJsVmScript = scriptsPatch.devnet["ckb-js-vm"];
    const projectJsCode = scripts.devnet["project.bc"];
    const contributionJsCode = scripts.devnet["contribution.bc"];
    const claimJsCode = scripts.devnet["claim.bc"];

    let prjArgs = new ProjectArgs();
    prjArgs.creatorLockScriptHash = signerLock.hash();
    prjArgs.goalAmount = CKBToShannon(goal);
    prjArgs.contributionScript = hexFrom(contributionJsCode.codeHash + hexFrom(hashTypeToBytes(contributionJsCode.hashType)).slice(2));
    prjArgs.claimScript = hexFrom(claimJsCode.codeHash + hexFrom(hashTypeToBytes(claimJsCode.hashType)).slice(2));
    prjArgs.deadline = deadline;
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
        outputsData: [
            hexFrom(Buffer.from(description.toString(), "utf8")),
        ],
        cellDeps: [
            ...ckbJsVmScript.cellDeps.map((c) => c.cellDep),
            ...projectJsCode.cellDeps.map((c) => c.cellDep),
        ],
    });

    const txHash = await sendTx(signer, tx);
    // return txHash;

    return new PrjectCellInfo();
}

export async function getCellByTxHash(client: ccc.Client, txHash: Hex, index: number | bigint): Promise<Cell> {
    console.log(`Load cell by txHash: ${txHash}`);
    for (let i = 0; i < 10; i++) {
        const cell = await client.getCellLive({ txHash: txHash, index: index });
        if (cell != undefined)
            return cell;
        if (i < 2)
            await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw Error(`Load ProjectCell Failed, txHash: ${txHash}, index: ${index}`);
}

// export async function getCellByTypeHash(client: ccc.Client, hash: Hex): Promise<Cell> {
//     client.findCellsPaged
// }
