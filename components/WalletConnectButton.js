// components/WalletConnectButton.js
"use client";

import { useState, useEffect } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export default function WalletConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, error } = useConnect();
  const { disconnect } = useDisconnect();
  const [isMounted, setIsMounted] = useState(false);

  // Set isMounted to true after client-side mount
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleConnect = async () => {
    try {
      if (!window.ethereum) throw new Error("MetaMask not installed");
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xAA36A7" }], // Sepolia chain ID
      });
      connect({ connector: connectors[0] });
    } catch (err) {
      if (err.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0xAA36A7",
              chainName: "Sepolia",
              rpcUrls: ["https://rpc2.sepolia.org"],
              nativeCurrency: {
                name: "Sepolia ETH",
                symbol: "SEP",
                decimals: 18,
              },
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
        connect({ connector: connectors[0] });
      } else {
        console.error("Error switching network:", err);
      }
    }
  };

  // Render a static UI on the server to avoid hydration mismatch
  if (!isMounted) {
    return (
      <div className="flex items-center space-x-2">
        <button
          disabled
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-lg opacity-50 cursor-not-allowed"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  // Render dynamic UI on the client
  return (
    <div className="flex items-center space-x-2">
      {isConnected ? (
        <>
          <span className="text-sm text-gray-700 font-medium">
            {`${address?.slice(0, 6)}...${address?.slice(-4)}`}
          </span>
          <button
            onClick={() => disconnect()}
            className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700"
          >
            Disconnect
          </button>
        </>
      ) : (
        <button
          onClick={handleConnect}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-lg hover:shadow-xl"
        >
          Connect Wallet
        </button>
      )}
      {error && <p className="text-red-500 text-xs">{error.message}</p>}
    </div>
  );
}
