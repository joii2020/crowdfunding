import { Hex } from "@ckb-ccc/connector-react";

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
