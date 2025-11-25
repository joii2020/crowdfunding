import { Hex } from "@ckb-ccc/connector-react";
import systemScripts from "artifacts/deployment/system-scripts.json";
import scripts from "artifacts/deployment/scripts.json";
import { NetworkType } from "./client";

export const getContractConfig = (network: NetworkType): ContractConfig => {
  const system = systemScripts as SystemScriptsConfig;
  const contracts = scripts as ScriptsConfig;

  return {
    ckbJsVmScript: system[network]["ckb_js_vm"].script,
    claimScript: contracts[network]["claim.bc"],
    contributionScript: contracts[network]["contribution.bc"],
    projectScript: contracts[network]["project.bc"],
    
  };
};

interface CellDep {
  outPoint: { txHash: Hex; index: number };
  depType: "code" | "depGroup";
}

export interface ScriptConfig {
  codeHash: Hex;
  hashType: "type" | "data" | "data1" | "data2";
  cellDeps: Array<{ cellDep: CellDep }>;
}

export interface SystemScriptEntry {
  name: string;
  file?: string;
  script: ScriptConfig;
}

export interface NetworkScripts {
  [key: string]: ScriptConfig;
}

export interface NetworkSystemScripts {
  [key: string]: SystemScriptEntry;
}

export interface ScriptsConfig {
  devnet: NetworkScripts;
  testnet: NetworkScripts;
  mainnet: NetworkScripts;
}

export interface SystemScriptsConfig {
  devnet: NetworkSystemScripts;
  testnet: NetworkSystemScripts;
  mainnet: NetworkSystemScripts;
}

export interface ContractConfig {
  ckbJsVmScript: ScriptConfig;
  claimScript: ScriptConfig;
  contributionScript: ScriptConfig;
  projectScript: ScriptConfig;
}
