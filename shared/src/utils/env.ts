
import scripts from "artifacts/deployment/scripts.json";
import systemScripts from "artifacts/deployment/system-scripts.json"

export type NetworkType = "devnet" | "testnet" | "mainnet";

// Get network from environment variable, default to "testnet" if not set
export const getNetwork = (): NetworkType => {
    const network = process.env.REACT_APP_CKB_NETWORK;
    if (network === "devnet" || network === "testnet" || network === "mainnet") {
        return network;
    }
    // Default to testnet if not specified or invalid
    return "testnet";
    // return "devnet";
};

// Validate network type
export const isValidNetwork = (network: string): network is NetworkType => {
    return network === "devnet" || network === "testnet" || network === "mainnet";
};

export const ckbJsVmScript = ((network?: NetworkType) => {
    if (network== undefined) 
        network = getNetwork();
    if (network === "devnet")
        return systemScripts.devnet["ckb_js_vm"].script;
    else if (network === "testnet")
        return systemScripts.testnet["ckb_js_vm"].script;
    else (network === "mainnet")
    throw Error(`mainnet has not yet been deployed`);
});
export const projectScript = ((network?: NetworkType) => {
    if (network== undefined) 
        network = getNetwork();
    if (network === "devnet")
        return scripts.devnet["project.bc"];
    else if (network === "testnet")
        return scripts.testnet["project.bc"];
    else
        throw Error(`maintnet and testnet has not yet been deployed (project.bc)`)
});
export const contributionScript = ((network?: NetworkType) => {
    if (network== undefined) 
        network = getNetwork();
    if (network === "devnet")
        return scripts.devnet["contribution.bc"];
    else if (network === "testnet")
        return scripts.testnet["contribution.bc"];
    else
        throw Error(`maintnet and testnet has not yet been deployed (contribution.bc)`)
});
export const claimScript = ((network?: NetworkType) => {
    if (network== undefined) 
        network = getNetwork();
    if (network === "devnet")
        return scripts.devnet["claim.bc"];
    else if (network === "testnet")
        return scripts.testnet["claim.bc"];
    else
        throw Error(`maintnet and testnet has not yet been deployed (claim.bc)`)
});
