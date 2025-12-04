import { ccc, hexFrom, hashTypeToBytes, Hex, Cell, OutPoint, bytesFrom, numBeToBytes, CellOutputLike, numLeFromBytes, hashTypeFrom, } from "@ckb-ccc/core"
import * as shared from "./index"

import scripts from "artifacts/deployment/scripts.json";
import systemScript from "artifacts/deployment/system-scripts.json"

export class PrjectCellInfo {
    public tx!: OutPoint;
    public lockScriptHash!: Hex;
    public typeId!: Hex;
    public raised!: bigint;
    public goal!: bigint;
    public deadline!: Date;
    public description!: String;
    public status!: "Active" | "ReadyFinish" | "Expired" | "Destroyed";
    public contributionInfo!: ContributionCellInfo[];

    static async newByCell(client: ccc.Client, cell: Cell, isLive: boolean): Promise<PrjectCellInfo> {
        let projectScript = cell.cellOutput.type!;
        const prjArgs = shared.ProjectArgs.fromBytes(ccc.bytesFrom(projectScript.args!).slice(35));
        let info = new PrjectCellInfo();

        info.tx = new OutPoint(cell.outPoint.txHash, cell.outPoint.index);
        info.typeId = prjArgs.typeID;

        info.goal = prjArgs.goalAmount;
        if (prjArgs.deadline instanceof Date) {
            info.deadline = prjArgs.deadline;
        } else {
            info.deadline = shared.sinceToDate(prjArgs.deadline);
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
        if (isLive == false)
            info.status = "Destroyed";
        else if (info.deadline <= new Date())
            info.status = "Expired";
        else {
            if (info.raised >= info.goal) {
                info.status = "ReadyFinish"
            } else {
                info.status = "Active";
            }
        }

        const descBytes = ccc.bytesFrom(cell.outputData);
        info.description = Buffer.from(descBytes).toString("utf8");

        return info;
    }

    static async getAll(client: ccc.Client): Promise<PrjectCellInfo[]> {
        let cells = shared.getCellByJsType(client,
            hexFrom(scripts.devnet["project.bc"].codeHash),
            hashTypeFrom(scripts.devnet["project.bc"].hashType));

        console.log(`1111`);
        let infos: PrjectCellInfo[] = [];
        for await (const cell of cells) {
            const info = await this.newByCell(client, cell, true);
            infos.push(info);
        }
        return infos;
    }

    static async getByTxHash(client: ccc.Client, tx: OutPoint): Promise<PrjectCellInfo> {
        let cell = await getCellByTxHash(client, tx);
        return PrjectCellInfo.newByCell(client, cell.cell, cell.isLive);
    }
}

export class ContributionCellInfo {
    public projectTx!: OutPoint
    public tx!: OutPoint;

    public capacity!: bigint;

    static async getAll(
        client: ccc.Client, projectInfo: PrjectCellInfo
    ): Promise<ContributionCellInfo[]> {
        let args = new shared.ContributionArgs();

        let prjCell = await getCellByTxHash(client, projectInfo.tx);
        args.projectScript = prjCell.cell.cellOutput.type!.hash();
        args.deadline = projectInfo.deadline;
        args.claimScript =
            shared.joinHex(
                hexFrom(scripts.devnet["claim.bc"].codeHash),
                hexFrom(hashTypeToBytes(scripts.devnet["claim.bc"].hashType))
            );
        const contributionScript = {
            codeHash: systemScript.devnet["ckb_js_vm"].script.codeHash,
            hashType: systemScript.devnet["ckb_js_vm"].script.hashType,
            args: shared.joinHex(
                "0x0000",
                hexFrom(scripts.devnet["contribution.bc"].codeHash),
                hexFrom(hashTypeToBytes(scripts.devnet["contribution.bc"].hashType)),
                hexFrom(args.toBytes()),
            ),
        };

        let infos: ContributionCellInfo[] = [];
        for await (const cell of client.findCellsByLock(contributionScript)) {
            let info = new ContributionCellInfo();
            info.projectTx = prjCell.cell.outPoint;
            info.tx = cell.outPoint;

            info.capacity = cell.cellOutput.capacity;

            infos.push(info);
        }
        return infos;
    }
}

export class ClaimCellInfo {
    public txHash!: Hex;
    public txIndex!: bigint;
    public isLive!: boolean;

