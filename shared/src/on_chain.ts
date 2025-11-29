import { ccc, hexFrom, hashTypeToBytes, Hex, Cell, OutPoint, SignerCkbPrivateKey } from "@ckb-ccc/core"

import { ProjectArgs, ContributionArgs, sinceToDate, sinceFromDate, shannonToCKB, CKBToShannon, joinHex, getCellByJsType as getCellByType, ClaimArgs } from "./index"

import scripts from "artifacts/deployment/scripts.json";
import systemScript from "artifacts/deployment/system-scripts.json"
import scriptsPatch from "artifacts/deployment-patch/scripts_patch.json"

export class PrjectCellInfo {
    public tx!: OutPoint;
    public lockScriptHash!: Hex;
    public typeId!: Hex;
    public raised!: bigint;
    public goal!: bigint;
    public deadline!: Date;
    public status!: "Active" | "ReadyFinish" | "Expired";
    public contributionInfo!: ContributionCellInfo[];

    static async newByCell(client: ccc.Client, cell: Cell): Promise<PrjectCellInfo> {
        let projectScript = cell.cellOutput.type!;
        const prjArgs = ProjectArgs.fromBytes(ccc.bytesFrom(projectScript.args!).slice(35));
        let info = new PrjectCellInfo();

        info.tx = new OutPoint(cell.outPoint.txHash, cell.outPoint.index);
        info.typeId = prjArgs.typeID;

        info.goal = prjArgs.goalAmount;
        if (prjArgs.deadline instanceof Date) {
            info.deadline = prjArgs.deadline;
        } else {
            info.deadline = sinceToDate(prjArgs.deadline);
        }
        let lockScriptHash = cell.cellOutput.lock.hash();
        info.lockScriptHash = lockScriptHash;

        const cInfos = await ContributionCellInfo.getAll(client, info);
        info.contributionInfo = cInfos;
        let totalAmount = 0n;
        for (const it of cInfos) {
            totalAmount += it.capacity;
        }
        info.raised = totalAmount;

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

    static async getAll(client: ccc.Client): Promise<PrjectCellInfo[]> {
        let cells = getCellByType(client, hexFrom(scripts.devnet["project.bc"].codeHash));

        let infos: PrjectCellInfo[] = [];
        for await (const cell of cells) {
            const info = await this.newByCell(client, cell);
            infos.push(info);
        }
        return infos;
    }

    static async getByTxHash(client: ccc.Client, tx: OutPoint): Promise<PrjectCellInfo> {
        let cell = await getCellByTxHash(client, tx);
        return PrjectCellInfo.newByCell(client, cell);
    }
}

export class ContributionCellInfo {
    public projectTx!: OutPoint
    public tx!: OutPoint;

    public capacity!: bigint;

    static async getAll(
        client: ccc.Client, projectInfo: PrjectCellInfo
    ): Promise<ContributionCellInfo[]> {
        let args = new ContributionArgs();

        let prjCell = await getCellByTxHash(client, projectInfo.tx);
        args.projectScript = prjCell.cellOutput.type!.hash();
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
        for await (const cell of client.findCellsByLock(contributionScript)) {
            let info = new ContributionCellInfo();
            info.projectTx = prjCell.outPoint;
            info.tx = cell.outPoint;

            info.capacity = cell.cellOutput.capacity;

            infos.push(info);
        }
        return infos;
    }
}

export class ClaimCellInfo {
    // public projectTxHash!: Hex;
    // public projectTxIndex!: bigint;

    public txHash!: Hex;
    public txIndex!: bigint;

    public deadline!: Date;
    public capacity!: bigint;

