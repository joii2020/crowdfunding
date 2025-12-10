import { ccc, hexFrom, hashTypeToBytes, Hex, Cell, OutPoint, bytesFrom, CellOutputLike, numLeFromBytes, hashTypeFrom, } from "@ckb-ccc/core"
import * as shared from "./index"

export class ProjectCellInfo {
    public tx!: OutPoint;
    public lockScriptHash!: Hex;
    public typeId!: Hex;
    public raised!: bigint;
    public goal!: bigint;
    public deadline!: Date;
    public description!: string;
    public status!: "Active" | "ReadyFinish" | "Expired" | "Destroyed";
    public contributionInfo!: ContributionCellInfo[];

    static async newByCell(client: ccc.Client, cell: Cell, isLive: boolean): Promise<ProjectCellInfo> {
        let projectScript = cell.cellOutput.type!;
        const prjArgs = shared.ProjectArgs.fromBytes(ccc.bytesFrom(projectScript.args!).slice(35));
        let info = new ProjectCellInfo();

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

    static async getAll(client: ccc.Client): Promise<ProjectCellInfo[]> {
        let cells = getCellByJsType(client,
            hexFrom(shared.projectScript().codeHash),
            hashTypeFrom(shared.projectScript().hashType));
        let infos: ProjectCellInfo[] = [];
        for await (const cell of cells) {
            const info = await this.newByCell(client, cell, true);
            infos.push(info);
        }
        return infos;
    }

    static async getByTxHash(client: ccc.Client, tx: OutPoint): Promise<ProjectCellInfo> {
        let cell = await shared.getCellByTxHash(client, tx);
        return ProjectCellInfo.newByCell(client, cell.cell, cell.isLive);
    }
}

export class ContributionCellInfo {
    public projectTx!: OutPoint
    public tx!: OutPoint;

    public capacity!: bigint;

    static async getAll(
        client: ccc.Client, projectInfo: ProjectCellInfo
    ): Promise<ContributionCellInfo[]> {
        let args = new shared.ContributionArgs();

        let prjCell = await shared.getCellByTxHash(client, projectInfo.tx);
        args.projectScript = prjCell.cell.cellOutput.type!.hash();
        args.deadline = shared.sinceFromDate(projectInfo.deadline);
        args.claimScript =
            shared.joinHex(
                hexFrom(shared.claimScript().codeHash),
                hexFrom(hashTypeToBytes(shared.claimScript().hashType))
            );
        const contributionScript = {
            codeHash: shared.ckbJsVmScript().codeHash,
            hashType: shared.ckbJsVmScript().hashType,
            args: shared.joinHex(
                "0x0000",
                hexFrom(shared.contributionScript().codeHash),
                hexFrom(hashTypeToBytes(shared.contributionScript().hashType)),
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
        signer: ccc.SignerCkbPrivateKey, projectInfo: ProjectCellInfo | null
    ): Promise<ClaimCellInfo[]> {
        const lockScript = (await signer.getRecommendedAddressObj()).script;
        const claimCodeInfo = shared.joinHex(
            hexFrom(shared.claimScript().codeHash),
            hexFrom(hashTypeToBytes(shared.claimScript().hashType)));

        const infos: ClaimCellInfo[] = [];

        if (projectInfo) {
            const projectCell = await signer.client.getCell(projectInfo?.tx);
            let txs = signer.client.findTransactions(
                {
                    script: {
                        codeHash: shared.ckbJsVmScript().codeHash,
                        hashType: shared.ckbJsVmScript().hashType,
                        args: shared.joinHex(
                            hexFrom("0x0000"),
                            hexFrom(shared.claimScript().codeHash),
                            hexFrom(hashTypeToBytes(shared.claimScript().hashType)),
                            new shared.ClaimArgs(
                                projectCell?.cellOutput.type?.hash(),
                                shared.sinceFromDate(projectInfo.deadline),
                                lockScript.hash()).toBytes()
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
                if (typeScript.codeHash != shared.ckbJsVmScript().codeHash || typeScript.hashType != shared.ckbJsVmScript().hashType)
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

function getCellByJsType(
    client: ccc.Client, codeHash: Hex, hashType?: ccc.HashType
): AsyncGenerator<ccc.Cell, any, any> {
    if (hashType == undefined) {
        hashType = "data1";
    }
    const systemScript = require("artifacts/deployment/system-scripts.json")
    return client.findCells(
        {
            script: {
                codeHash: systemScript.devnet["ckb_js_vm"].script.codeHash,
                hashType: systemScript.devnet["ckb_js_vm"].script.hashType,
                args: hexFrom(
                    "0x0000" +
                    codeHash.slice(2) +
                    hexFrom(ccc.hashTypeToBytes(hashType)).slice(2))
            },
            scriptType: "type",
            scriptSearchMode: "prefix",
        });
}