    public deadline!: Date;
    public capacity!: bigint;

    static async getAll(
        signer: ccc.SignerCkbPrivateKey, projectInfo: PrjectCellInfo | null
    ): Promise<ClaimCellInfo[]> {
        const lockScript = (await signer.getRecommendedAddressObj()).script;
        const ckbJsVmScript = systemScript.devnet["ckb_js_vm"];
        const claimJsCode = scripts.devnet["claim.bc"];
        const claimCodeInfo = shared.joinHex(
            hexFrom(claimJsCode.codeHash), hexFrom(hashTypeToBytes(claimJsCode.hashType)));

        const infos: ClaimCellInfo[] = [];

        if (projectInfo) {
            const projectCell = await signer.client.getCell(projectInfo?.tx);
            let txs = signer.client.findTransactions(
                {
                    script: {
                        codeHash: ckbJsVmScript.script.codeHash,
                        hashType: ckbJsVmScript.script.hashType,
                        args: shared.joinHex(
                            hexFrom("0x0000"),
                            hexFrom(claimJsCode.codeHash),
                            hexFrom(hashTypeToBytes(claimJsCode.hashType)),
                            new shared.ClaimArgs(projectCell?.cellOutput.type?.hash(), projectInfo.deadline, lockScript.hash()).toBytes()
                        ),
                    },
                    scriptType: "type",
                    scriptSearchMode: "exact",
                }
            );
            for await (const tx of txs) {
                if (tx.isInput)
                    continue;
                let cell = await signer.client.getCell({ txHash: tx.txHash, index: tx.txIndex });
                if (cell == undefined)
                    throw Error(`Found not cell by tx: ${tx.txHash}`);


                let info = new ClaimCellInfo();
                info.txIndex = cell.outPoint.index;
                info.deadline = projectInfo.deadline;
                info.txHash = cell.outPoint.txHash;

                if (await signer.client.getCellLive({ txHash: tx.txHash, index: tx.txIndex }) == undefined)
                    info.isLive = false;
                else
                    info.isLive = true;

                let outputData = ccc.bytesFrom(cell.outputData);
                if (outputData.length < 16) {
                    continue;
                }
                info.capacity = ccc.numFromBytes(outputData.slice(0, 16));
                infos.push(info);
            }
        } else {
            for await (const cell of signer.client.findCellsByLock(lockScript)) {
                const typeScript = cell.cellOutput.type;
                if (typeScript == undefined)
                    continue;
                if (typeScript.codeHash != ckbJsVmScript.script.codeHash || typeScript.hashType != ckbJsVmScript.script.hashType)
                    continue;
                if (typeScript.args.length < 35)
                    continue;
                if (typeScript.args.slice(3 * 2, 36 * 2) != claimCodeInfo.slice(2)) {
                    continue;
                }
                const args = shared.ClaimArgs.fromBytes(ccc.bytesFrom(typeScript.args!).slice(35));
                let info = new ClaimCellInfo();
                info.txHash = cell.outPoint.txHash;
                info.txIndex = cell.outPoint.index;

                if (args.deadline instanceof Date) {
                    info.deadline = args.deadline;
                } else {
                    info.deadline = shared.sinceToDate(args.deadline);
                }
                let outputData = ccc.bytesFrom(cell.outputData);
                if (outputData.length < 16) {
                    throw new Error("Claim Cell data length is less than 16 bytes");
                }
                info.capacity = ccc.numFromBytes(outputData.slice(0, 16));
                infos.push(info);
            }
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
    let now = new Date(Date.now() - 120_000); // 2min

    let nowSince = shared.sinceFromDate(now);
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
    // console.log(
    //     "fee need=",
    //     tx.estimateFee(feeRate),
    //     "actual=",
    //     await tx.getFee(signer.client),
    // );

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

async function getProjectByTx(client: ccc.Client, txHash: Hex): Promise<OutPoint> {
    let tx = await client.getTransaction(txHash);
    if (tx == undefined)
        throw Error(`Unknow TxHash: ${txHash}`);

    const ckbJsVmScript = systemScript.devnet["ckb_js_vm"];
    const jsCode = scripts.devnet["project.bc"];

    let index: bigint | undefined = undefined;
    for (let i = 0; i < tx.transaction.outputs.length; i++) {
        const typeScript = tx.transaction.outputs[i].type;
        if (typeScript == undefined)
            continue;
        if (typeScript.codeHash != ckbJsVmScript.script.codeHash || typeScript.hashType! != ckbJsVmScript.script.hashType)
            continue;

        const jsScript = bytesFrom(typeScript.args).slice(2, 35);
        if (hexFrom(jsScript) == shared.joinHex(hexFrom(jsCode.codeHash),
            hexFrom(hashTypeToBytes(jsCode.hashType)))
        ) {
            index = BigInt(i);
            break;
        }
    }
    if (index == undefined)
        throw Error(`Tx not found project cell: TxHash: ${txHash}`);

    return new OutPoint(txHash, index);
}

async function getClaimByTx(client: ccc.Client, txHash: Hex): Promise<OutPoint> {
    let tx = await client.getTransaction(txHash);
    if (tx == undefined)
        throw Error(`Unknow TxHash: ${txHash}`);

    const ckbJsVmScript = systemScript.devnet["ckb_js_vm"];
    const jsCode = scripts.devnet["claim.bc"];

    let index: bigint | undefined = undefined;
    for (let i = 0; i < tx.transaction.outputs.length; i++) {
        const typeScript = tx.transaction.outputs[i].type;
        if (typeScript == undefined)
            continue;
        if (typeScript.codeHash != ckbJsVmScript.script.codeHash || typeScript.hashType! != ckbJsVmScript.script.hashType)
            continue;

        const jsScript = bytesFrom(typeScript.args).slice(2, 35);
        if (hexFrom(jsScript) == shared.joinHex(hexFrom(jsCode.codeHash),
            hexFrom(hashTypeToBytes(jsCode.hashType)))
        ) {
            index = BigInt(i);
            break;
        }
    }
    if (index == undefined)
        throw Error(`Tx not found project cell: TxHash: ${txHash}`);

    return new OutPoint(txHash, index);
}

export async function createCrowfunding(
    signer: ccc.SignerCkbPrivateKey,
    goal: bigint,
    deadline: Date,
    description: String
): Promise<OutPoint> {
    const signerLock = (await signer.getRecommendedAddressObj()).script;

    const ckbJsVmScript = systemScript.devnet["ckb_js_vm"];
    const projectJsCode = scripts.devnet["project.bc"];
    const contributionJsCode = scripts.devnet["contribution.bc"];
    const claimJsCode = scripts.devnet["claim.bc"];

    let prjArgs = new shared.ProjectArgs();
    prjArgs.creatorLockScriptHash = signerLock.hash();
    prjArgs.goalAmount = shared.CKBToShannon(goal);
    prjArgs.contributionScript = hexFrom(contributionJsCode.codeHash + hexFrom(hashTypeToBytes(contributionJsCode.hashType)).slice(2));
    prjArgs.claimScript = hexFrom(claimJsCode.codeHash + hexFrom(hashTypeToBytes(claimJsCode.hashType)).slice(2));
    prjArgs.deadline = deadline;
    const prjScript = {
        codeHash: ckbJsVmScript.script.codeHash,
        hashType: ckbJsVmScript.script.hashType,
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
            ...ckbJsVmScript.script.cellDeps.map((c) => c.cellDep),
            ...projectJsCode.cellDeps.map((c) => c.cellDep),
        ],
    });

    const txHash = await sendTx(signer, tx);
    return await getProjectByTx(signer.client, txHash);
}

export async function donationToProject(
    signer: ccc.SignerCkbPrivateKey, amount: bigint, projectTx: OutPoint
): Promise<Hex> {
    const ckbJsVmScript = systemScript.devnet["ckb_js_vm"];
    const contributionJsCode = scripts.devnet["contribution.bc"];
    const claimJsCode = scripts.devnet["claim.bc"];

    const projectCell = await getCellByTxHash(signer.client, projectTx);
    const projectScript = projectCell.cell?.cellOutput.type!;
    const projectArgs = shared.ProjectArgs.fromBytes(ccc.bytesFrom(projectScript.args!).slice(35));

    let contributionArgs = new shared.ContributionArgs();
    contributionArgs.projectScript = projectScript.hash();
    contributionArgs.deadline = projectArgs.deadline;
    contributionArgs.claimScript = projectArgs.claimScript;

    const outputCapacity = shared.CKBToShannon(amount);
    const contributionScript = {
        codeHash: ckbJsVmScript.script.codeHash,
        hashType: ckbJsVmScript.script.hashType,
        args: hexFrom(
            "0x0000" +
            contributionJsCode.codeHash.slice(2) +
            hexFrom(hashTypeToBytes(contributionJsCode.hashType)).slice(2) +
            hexFrom(contributionArgs.toBytes()).slice(2),
        ),
    };

    const usersLock = (await signer.getRecommendedAddressObj()).script;
    let claimArgs = new shared.ClaimArgs();
    claimArgs.projectScript = projectScript.hash();
    claimArgs.deadline = projectArgs.deadline;
    claimArgs.backerLockScript = usersLock.hash();

    const claimScript = {
        codeHash: ckbJsVmScript.script.codeHash,
        hashType: ckbJsVmScript.script.hashType,
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
            ...ckbJsVmScript.script.cellDeps.map((c) => c.cellDep),
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

    const ckbJsVmScript = systemScript.devnet["ckb_js_vm"];
    const contributionJsCode = scripts.devnet["contribution.bc"];

    const projectCell = await getCellByTxHash(signer.client, porjectPoint);
    const projectScript = projectCell.cell?.cellOutput.type!;
    const projectArgs = shared.ProjectArgs.fromBytes(ccc.bytesFrom(projectScript.args!).slice(35));

    let contributionArgs = new shared.ContributionArgs();
    contributionArgs.projectScript = projectScript.hash();
    contributionArgs.deadline = projectArgs.deadline;
    contributionArgs.claimScript = projectArgs.claimScript;

    const contributionScript = {
        codeHash: ckbJsVmScript.script.codeHash,
        hashType: ckbJsVmScript.script.hashType,
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
    const contributionTypeScript = firstInputCell.cell.cellOutput.type ?? null;

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
            ...ckbJsVmScript.script.cellDeps.map((c) => c.cellDep),
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

export async function crowfundingSuccess(signer: ccc.SignerCkbPrivateKey, projectTx: OutPoint): Promise<Hex> {
    const ckbJsVmScript = systemScript.devnet["ckb_js_vm"];
    const projectJsCode = scripts.devnet["project.bc"];
    const contributionJsCode = scripts.devnet["contribution.bc"];

    const projectCell = await getCellByTxHash(signer.client, projectTx);
    const projectScript = projectCell?.cell.cellOutput.type!;
    const projectArgs = shared.ProjectArgs.fromBytes(ccc.bytesFrom(projectScript.args!).slice(35));

    let contributionArgs = new shared.ContributionArgs();
    contributionArgs.projectScript = projectScript.hash();
    contributionArgs.deadline = projectArgs.deadline;
    contributionArgs.claimScript = projectArgs.claimScript;

    const contributionScript = {
        codeHash: ckbJsVmScript.script.codeHash,
        hashType: ckbJsVmScript.script.hashType,
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

    inputs.push({ outPoint: projectCell.cell.outPoint })

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
                capacity: projectCell.cell.cellOutput.capacity,
            },
        ],
        cellDeps: [
            ...ckbJsVmScript.script.cellDeps.map((c) => c.cellDep),
            ...projectJsCode.cellDeps.map((c) => c.cellDep),
            ...contributionJsCode.cellDeps.map((c) => c.cellDep),
        ],
    });

    const txHash = await sendTx(signer, tx);
    return txHash;
}

export async function getCellByTxHash(client: ccc.Client, tx: OutPoint): Promise<{ cell: Cell, isLive: boolean }> {
    let cell = await client.getCellLive(tx);
    if (cell != undefined)
        return { cell: cell, isLive: true };

    cell = await client.getCell(tx);
    if (cell != undefined)
        return { cell: cell, isLive: false };

    throw Error(`Load ProjectCell Failed, tx: ${ccc.stringify(tx)}`);
}

export async function destroyProject(signer: ccc.SignerCkbPrivateKey, txHash: Hex): Promise<Hex> {
    const signerLock = (await signer.getRecommendedAddressObj()).script;

    const ckbJsVmScript = systemScript.devnet["ckb_js_vm"];
    const projectJsCode = scripts.devnet["project.bc"];

    const outpoint = await getProjectByTx(signer.client, txHash);
    const prjCell = await getCellByTxHash(signer.client, outpoint);

    let tx = ccc.Transaction.from({
        inputs: [
            { outPoint: outpoint }
        ],
        outputs: [
            {
                lock: signerLock,
                capacity: prjCell.cell.cellOutput.capacity
            },
        ],
        cellDeps: [
            ...ckbJsVmScript.script.cellDeps.map((c) => c.cellDep),
            ...projectJsCode.cellDeps.map((c) => c.cellDep),
        ],
    });

    return sendTx(signer, tx);
}

export async function destroyClaim(signer: ccc.SignerCkbPrivateKey, txHash: Hex): Promise<Hex> {
    const signerLock = (await signer.getRecommendedAddressObj()).script;

    const ckbJsVmScript = systemScript.devnet["ckb_js_vm"];
    const claimJsCode = scripts.devnet["claim.bc"];

    const outpoint = await getClaimByTx(signer.client, txHash);
    const claimCell = await getCellByTxHash(signer.client, outpoint);

    let tx = ccc.Transaction.from({
        inputs: [
            { outPoint: outpoint }
        ],
        outputs: [
            {
                lock: signerLock,
                capacity: claimCell.cell.cellOutput.capacity
            },
        ],
        cellDeps: [
            ...ckbJsVmScript.script.cellDeps.map((c) => c.cellDep),
            ...claimJsCode.cellDeps.map((c) => c.cellDep),
        ],
    });

    return sendTx(signer, tx);
}

export async function refound(signer: ccc.SignerCkbPrivateKey, txHash: Hex): Promise<Hex> {
    const signerLock = (await signer.getRecommendedAddressObj()).script;

    const ckbJsVmScript = systemScript.devnet["ckb_js_vm"];
    const projectJsCode = scripts.devnet["project.bc"];
    const contributionJsCode = scripts.devnet["contribution.bc"];
    const claimJsCode = scripts.devnet["claim.bc"];

    const outpoint = await getClaimByTx(signer.client, txHash);
    const claimCell = await getCellByTxHash(signer.client, outpoint);
    const amount = numLeFromBytes(claimCell.cell.outputData);
    const claimArgs = shared.ClaimArgs.fromBytes(bytesFrom(claimCell.cell.cellOutput.type?.args!).slice(35));

    const txInfo = await signer.client.getTransaction(txHash);
    if (txInfo == undefined)
        throw Error(`Unknow Claim Tx, get tx info failed by txHash: ${txHash}`);

    // Find project by cellDeps
    let projectCell: Cell | undefined = undefined;
    for (const deps of txInfo.transaction.cellDeps) {
        const depsCell = await signer.client.getCell({ txHash: deps.outPoint.txHash, index: deps.outPoint.index });
        if (depsCell == undefined)
            throw Error(`Unknow Error, There is an invalid cell in Deps`);

        // Is Project
        if (depsCell.cellOutput.type?.hash() == claimArgs.projectScript) {
            projectCell = depsCell;
            break;
        }
    }
    if (projectCell == undefined) {
        throw Error(`Found not ProjectCell in tx deps`);
    }

    // Find  Contribution in tx
    let contributionInput: OutPoint[] = [];
    let contributionOutput: CellOutputLike[] = [];
    for (let i = 0; i < txInfo.transaction.outputs.length; i++) {
        const output = txInfo.transaction.outputs[i];
        if (output.lock.codeHash != ckbJsVmScript.script.codeHash || output.lock.hashType != ckbJsVmScript.script.hashType)
            continue;

        const jsScript = bytesFrom(output.lock.args).slice(2, 35);
        if (hexFrom(jsScript) != shared.joinHex(hexFrom(contributionJsCode.codeHash),
            hexFrom(hashTypeToBytes(contributionJsCode.hashType))))
            continue;

        let cell = await signer.client.getCellLive({ txHash: txHash, index: i });
        if (cell == undefined)
            continue;

        contributionInput.push(new OutPoint(txHash, BigInt(i)));
    }
    contributionOutput.push({
        lock: signerLock,
        capacity: amount,
    });

    if (contributionInput.length == 0) {
        let args = new shared.ContributionArgs();

        args.projectScript = projectCell.cellOutput.type?.hash()!;
        args.deadline = claimArgs.deadline;
        args.claimScript =
            shared.joinHex(
                hexFrom(scripts.devnet["claim.bc"].codeHash),
                hexFrom(hashTypeToBytes(scripts.devnet["claim.bc"].hashType))
            );
        const contributionScript = {
            codeHash: systemScript.devnet["ckb_js_vm"].script.codeHash,
            hashType: systemScript.devnet["ckb_js_vm"].script.hashType,
            args: shared.joinHex(
                "0x0000",
                hexFrom(scripts.devnet["contribution.bc"].codeHash),
                hexFrom(hashTypeToBytes(scripts.devnet["contribution.bc"].hashType)),
                hexFrom(args.toBytes()),
            ),
        };
        let needAmount = amount
        let firstContributionCell = undefined;
        for await (const cell of signer.client.findCellsByLock(contributionScript)) {
            if (firstContributionCell == undefined) {
                firstContributionCell = cell;
            }
            contributionInput.push(cell.outPoint);
            needAmount -= cell.cellOutput.capacity
            if (needAmount <= 0) {
                break;
            }
        }
        if (needAmount < 0) {
            contributionOutput.push({
                lock: firstContributionCell?.cellOutput.lock!,
                type: firstContributionCell?.cellOutput.type,
                capacity: needAmount * -1n,
            })
        }
    }

    let tx = ccc.Transaction.from({
        inputs: [
            ...contributionInput.map((outPoint) => ({ outPoint })),
            { outPoint: outpoint },
        ],
        outputs: [
            ...contributionOutput,
            {
                lock: signerLock,
                capacity: claimCell.cell.cellOutput.capacity
            },
        ],
        cellDeps: [
            ...ckbJsVmScript.script.cellDeps.map((c) => c.cellDep),
            ...contributionJsCode.cellDeps.map((c) => c.cellDep),
            ...claimJsCode.cellDeps.map((c) => c.cellDep),
        ],
    });

    return sendTx(signer, tx);
}
