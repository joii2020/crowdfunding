import { ccc, hexFrom, numFrom, Hex, Since } from "@ckb-ccc/core";

export * from "./args"
export * from "./on_chain"
export * as dev_tool from "./dev_tool"

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

export function getCellByJsType(client: ccc.Client, codeHash: Hex, hashType?: ccc.HashType): AsyncGenerator<ccc.Cell, any, any> {
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

export function getCellByLock(client: ccc.Client, codeHash: Hex, hashType?: ccc.HashType): AsyncGenerator<ccc.Cell, any, any> {
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
            scriptType: "lock",
            scriptSearchMode: "prefix",
        });
}

