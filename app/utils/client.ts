import { ccc, CellDepInfoLike, KnownScript, Script } from '@ckb-ccc/core';
import systemScripts from "artifacts/deployment/system-scripts.json";
import { NetworkType } from 'shared';

const DEFAULT_TESTNET_SCRIPTS = new ccc.ClientPublicTestnet()
  .scripts as Record<KnownScript, KnownScriptType>;

export const buildClient = (network: NetworkType) => {
  switch (network) {
    case "devnet":
      return new ccc.ClientPublicTestnet({
        url: "http://localhost:28114", // the url from offckb devnet
        fallbacks: ["http://127.0.0.1:8114"], // devnet fallback
        scripts: DEVNET_SCRIPTS,
      });
    case "testnet":
      return new ccc.ClientPublicTestnet();
    case "mainnet":
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