    static async getAll(
        signer: ccc.SignerCkbPrivateKey, projectInfo: PrjectCellInfo | null
    ): Promise<ClaimCellInfo[]> {
        const lockScript = (await signer.getRecommendedAddressObj()).script;
        const ckbJsVmScript = scriptsPatch.devnet["ckb-js-vm"];
        const claimJsCode = scripts.devnet["claim.bc"];
        const claimCodeInfo = joinHex(
            hexFrom(claimJsCode.codeHash), hexFrom(hashTypeToBytes(claimJsCode.hashType)));

        let projectCell: Cell | undefined = undefined;
        if (projectInfo) {
            projectCell = await signer.client.getCell(projectInfo?.tx);
        }

        const infos: ClaimCellInfo[] = [];
        for await (const cell of signer.client.findCellsByLock(lockScript)) {
            const typeScript = cell.cellOutput.type;
            if (typeScript == undefined)
                continue;
            if (typeScript.codeHash != ckbJsVmScript.codeHash || typeScript.hashType != ckbJsVmScript.hashType)
                continue;
            if (typeScript.args.length < 35)
                continue;
            if (typeScript.args.slice(3 * 2, 36 * 2) != claimCodeInfo.slice(2)) {
                continue;
            }
            const args = ClaimArgs.fromBytes(ccc.bytesFrom(typeScript.args!).slice(35));

            if (projectInfo) {
                if (args.projectScript != projectCell?.cellOutput.type?.hash()) {
                    continue;
                }
            }

            let info = new ClaimCellInfo();
            // info.projectTxHash = prjCell.outPoint.txHash;
            // info.projectTxIndex = prjCell.outPoint.index;

            info.txHash = cell.outPoint.txHash;
            info.txIndex = cell.outPoint.index;

            if (args.deadline instanceof Date) {
                info.deadline = args.deadline;
            } else {
                info.deadline = sinceToDate(args.deadline);
            }
            let outputData = ccc.bytesFrom(cell.outputData);
            if (outputData.length < 16) {
                throw new Error("Claim Cell data length is less than 16 bytes");
            }
            info.capacity = ccc.numFromBytes(outputData.slice(0, 16));
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
): Promise<Hex> {
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
    return txHash;

    // return new PrjectCellInfo();
}

export async function donationToProject(
    signer: ccc.SignerCkbPrivateKey, amount: bigint, projectTx: OutPoint
): Promise<Hex> {
    const ckbJsVmScript = scriptsPatch.devnet["ckb-js-vm"];
    const contributionJsCode = scripts.devnet["contribution.bc"];
    const claimJsCode = scripts.devnet["claim.bc"];

    const projectCell = await getCellByTxHash(signer.client, projectTx);
    const projectScript = projectCell?.cellOutput.type!;
    const projectArgs = ProjectArgs.fromBytes(ccc.bytesFrom(projectScript.args!).slice(35));

    let contributionArgs = new ContributionArgs();
    contributionArgs.projectScript = projectScript.hash();
    contributionArgs.deadline = projectArgs.deadline;
    contributionArgs.claimScript = projectArgs.claimScript;

    const outputCapacity = CKBToShannon(amount);
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
            ccc.numLeToBytes(outputCapacity, 16)
        ],
        cellDeps: [
            ...ckbJsVmScript.cellDeps.map((c) => c.cellDep),
            ...contributionJsCode.cellDeps.map((c) => c.cellDep),
            ...claimJsCode.cellDeps.map((c) => c.cellDep),
            {
                outPoint: projectTx,
                depType: "code"
            },
        ],
    });

    const txHash = await sendTx(signer, tx);
    return txHash;
}

export async function mergeDonation(
    signer: ccc.SignerCkbPrivateKey, porjectPoint: OutPoint, infos: ContributionCellInfo[]
): Promise<Hex> {
    if (infos.length == 0)
        throw Error("Can't merge empty");
    if (infos.length == 1)
        throw Error("Can't merge one");

    const ckbJsVmScript = scriptsPatch.devnet["ckb-js-vm"];
    const contributionJsCode = scripts.devnet["contribution.bc"];

    const projectCell = await getCellByTxHash(signer.client, porjectPoint);
    const projectScript = projectCell?.cellOutput.type!;
    const projectArgs = ProjectArgs.fromBytes(ccc.bytesFrom(projectScript.args!).slice(35));

    let contributionArgs = new ContributionArgs();
    contributionArgs.projectScript = projectScript.hash();
    contributionArgs.deadline = projectArgs.deadline;
    contributionArgs.claimScript = projectArgs.claimScript;

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

    let totalCapacity = 0n;
    let inputs = [];
    for (const info of infos) {
        inputs.push({ outPoint: info.tx });
        totalCapacity += info.capacity;
    }

    const firstInputCell = await getCellByTxHash(signer.client, infos[0].tx);
    const contributionTypeScript = firstInputCell.cellOutput.type ?? null;

    // Merge All
    let tx = ccc.Transaction.from({
        inputs: inputs,
        outputs: [
            {
                lock: contributionScript,
                type: contributionTypeScript,
                capacity: totalCapacity,
            },
        ],
        outputsData: [
            "0x",
        ],
        cellDeps: [
            ...ckbJsVmScript.cellDeps.map((c) => c.cellDep),
            ...contributionJsCode.cellDeps.map((c) => c.cellDep),
            {
                outPoint: porjectPoint,
                depType: "code"
            },
        ],
    });

    const txHash = await sendTx(signer, tx);

    return txHash;
}

export async function crowfundingSuccess(signer: SignerCkbPrivateKey, projectTx: OutPoint): Promise<Hex> {
    const ckbJsVmScript = scriptsPatch.devnet["ckb-js-vm"];
    const projectJsCode = scripts.devnet["project.bc"];
    const contributionJsCode = scripts.devnet["contribution.bc"];

    const projectCell = await getCellByTxHash(signer.client, projectTx);
    const projectScript = projectCell?.cellOutput.type!;
    const projectArgs = ProjectArgs.fromBytes(ccc.bytesFrom(projectScript.args!).slice(35));

    console.log(`Project Cell: ${ccc.stringify(projectCell)}`);

    let contributionArgs = new ContributionArgs();
    contributionArgs.projectScript = projectScript.hash();
    contributionArgs.deadline = projectArgs.deadline;
    contributionArgs.claimScript = projectArgs.claimScript;

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
    for await (const cell of signer.client.findCellsByLock(contributionScript)) {
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

export async function getCellByTxHash(client: ccc.Client, tx: OutPoint): Promise<Cell> {
    for (let i = 0; i < 10; i++) {
        const cell = await client.getCellLive(tx);
        if (cell != undefined)
            return cell;
        if (i < 2)
            await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw Error(`Load ProjectCell Failed, tx: ${ccc.stringify(tx)}`);
}

// export async function getCellByTypeHash(client: ccc.Client, hash: Hex): Promise<Cell> {
//     client.findCellsPaged
// }
