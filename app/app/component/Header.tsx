import ConnectWallet from "@/components/ConnectWallet";
import { ccc } from "@ckb-ccc/connector-react";
import Link from "next/link";
export interface HeaderProps {
  network: string;
  walletSigner: ccc.Signer | undefined | null;
}

export default function Header({ network, walletSigner }: HeaderProps) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-3xl font-bold pointer">
          <Link href="/">Crowdfunding</Link>
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Network: <span className="font-mono">{network}</span>
        </p>
        {!walletSigner && (
          <p className="mt-1 text-xs text-amber-700">Wallet not connected.</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <ConnectWallet />
      </div>
    </header>
  );
}
