import { hexFrom, Hex, numLeToBytes, hashCkb, HashType, hashTypeToBytes } from "@ckb-ccc/core";
import { readFileSync } from "fs"

import { Since } from "@ckb-ccc/core";
import { zeroHash, joinHex } from "./tx_helper";

export const scriptProject = "../../contracts/project/dist/index.bc";
export const scriptContribution = "../../contracts/contribution/dist/index.bc";
export const scriptClaim = "../../contracts/claim/dist/index.bc";

function getExpirationTime(): Date {
  let d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

export class ProjectArgs {

  constructor(
    public typeID: Hex = zeroHash(),
    public creatorLockScriptHash: Hex = zeroHash(),
    public goalAmount: bigint = BigInt(0),
    public deadline: Date = new Date(),
    public contributionScript = hexFrom(new Uint8Array(33)),
    public claimScript = hexFrom(new Uint8Array(33)),
    public contributionType: Hex = zeroHash(),
  ) {
    // Ends after 100 days
    this.deadline.setDate(this.deadline.getDate() + 100);
  }

  toBytes(): Hex {
    return joinHex(
      this.typeID,
      this.creatorLockScriptHash,
      hexFrom(numLeToBytes(this.goalAmount, 16)),
      hexFrom(
        new Since(
          "absolute",
          "timestamp",
          BigInt(this.deadline.getTime()),
        ).toBytes(),
      ),
      this.contributionScript,
      this.claimScript,
      this.contributionType,
    );
  }

  setExpirationTime() {
    this.deadline = getExpirationTime();
  }
}

export class ContributionArgs {
  constructor(
    public projectScript: Hex = zeroHash(),
    public deadline: Date = new Date(),
    public claimScript: Hex = hexFrom(new Uint8Array(33)),
  ) { }

  toBytes(): Hex {
    return joinHex(
      this.projectScript,
      hexFrom(
        new Since(
          "absolute",
          "timestamp",
          BigInt(this.deadline.getTime()),
        ).toBytes(),
      ),
      this.claimScript,
    );
  }

  setExpirationTime() {
    this.deadline = getExpirationTime();
  }
}

export class ClaimArgs {
  constructor(
    public projectScript: Hex = zeroHash(),
    public deadline: Date = new Date(),
    public backerLockScript: Hex = zeroHash(),
  ) { }

  toBytes(): Hex {
    return joinHex(
      this.projectScript,
      hexFrom(
        new Since(
          "absolute",
          "timestamp",
          BigInt(this.deadline.getTime()),
        ).toBytes(),
      ),
      this.backerLockScript,
    )
  }

  setExpirationTime() {
    this.deadline = getExpirationTime();
  }
}

export function shannonToCKB(amount: bigint) {
  return amount / BigInt(100000000);
}

export function CKBToShannon(v: bigint) {
  return v * 100000000n;
}
