import { ccc, hexFrom, hashTypeToBytes, Hex, bytesFrom } from "@ckb-ccc/core"

import { ProjectArgs, ContributionArgs, sinceToDate, shannonToCKB, getCellByLock, sinceFromDate, joinHex, getCellByJsType as getCellByType } from "./index"

import scripts from "artifacts/deployment/scripts.json";
import systemScript from "artifacts/deployment/system-scripts.json"
import scriptsPatch from "artifacts/deployment-patch/scripts_patch.json"

export class PrjectCellInfo {
    public scriptHash!: Hex;
    public typeId!: Hex;
    public raised!: bigint;
    public goal!: bigint;
    public deadline!: Date;
    public status!: "Active" | "ReadyFinish" | "Expired";
    public owner!: boolean;

    constructor() { }

    static async getAll(signer: ccc.SignerCkbPrivateKey): Promise<PrjectCellInfo[]> {
        let cells = getCellByType(signer.client, hexFrom(scripts.devnet["project.bc"].codeHash));

        let infos: PrjectCellInfo[] = [];
        for await (const cell of cells) {
            let projectScript = cell.cellOutput.type!;
            // Skip the 35-byte script prefix (2 bytes flag + 32 bytes codeHash + 1 byte hashType)
            const prjArgs = ProjectArgs.fromBytes(bytesFrom(projectScript.args!).slice(35));
            let info = new PrjectCellInfo();

            info.scriptHash = projectScript.hash();
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

            infos.push(info);
        }

        return infos;
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
        args.projectScript = projectInfo.scriptHash;
        args.deadline = projectInfo.deadline;
        args.claimScript =
            joinHex(
                hexFrom(scripts.devnet["claim.bc"].codeHash),
                hexFrom(hashTypeToBytes(scripts.devnet["claim.bc"].hashType)));
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
            info.projectScriptHash = projectInfo.scriptHash;
            info.scriptHash = cell.cellOutput.lock.hash();
            info.capacity = cell.cellOutput.capacity;

            infos.push(info);
        }
        return infos;
    }
}
