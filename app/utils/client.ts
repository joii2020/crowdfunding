import { ccc, CellDepInfoLike, KnownScript, Script } from '@ckb-ccc/core';
import systemScripts from "artifacts/deployment/system-scripts.json";
export const buildClient = (network: 'devnet' | 'testnet' | 'mainnet') => {
  switch (network) {
    case 'devnet':
      return new ccc.ClientPublicTestnet({
        url: 'http://localhost:28114', // the url from offckb devnet
        scripts: DEVNET_SCRIPTS,
      });
    case 'testnet':
      return new ccc.ClientPublicTestnet();
    case 'mainnet':
      return new ccc.ClientPublicMainnet();

    default:
      throw new Error(`Unsupported network: ${network}`);
  }
};

export type KnownScriptType = Pick<Script, "codeHash" | "hashType"> & {
  cellDeps: CellDepInfoLike[];
};

export const DEVNET_SCRIPTS: Record<string, KnownScriptType> = {
  [KnownScript.Secp256k1Blake160]: systemScripts.devnet
    .secp256k1_blake160_sighash_all!.script as KnownScriptType,
  [KnownScript.Secp256k1Multisig]: systemScripts.devnet
    .secp256k1_blake160_multisig_all!.script as KnownScriptType,
  [KnownScript.NervosDao]: systemScripts.devnet.dao!.script as KnownScriptType,
  [KnownScript.AnyoneCanPay]: systemScripts.devnet.anyone_can_pay!
    .script as KnownScriptType,
  [KnownScript.OmniLock]: systemScripts.devnet.omnilock!
    .script as KnownScriptType,
  [KnownScript.XUdt]: systemScripts.devnet.xudt!.script as KnownScriptType,
};
export type NetworkType = "devnet" | "testnet" | "mainnet";

export const getNetwork = (): NetworkType => {
  const network = process.env.NEXT_PUBLIC_CKB_NETWORK;

  if (network === "devnet" || network === "testnet" || network === "mainnet") {
    return network;
  }

  // Default to devnet if not specified or invalid
  return "devnet";
};