// components/WalletConnectButton.jsx
"use client";

import { useState, useEffect } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export default function WalletConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const [isMounted, setIsMounted] = useState(false);
  const [error, setError] = useState(null);
  const [isMetaMaskInstalled, setIsMetaMaskInstalled] = useState(false);

  // Set isMounted to true after client-side mount and check for MetaMask
  useEffect(() => {
    setIsMounted(true);

    // Check if MetaMask is installed
    if (typeof window !== "undefined" && window.ethereum) {
      setIsMetaMaskInstalled(true);
    }
  }, []);

  const handleConnect = async () => {
    try {
      setError(null);

      // Check if MetaMask is installed
      if (typeof window === "undefined" || !window.ethereum) {
        setError(
          "MetaMask is not installed. Please install MetaMask to continue."
        );
        // Open MetaMask download page
        window.open("https://metamask.io/download/", "_blank");
        return;
      }

      // Check if we have connectors available
      if (!connectors || connectors.length === 0) {
        throw new Error("No wallet connectors available");
      }

      try {
        // Try to switch to Sepolia network
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0xAA36A7" }], // Sepolia chain ID (11155111 in hex)
        });
      } catch (switchError) {
        // This error code indicates that the chain has not been added to MetaMask
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: "0xAA36A7",
                  chainName: "Sepolia Testnet",
                  rpcUrls: ["https://rpc.sepolia.org"],
                  nativeCurrency: {
                    name: "Sepolia ETH",
                    symbol: "SepoliaETH",
                    decimals: 18,
                  },
                  blockExplorerUrls: ["https://sepolia.etherscan.io"],
                },
              ],
            });
          } catch (addError) {
            console.error("Error adding network:", addError);
            throw new Error("Failed to add Sepolia network to MetaMask");
          }
        } else {
          console.error("Error switching network:", switchError);
          // Continue anyway - user might have cancelled
        }
      }

      // Connect wallet using the first available connector (MetaMask)
      await connect({ connector: connectors[0] });
    } catch (err) {
      console.error("Connection error:", err);
      setError(err.message || "Failed to connect wallet");
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
    <div className="flex flex-col items-end space-y-2">
      <div className="flex items-center space-x-2">
        {isConnected ? (
          <>
            <div className="flex items-center space-x-2 bg-green-50 px-3 py-2 rounded-lg border border-green-200">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-700 font-medium font-mono">
                {`${address?.slice(0, 6)}...${address?.slice(-4)}`}
              </span>
            </div>
            <button
              onClick={() => disconnect()}
              className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all duration-200 text-sm font-semibold shadow-md hover:shadow-lg"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            onClick={handleConnect}
            className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 text-sm font-semibold flex items-center space-x-2 hover:from-blue-700 hover:to-indigo-700 transform hover:-translate-y-0.5"
          >
            {!isMetaMaskInstalled && (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            )}
            <span>
              {isMetaMaskInstalled ? "Connect Wallet" : "Install MetaMask"}
            </span>
          </button>
        )}
      </div>

      {/* Error display */}
      {(error || connectError) && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 max-w-xs">
          <p className="text-red-600 text-xs font-medium">
            {error || connectError?.message}
          </p>
        </div>
      )}

      {/* Helper text for non-MetaMask users */}
      {!isConnected && !isMetaMaskInstalled && isMounted && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 max-w-xs">
          <p className="text-yellow-800 text-xs">
            MetaMask extension required to connect your wallet
          </p>
        </div>
      )}
    </div>
  );
}
