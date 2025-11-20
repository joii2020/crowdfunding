import { hexFrom, numFrom, Hex, Since } from "@ckb-ccc/core";

export * from "./args"

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

export function zeroHash(): Hex {
    return hexFrom(new Uint8Array(32));
}

export function sinceFromDate(date: Date): Since {
    const unixMs = BigInt(date.getTime());
    const unixSeconds = unixMs / 1000n;

    const value = numFrom(unixSeconds);

    return new Since(
        "absolute",
        "timestamp",
        value,
    );
}
