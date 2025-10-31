"use client";
import React, { useState, useEffect } from "react";

type PendingRequest = {
  address: string;
  institution?: Record<string, unknown>;
  ipfsHash?: string | null;
  requestedAt?: string;
  status?: string;
};

export default function AdminAuthorizePage() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [contractAdmin, setContractAdmin] = useState<string>("");
  const [newIssuerAddress, setNewIssuerAddress] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [authorizedIssuers, setAuthorizedIssuers] = useState<
    Array<{ address: string; txHash?: string }>
  >([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);

  const CONTRACT_ADDRESS = "0xYourContractAddress"; // Replace with your actual contract address
  const CONTRACT_ABI = [
    {
      inputs: [],
      name: "admin",
      outputs: [{ internalType: "address", name: "", type: "address" }],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [{ internalType: "address", name: "_issuer", type: "address" }],
      name: "authorizeIssuer",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [{ internalType: "address", name: "", type: "address" }],
      name: "authorizedIssuers",
      outputs: [{ internalType: "bool", name: "", type: "bool" }],
      stateMutability: "view",
      type: "function",
    },
  ];

  useEffect(() => {
    connectWallet();
  }, []);

  useEffect(() => {
    if (isAdmin && walletAddress) fetchPendingRequests();
  }, [isAdmin, walletAddress]);

  const connectWallet = async () => {
    try {
      if (typeof window !== "undefined" && window.ethereum) {
        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        });
        if (accounts && accounts[0]) {
          setWalletAddress(accounts[0]);
          await checkAdminStatus(accounts[0]);
        }
      } else {
        setMessage("⚠️ MetaMask not detected. Please install MetaMask.");
      }
    } catch (error) {
      console.error("Wallet connection error:", error);
      setMessage("Failed to connect wallet.");
    }
  };

  const checkAdminStatus = async (address: string) => {
    try {
      const { ethers } = await import("ethers");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        provider
      );

      const admin = await contract.admin();
      setContractAdmin(admin);

      const isAdminWallet = admin.toLowerCase() === address.toLowerCase();
      setIsAdmin(isAdminWallet);

      if (isAdminWallet) {
        setMessage(`✅ Connected as Admin: ${address}`);
      } else {
        setMessage(
          `❌ Not authorized. This wallet is not the contract admin.\nContract Admin: ${admin}`
        );
      }
    } catch (error) {
      console.error("Admin check error:", error);
      setMessage("Failed to check admin status.");
    }
  };

  const checkIfAuthorized = async (address: string) => {
    try {
      const { ethers } = await import("ethers");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        provider
      );
      return await contract.authorizedIssuers(address);
    } catch (error) {
      console.error("Authorization check error:", error);
      return false;
    }
  };

  const authorizeIssuer = async () => {
    if (!isAdmin) {
      setMessage("❌ Only the admin can authorize issuers.");
      return;
    }

    if (
      !newIssuerAddress ||
      !newIssuerAddress.startsWith("0x") ||
      newIssuerAddress.length !== 42
    ) {
      setMessage("❌ Please enter a valid Ethereum address.");
      return;
    }

    setIsLoading(true);
    setMessage("🔄 Authorizing issuer...");

    try {
      const { ethers } = await import("ethers");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        signer
      );

      // Check if already authorized
      const isAlreadyAuthorized = await checkIfAuthorized(newIssuerAddress);
      if (isAlreadyAuthorized) {
        setMessage(`ℹ️ Address ${newIssuerAddress} is already authorized.`);
        setIsLoading(false);
        return;
      }

      // Authorize the issuer
      const tx = await contract.authorizeIssuer(newIssuerAddress);
      setMessage(
        `🔄 Transaction sent: ${tx.hash}\nWaiting for confirmation...`
      );

      const receipt = await tx.wait();

      if (receipt.status === 1) {
        setMessage(
          `✅ Successfully authorized issuer!\nAddress: ${newIssuerAddress}\nTransaction: ${tx.hash}`
        );
        setNewIssuerAddress("");

        // Add to authorized list
        setAuthorizedIssuers((prev) => [
          ...prev,
          { address: newIssuerAddress, txHash: tx.hash },
        ]);
      } else {
        setMessage("❌ Transaction failed.");
      }
    } catch (error: any) {
      console.error("Authorization error:", error);
      setMessage(`❌ Authorization failed: ${error?.message || String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const authorizeSelf = async () => {
    if (!walletAddress) {
      setMessage("❌ Please connect your wallet first.");
      return;
    }

    setNewIssuerAddress(walletAddress);
    setTimeout(() => authorizeIssuer(), 100);
  };

  const backendBase =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

  const fetchPendingRequests = async () => {
    try {
      const resp = await fetch(`${backendBase}/api/admin/requests`, {
        headers: { "x-admin-address": walletAddress || "" },
      });
      const json = await resp.json();
      if (json && json.success) {
        // Convert object map to array for UI
        const items = Object.entries(json.requests || {}).map(
          ([addr, data]) => ({ address: addr, ...(data as any) })
        );
        setPendingRequests(items);
      } else {
        setPendingRequests([]);
      }
    } catch (err: any) {
      console.warn("Failed to fetch pending requests:", err);
    }
  };

  const handleApprove = async (address: string) => {
    try {
      setIsLoading(true);
      const resp = await fetch(
        `${backendBase}/api/admin/requests/${address}/approve`,
        {
          method: "POST",
          headers: { "x-admin-address": walletAddress || "" },
        }
      );
      const json = await resp.json();
      if (json && json.success) {
        setMessage(`✅ Approved ${address}`);
        fetchPendingRequests();
      } else {
        setMessage(`❌ Approve failed: ${json.error || "unknown"}`);
      }
    } catch (err: any) {
      console.error("Approve error:", err);
      setMessage(`❌ Approve failed: ${err?.message || String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async (address: string) => {
    try {
      setIsLoading(true);
      const resp = await fetch(
        `${backendBase}/api/admin/requests/${address}/reject`,
        {
          method: "POST",
          headers: { "x-admin-address": walletAddress || "" },
        }
      );
      const json = await resp.json();
      if (json && json.success) {
        setMessage(`✅ Rejected ${address}`);
        fetchPendingRequests();
      } else {
        setMessage(`❌ Reject failed: ${json.error || "unknown"}`);
      }
    } catch (err: any) {
      console.error("Reject error:", err);
      setMessage(`❌ Reject failed: ${err?.message || String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="text-7xl mb-4">🔐</div>
          <h1 className="text-5xl font-bold text-white mb-4">
            Admin Authorization Panel
          </h1>
          <p className="text-xl text-gray-300">
            Authorize wallets to issue certificates on the blockchain
          </p>
        </div>

        {/* Wallet Status */}
        {!walletAddress ? (
          <div className="bg-yellow-500 bg-opacity-20 border-2 border-yellow-400 rounded-2xl p-8 mb-8 text-center backdrop-blur-sm">
            <div className="text-5xl mb-4">⚠️</div>
            <p className="text-xl font-bold text-white mb-4">
              Wallet Not Connected
            </p>
            <button
              onClick={connectWallet}
              className="px-8 py-3 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-400 transition"
            >
              Connect MetaMask
            </button>
          </div>
        ) : (
          <div
            className={`${
              isAdmin ? "bg-green-500" : "bg-red-500"
            } bg-opacity-20 border-2 ${
              isAdmin ? "border-green-400" : "border-red-400"
            } rounded-2xl p-6 mb-8 backdrop-blur-sm`}
          >
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-bold text-white mb-1">
                  {isAdmin ? "✅ Admin Wallet" : "❌ Not Admin"}
                </p>
                <p className="text-xs font-mono text-gray-200">
                  {walletAddress}
                </p>
                {contractAdmin && (
                  <p className="text-xs text-gray-300 mt-2">
                    Contract Admin: {contractAdmin}
                  </p>
                )}
              </div>
              <div className="text-4xl">{isAdmin ? "✅" : "❌"}</div>
            </div>
          </div>
        )}

        {/* Authorization Form */}
        {isAdmin && (
          <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-3xl shadow-2xl p-8 border border-white border-opacity-20 mb-8">
            <h2 className="text-3xl font-bold text-white mb-6 flex items-center">
              <span className="mr-3">👤</span> Authorize New Issuer
            </h2>

            <div className="mb-6">
              <label className="block text-white font-bold mb-3 text-lg">
                Wallet Address to Authorize
              </label>
              <input
                type="text"
                value={newIssuerAddress}
                onChange={(e) => setNewIssuerAddress(e.target.value)}
                placeholder="0x..."
                className="w-full px-6 py-4 text-lg font-mono bg-white bg-opacity-20 text-white border-2 border-white border-opacity-30 rounded-xl focus:border-blue-400 focus:ring-4 focus:ring-blue-400 focus:ring-opacity-30 transition-all placeholder-gray-400"
                disabled={isLoading}
              />
            </div>

            <div className="flex gap-4">
              <button
                onClick={authorizeIssuer}
                disabled={isLoading || !newIssuerAddress}
                className="flex-1 py-4 px-6 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-500 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isLoading ? "⏳ Authorizing..." : "✅ Authorize Issuer"}
              </button>

              <button
                onClick={authorizeSelf}
                disabled={isLoading}
                className="py-4 px-6 bg-purple-600 text-white text-lg font-bold rounded-xl hover:bg-purple-500 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Authorize Self
              </button>
            </div>
          </div>
        )}

        {/* Message Display */}
        {message && (
          <div
            className={`p-6 rounded-2xl border-2 backdrop-blur-sm ${
              message.includes("✅") || message.includes("Successfully")
                ? "bg-green-500 bg-opacity-20 border-green-400"
                : message.includes("❌") || message.includes("failed")
                ? "bg-red-500 bg-opacity-20 border-red-400"
                : "bg-blue-500 bg-opacity-20 border-blue-400"
            }`}
          >
            <pre className="text-white whitespace-pre-wrap font-medium">
              {message}
            </pre>
          </div>
        )}

        {/* Authorized Issuers List */}
        {/* Pending Institution Requests (admin) */}
        {pendingRequests.length > 0 && (
          <div className="mt-8 bg-white bg-opacity-10 backdrop-blur-lg rounded-2xl p-6 border border-white border-opacity-20">
            <h3 className="text-2xl font-bold text-white mb-4">
              Pending Institution Requests
            </h3>
            <div className="space-y-4">
              {pendingRequests.map((req) => (
                <div
                  key={req.address}
                  className="bg-white bg-opacity-5 rounded-lg p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="text-white font-mono text-sm">
                      {req.address}
                    </p>
                    <p className="text-gray-300 text-xs mt-1">
                      {(req.institution as any)?.companyName ||
                        (req.institution as any)?.companyId ||
                        ""}
                    </p>
                    <p className="text-gray-400 text-xs mt-1">
                      Requested: {req.requestedAt}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleApprove(req.address)}
                      disabled={isLoading}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(req.address)}
                      disabled={isLoading}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {authorizedIssuers.length > 0 && (
          <div className="mt-8 bg-white bg-opacity-10 backdrop-blur-lg rounded-2xl p-6 border border-white border-opacity-20">
            <h3 className="text-2xl font-bold text-white mb-4">
              Recently Authorized
            </h3>
            <div className="space-y-3">
              {authorizedIssuers.map((issuer, idx) => (
                <div
                  key={idx}
                  className="bg-white bg-opacity-10 rounded-lg p-4"
                >
                  <p className="text-white font-mono text-sm">
                    {issuer.address}
                  </p>
                  <p className="text-gray-400 text-xs mt-1">
                    Tx: {issuer.txHash}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="mt-12 bg-white bg-opacity-10 backdrop-blur-lg rounded-2xl p-6 border border-white border-opacity-20">
          <h3 className="text-xl font-bold text-white mb-4">📋 How to Use</h3>
          <ol className="text-gray-200 space-y-2 list-decimal list-inside">
            <li>
              Connect with the admin wallet (the wallet that deployed the
              contract)
            </li>
            <li>
              Enter the address of the wallet you want to authorize to issue
              certificates
            </li>
            <li>
              Click "Authorize Issuer" and confirm the transaction in MetaMask
            </li>
            <li>
              Once confirmed, that wallet can now upload and issue certificates
            </li>
            <li>
              You can authorize your own wallet by clicking "Authorize Self"
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
