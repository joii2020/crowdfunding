import { hexFrom, numFrom, Hex, Since } from "@ckb-ccc/core";

import scripts from "artifacts/deployment/scripts.json";
import systemScripts from "artifacts/deployment/system-scripts.json"
import { match } from "assert";

export * from "./args"
export * from "./chainState"
export * from "./crowdfundingActions"
export * as dev_tool from "./devTools"

export function shannonToCKB(amount: bigint) {
    return amount / BigInt(100000000);
}

export function CKBToShannon(v: bigint) {
    return v * 100000000n;
}

export function joinHex(a: Hex, b: Hex, ...rest: Hex[]): Hex {
    let result = a + b.slice(2);
    for (const h of rest)
        result += h.slice(2);
    return hexFrom(result);
}

// since
export function sinceFromDate(date: Date): Since {
    const ms = date.getTime();
    if (!Number.isFinite(ms)) {
        throw new Error("sinceFromDate received an invalid Date");
    }

    const unixMs = BigInt(Math.trunc(ms));
    const unixSeconds = unixMs / 1000n;

    const value = numFrom(unixSeconds);

    return new Since(
        "absolute",
        "timestamp",
        value,
    );
}

export function sinceToDate(since: Since): Date {
    if (since.relative !== "absolute" || since.metric !== "timestamp") {
        throw new Error("sinceToDate only supports absolute timestamp since");
    }

    const unixSeconds = numFrom(since.value);
    const unixMs = unixSeconds * 1000n;
    const ms = Number(unixMs);
    if (!Number.isFinite(ms)) {
        throw new Error("sinceToDate received an invalid timestamp");
    }

    return new Date(ms);
}

export function newSince(offsetMin: number): Since {
    return sinceFromDate(new Date(Date.now() + offsetMin * 60_000));
}

export type NetworkType = "devnet" | "testnet" | "mainnet";
export const getNetwork = (): NetworkType => {
    const network = process.env.NEXT_PUBLIC_CKB_NETWORK;

    if (network === "devnet" || network === "testnet" || network === "mainnet") {
        return network;
    }
    return "devnet";
};
export const ckbJsVmScript = (() => {
    const network = getNetwork();
    if (network === "devnet")
        return systemScripts.devnet["ckb_js_vm"].script;
    else if (network === "testnet")
        return systemScripts.testnet["ckb_js_vm"].script;
    else (network === "mainnet")
    throw Error(`mainnet has not yet been deployed`);
})();
export const projectScript = (() => {
    if (getNetwork() === "devnet")
        return scripts.devnet["project.bc"]
    else
        throw Error(`maintnet and testnet has not yet been deployed`)
})();
export const contributionScript = (() => {
    if (getNetwork() === "devnet")
        return scripts.devnet["contribution.bc"]
    else
        throw Error(`maintnet and testnet has not yet been deployed`)
})();
export const claimScript = (() => {
    if (getNetwork() === "devnet")
        return scripts.devnet["claim.bc"]
    else
        throw Error(`maintnet and testnet has not yet been deployed`)
})();
