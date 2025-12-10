import { hexFrom, numFrom, Hex, Since } from "@ckb-ccc/core";


export * from "./args"
export * from "./chainState"
export * from "./crowdfundingActions"

export * from "./utils/env"

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

