/* eslint-disable*/
"use client"

import React, { useEffect, useState } from "react";
import { ccc } from "@ckb-ccc/connector-react";
import { truncateAddress } from "@/utils/stringUtils";

const ConnectWallet: React.FC = () => {
  const { open, wallet } = ccc.useCcc();
  const [balance, setBalance] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const signer = ccc.useSigner();

  useEffect(() => {
    let canceled = false;

    const loadWalletInfo = async () => {
      if (!signer) {
        setBalance("");
        setAddress("");
        return;
      }

      try {
        const [addr, addressObjs] = await Promise.all([
          signer.getRecommendedAddress(),
          signer.getAddressObjs(),
        ]);

        let totalCapacity = 0n;
        for (const { script } of addressObjs) {
          // Fetch full capacity for the lock script to avoid missing cells with data/type scripts.
          const capacity = await signer.client.getCellsCapacity({
            script,
            scriptType: "lock",
            scriptSearchMode: "exact",
          });
          totalCapacity += capacity;
        }

        if (canceled) return;
        setAddress(addr);
        setBalance(ccc.fixedPointToString(totalCapacity));
      } catch (error) {
        console.warn("Failed to load wallet info", error);
        if (canceled) return;
        setBalance("--");
      }
    };

    void loadWalletInfo();

    return () => {
      canceled = true;
    };
  }, [signer]);

  const renderConnectWalletBtn = () => {
    return <div className="cursor-pointer rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] text-sm sm:text-base font-bold h-10 sm:h-12 px-4 sm:px-5"
      onClick={open} >
      Connect Wallet
    </div>
  }

  const renderConnectedWalletInfo = () => {
    return <div className="cursor-pointer rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5"
      onClick={open} >
      <div className="rounded-full mr-2">
        {wallet && <img src={wallet.icon} alt="avatar" className="w-6 h-6" />}
      </div>
      <div>
        <h2 className="text-sm font-semibold">
          {balance} CKB
        </h2>
        <p className="text-xs flex items-center gap-2">
          {truncateAddress(address, 10, 6)}
        </p>
      </div>
    </div>
  }

  return (
    <div className="flex">
      {wallet ? renderConnectedWalletInfo() : renderConnectWalletBtn()}
    </div>
  );
};

export default ConnectWallet;
