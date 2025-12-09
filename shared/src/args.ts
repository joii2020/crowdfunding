import { ccc, hexFrom, Hex, Since, } from "@ckb-ccc/core";
import { joinHex, sinceFromDate, newSince } from "./index"


function zeroHash(): Hex {
    return hexFrom(new Uint8Array(32));
}

function toSince(d: Date | Since): Since {
    if (d instanceof Since) {
        return d;
    } else {
        return sinceFromDate(d);
    }
}

export class ProjectArgs {
    constructor(
        public typeID: Hex = zeroHash(),
        public creatorLockScriptHash: Hex = zeroHash(),
        public goalAmount: bigint = BigInt(0),
        public deadline: Since = newSince(60),
        public contributionScript = hexFrom(new Uint8Array(33)),
        public claimScript = hexFrom(new Uint8Array(33)),
        public contributionType: Hex = zeroHash(),
    ) { }

    static fromBytes(data: Hex | Uint8Array): ProjectArgs {
        let bin!: Uint8Array;
        if (data instanceof Uint8Array) {
            bin = data;
        } else {
            bin = ccc.bytesFrom(data);
        }
        let ret = new ProjectArgs();
        let offset = 0;

        ret.typeID = hexFrom(bin.slice(offset, offset + 32));
        offset += 32;

        ret.creatorLockScriptHash = hexFrom(bin.slice(offset, offset + 32));
        offset += 32;

        ret.goalAmount = ccc.numLeFromBytes(bin.slice(offset, offset + 16));
        offset += 16;

        ret.deadline = Since.fromNum(ccc.numLeFromBytes(bin.slice(offset, offset + 8)));
        offset += 8;

        ret.contributionScript = hexFrom(bin.slice(offset, offset + 33));
        offset += 33;

        ret.claimScript = hexFrom(bin.slice(offset, offset + 33));
        offset += 33;

        ret.contributionType = hexFrom(bin.slice(offset, offset + 32));

        return ret;
    }

    toBytes(): Hex {
        return joinHex(
            this.typeID,
            this.creatorLockScriptHash,
            hexFrom(ccc.numLeToBytes(this.goalAmount, 16)),
            hexFrom(toSince(this.deadline).toBytes(),),
            this.contributionScript,
            this.claimScript,
            this.contributionType,
        );
    }
}

export class ContributionArgs {
    constructor(
        public projectScript: Hex = zeroHash(),
        public deadline: Since = newSince(60),
        public claimScript: Hex = hexFrom(new Uint8Array(33))
    ) { }

    toBytes(): Hex {
        return joinHex(
            this.projectScript,
            hexFrom(
                toSince(this.deadline).toBytes(),
            ),
            this.claimScript,
        );
    }
}

export class ClaimArgs {
    constructor(
        public projectScript: Hex = zeroHash(),
        public deadline: Since = newSince(60),
        public backerLockScript: Hex = zeroHash(),
    ) { }

    static fromBytes(data: Hex | Uint8Array): ClaimArgs {
        let bin!: Uint8Array;
        if (data instanceof Uint8Array) {
            bin = data;
        } else {
            bin = ccc.bytesFrom(data);
        }
        let ret = new ClaimArgs();
        let offset = 0;

        ret.projectScript = hexFrom(bin.slice(offset, offset + 32));
        offset += 32;

        ret.deadline = Since.fromNum(ccc.numLeFromBytes(bin.slice(offset, offset + 8)));
        offset += 8;

        ret.backerLockScript = hexFrom(bin.slice(offset, offset + 32));
        offset += 32;

        return ret;
    }

    toBytes(): Hex {
        return joinHex(
            this.projectScript,
            hexFrom(
                toSince(this.deadline).toBytes(),
            ),
            this.backerLockScript,
        )
    }
}
