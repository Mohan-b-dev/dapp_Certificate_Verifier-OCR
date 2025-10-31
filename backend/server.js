const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const PinataSDK = require("@pinata/sdk");
const { ethers } = require("ethers");
require("dotenv").config();

console.log("Starting server...");

// Wrap initialization in an async IIFE
(async () => {
  try {
    const app = express();
    const upload = multer({ dest: "uploads/" });
    app.use(cors());
    app.use(express.json());

    const pinata = new PinataSDK(
      process.env.PINATA_API_KEY,
      process.env.PINATA_SECRET_API_KEY
    );

    // Support multiple RPC endpoints via BLOCKCHAIN_RPC_URLS (comma-separated)
    const rpcListRaw =
      process.env.BLOCKCHAIN_RPC_URLS || process.env.BLOCKCHAIN_RPC_URL || "";
    const rpcUrls = rpcListRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // If no RPC configured, use a default Sepolia RPC
    if (rpcUrls.length === 0) {
      console.log("No RPC configured, using default Sepolia RPC");
      rpcUrls.push("https://rpc.sepolia.org");
    }

    // Helper: probe a JSON-RPC URL by measuring getBlockNumber latency with a timeout
    let rpcProbeResults = [];
    let providerType = "unknown";
    let providerUsing = null;

    async function probeRpc(url, timeoutMs = 5000) {
      const p = new ethers.JsonRpcProvider(url);
      const start = Date.now();
      const timeout = new Promise((_, rej) =>
        setTimeout(() => rej(new Error("timeout")), timeoutMs)
      );
      try {
        await Promise.race([p.getBlockNumber(), timeout]);
        return Date.now() - start;
      } catch (error) {
        throw error;
      }
    }

    let provider;
    if (rpcUrls.length === 1) {
      console.log("Using single RPC provider:", rpcUrls[0]);
      provider = new ethers.JsonRpcProvider(rpcUrls[0]);
      providerType = "single";
      providerUsing = rpcUrls[0];
      rpcProbeResults = [
        { url: rpcUrls[0], status: "single", lat: null, error: null },
      ];
    } else {
      console.log("Multiple RPC providers configured:", rpcUrls);
      // Probe all providers in parallel and pick the fastest healthy ones
      const probes = await Promise.allSettled(
        rpcUrls.map((u) => probeRpc(u).then((lat) => ({ url: u, lat })))
      );

      // Normalize probe results for debugging endpoint
      rpcProbeResults = probes.map((p, idx) => ({
        url: rpcUrls[idx],
        status: p.status,
        lat: p.status === "fulfilled" ? p.value.lat : null,
        error: p.status === "rejected" ? String(p.reason) : null,
      }));

      const successes = probes
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value)
        .sort((a, b) => a.lat - b.lat);

      if (successes.length === 0) {
        console.warn(
          "No RPC endpoints responded within timeout. Falling back to first configured URL:",
          rpcUrls[0]
        );
        provider = new ethers.JsonRpcProvider(rpcUrls[0]);
        providerType = "single-fallback";
        providerUsing = rpcUrls[0];
      } else {
        console.log(
          "RPC probe results (fastest first):",
          successes.map((s) => `${s.url} (${s.lat}ms)`)
        );
        // Use the fastest provider directly instead of FallbackProvider
        provider = new ethers.JsonRpcProvider(successes[0].url);
        providerType = "single-fastest";
        providerUsing = successes[0].url;
        console.log("Using fastest RPC provider:", successes[0].url);
      }
    }

    // Expose a lightweight debug endpoint for RPC status
    app.get("/api/rpc-status", (req, res) => {
      res.json({
        rpcUrls,
        providerType,
        providerUsing,
        rpcProbeResults,
      });
    });

    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const contractABI = [
      {
        inputs: [],
        stateMutability: "nonpayable",
        type: "constructor",
      },
      {
        anonymous: false,
        inputs: [
          { indexed: true, internalType: "string", name: "id", type: "string" },
          {
            indexed: false,
            internalType: "string",
            name: "ipfsHash",
            type: "string",
          },
          {
            indexed: true,
            internalType: "address",
            name: "issuer",
            type: "address",
          },
        ],
        name: "CertificateIssued",
        type: "event",
      },
      {
        anonymous: false,
        inputs: [
          { indexed: true, internalType: "string", name: "id", type: "string" },
          {
            indexed: true,
            internalType: "address",
            name: "issuer",
            type: "address",
          },
          {
            indexed: false,
            internalType: "bool",
            name: "isValid",
            type: "bool",
          },
        ],
        name: "CertificateVerified",
        type: "event",
      },
      {
        anonymous: false,
        inputs: [
          {
            indexed: true,
            internalType: "address",
            name: "issuer",
            type: "address",
          },
        ],
        name: "IssuerAuthorized",
        type: "event",
      },
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
      {
        inputs: [{ internalType: "string", name: "", type: "string" }],
        name: "certificates",
        outputs: [
          { internalType: "string", name: "ipfsHash", type: "string" },
          { internalType: "address", name: "issuer", type: "address" },
          { internalType: "uint256", name: "issueDate", type: "uint256" },
          { internalType: "bool", name: "exists", type: "bool" },
        ],
        stateMutability: "view",
        type: "function",
      },
      {
        inputs: [
          { internalType: "string", name: "_id", type: "string" },
          { internalType: "string", name: "_ipfsHash", type: "string" },
        ],
        name: "issueCertificate",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
      {
        inputs: [{ internalType: "string", name: "_id", type: "string" }],
        name: "revokeCertificate",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
      {
        inputs: [{ internalType: "string", name: "_id", type: "string" }],
        name: "verifyCertificate",
        outputs: [
          { internalType: "string", name: "ipfsHash", type: "string" },
          { internalType: "address", name: "issuer", type: "address" },
          { internalType: "bool", name: "isValid", type: "bool" },
          { internalType: "uint256", name: "issueDate", type: "uint256" },
        ],
        stateMutability: "view",
        type: "function",
      },
    ];
    // Create contract instance with explicit typing
    const contract = new ethers.Contract(
      process.env.CONTRACT_ADDRESS,
      contractABI,
      wallet
    );

    // Verify contract connection
    try {
      const code = await provider.getCode(process.env.CONTRACT_ADDRESS);
      if (code === "0x") {
        throw new Error("No contract found at the specified address");
      }
      console.log("✅ Contract verified at:", process.env.CONTRACT_ADDRESS);
    } catch (error) {
      console.error("❌ Contract verification failed:", error.message);
      throw error;
    }

    const DB_PATH = path.join(__dirname, "db.json");

    function loadDB() {
      if (fs.existsSync(DB_PATH)) {
        return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
      }
      return {};
    }

    function saveDB(db) {
      fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    }

    app.get("/api/health", (req, res) => {
      res.json({
        status: "OK",
        message: "Backend running normally",
        timestamp: new Date().toISOString(),
      });
    });

    // FIXED: Upload certificate endpoint (back to working version logic)
    app.post(
      "/api/upload-certificate",
      upload.single("file"),
      async (req, res) => {
        console.log("=== UPLOAD STARTED ===");
        const { certificateId } = req.body;
        const file = req.file;

        if (!file || !certificateId) {
          if (file) fs.unlinkSync(file.path);
          return res
            .status(400)
            .json({ error: "File and Certificate ID required" });
        }

        // Enforce PDF only
        if (file.mimetype !== "application/pdf") {
          fs.unlinkSync(file.path);
          return res
            .status(400)
            .json({ error: "Only PDF files are supported" });
        }

        const normalizedId = certificateId.replace(/[^a-zA-Z0-9]/g, "_");
        const db = loadDB();

        // Check duplicate ID
        if (db[normalizedId]) {
          fs.unlinkSync(file.path);
          return res
            .status(400)
            .json({ error: "Certificate ID already exists" });
        }

        // Compute file hash to prevent duplicate content
        const fileBuffer = fs.readFileSync(file.path);
        const fileHash = crypto
          .createHash("sha256")
          .update(fileBuffer)
          .digest("hex");
        for (const [existingId, entry] of Object.entries(db)) {
          if (entry.fileHash === fileHash && existingId !== normalizedId) {
            fs.unlinkSync(file.path);
            return res.status(400).json({
              error:
                "This certificate content is already registered under another ID",
            });
          }
        }

        try {
          // Upload to Pinata IPFS
          console.log("Uploading to Pinata...");
          const ipfsResult = await pinata.pinFileToIPFS(
            fs.createReadStream(file.path),
            {
              pinataMetadata: { name: `${normalizedId}.pdf` },
            }
          );
          const ipfsHash = ipfsResult.IpfsHash;
          console.log("IPFS Upload successful, hash:", ipfsHash);

          // Check if wallet is authorized
          console.log("Checking authorization for:", wallet.address);
          const isAuthorized = await contract.authorizedIssuers(wallet.address);
          console.log("Is authorized:", isAuthorized);

          if (!isAuthorized) {
            // Check if this wallet is the admin
            const admin = await contract.admin();
            console.log("Contract admin:", admin);
            const isAdmin =
              admin.toLowerCase() === wallet.address.toLowerCase();
            console.log("Is wallet admin?", isAdmin);

            if (isAdmin) {
              // Wallet is admin, authorize itself
              console.log("Authorizing issuer (wallet is admin)...");
              try {
                const gasEstimate = await contract.authorizeIssuer.estimateGas(
                  wallet.address
                );
                console.log(
                  "Gas estimate for authorize:",
                  gasEstimate.toString()
                );

                const authTx = await contract.authorizeIssuer(wallet.address, {
                  gasLimit: Math.floor(Number(gasEstimate) * 1.5),
                });
                console.log("Authorization tx sent:", authTx.hash);
                const authReceipt = await authTx.wait();
                console.log(
                  "Authorization confirmed, status:",
                  authReceipt.status
                );

                if (authReceipt.status === 0) {
                  throw new Error("Authorization transaction failed");
                }
              } catch (authError) {
                console.error("Authorization failed:", authError);
                throw new Error(
                  `Failed to authorize issuer: ${authError.message}`
                );
              }
            } else {
              // Wallet is not admin and not authorized
              throw new Error(
                `Wallet ${wallet.address} is not authorized to issue certificates. ` +
                  `Please contact the contract admin (${admin}) to authorize this wallet, ` +
                  `or use the admin wallet's private key in your .env file.`
              );
            }
          }

          // Interact with contract
          console.log("Issuing certificate on blockchain...");
          console.log("Certificate ID:", certificateId);
          console.log("IPFS Hash:", ipfsHash);

          try {
            // Estimate gas first
            const gasEstimate = await contract.issueCertificate.estimateGas(
              certificateId,
              ipfsHash
            );
            console.log("Gas estimate for issue:", gasEstimate.toString());

            const issueTx = await contract.issueCertificate(
              certificateId,
              ipfsHash,
              {
                gasLimit: Math.floor(Number(gasEstimate) * 1.5), // 50% buffer
              }
            );
            console.log("Issue tx sent:", issueTx.hash);
            console.log("Waiting for confirmation...");

            const issueReceipt = await issueTx.wait();
            console.log("Transaction confirmed, status:", issueReceipt.status);

            if (issueReceipt.status === 0) {
              throw new Error("Certificate issuance transaction reverted");
            }

            console.log("Certificate issued on blockchain, tx confirmed");
          } catch (issueError) {
            console.error("Issue transaction failed:", issueError);

            // Try to get more details about the revert
            try {
              await contract.issueCertificate.staticCall(
                certificateId,
                ipfsHash
              );
            } catch (staticError) {
              console.error(
                "Static call error (revert reason):",
                staticError.message
              );
              throw new Error(`Contract revert: ${staticError.message}`);
            }

            throw issueError;
          }

          // Fetch issueDate from contract to ensure consistency
          const [contractIpfsHash, issuer, isValid, issueDate] =
            await contract.verifyCertificate(certificateId);
          if (!isValid || contractIpfsHash !== ipfsHash) {
            throw new Error("Contract verification failed after issuance");
          }

          // Save to local DB with contract's issueDate
          const filePath = path.join("uploads", `${ipfsHash}.pdf`);
          console.log("Renaming file to:", filePath);
          fs.renameSync(file.path, filePath);
          if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
            throw new Error("Failed to save file locally or file is empty");
          }
          console.log(
            "File saved successfully, size:",
            fs.statSync(filePath).size,
            "bytes"
          );

          db[normalizedId] = {
            fileHash,
            ipfsHash,
            issuer: wallet.address,
            issueDate: issueDate.toString(),
            filePath,
          };
          saveDB(db);
          console.log("Database updated");

          console.log("=== UPLOAD COMPLETED ===");
          res.json({
            success: true,
            certificateId,
            ipfsHash,
            message: "Certificate issued successfully",
          });
        } catch (error) {
          console.error("Upload error:", error.message);
          if (file && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
          res.status(500).json({ error: error.message });
        }
      }
    );

    app.post("/api/verify-certificate", async (req, res) => {
      try {
        const { certificateId } = req.body;
        if (!certificateId) {
          return res.status(400).json({ error: "Certificate ID required" });
        }

        console.log("🔍 Verification request for:", certificateId);
        const [ipfsHash, issuer, isValid, issueDate] =
          await contract.verifyCertificate(certificateId);

        if (!isValid) {
          console.log("❌ Certificate not found:", certificateId);
          return res.json({
            valid: false,
            certificateId,
            error: "Certificate not found",
          });
        }

        console.log("✅ Certificate found:", ipfsHash);
        const issueDateNum = Number(issueDate);
        const issueDateReadable = new Date(
          issueDateNum * 1000
        ).toLocaleString();
        res.json({
          valid: true,
          certificateId,
          issuer,
          issueDate: issueDateReadable,
          ipfsHash,
          message: "Certificate verified successfully",
        });
      } catch (error) {
        console.error("Verification error:", error);
        res
          .status(500)
          .json({ error: "Verification failed", details: error.message });
      }
    });

    app.get("/api/download-certificate", async (req, res) => {
      try {
        const { certificateId, download } = req.query;

        if (!certificateId) {
          return res.status(400).json({ error: "Certificate ID required" });
        }

        console.log(
          "📥 Download request for:",
          certificateId,
          "download flag:",
          download
        );

        const db = loadDB();
        const normalizedId = certificateId.replace(/[^a-zA-Z0-9]/g, "_");
        const entry = db[normalizedId];

        if (!entry || !entry.filePath) {
          return res
            .status(404)
            .json({ error: "Certificate file not found in local database" });
        }

        const filePath = entry.filePath;
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({
            error:
              "Certificate file not available on server. The file may have been moved or deleted.",
          });
        }

        console.log("✅ Serving file from:", filePath);

        if (download === "true") {
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="certificate_${certificateId}.pdf"`
          );
        } else {
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader(
            "Content-Disposition",
            `inline; filename="certificate_${certificateId}.pdf"`
          );
        }

        res.sendFile(path.resolve(filePath));
      } catch (error) {
        console.error("❌ Download error:", error.message);
        res.status(500).json({
          error: "Failed to download certificate",
          details: error.message,
        });
      }
    });

    app.get("/api/view-certificate", async (req, res) => {
      try {
        const { certificateId } = req.query;

        if (!certificateId) {
          return res.status(400).json({ error: "Certificate ID required" });
        }

        console.log("👀 View request for:", certificateId);

        const db = loadDB();
        const normalizedId = certificateId.replace(/[^a-zA-Z0-9]/g, "_");
        const entry = db[normalizedId];

        if (!entry || !entry.filePath) {
          return res
            .status(404)
            .json({ error: "Certificate file not found in local database" });
        }

        const filePath = entry.filePath;
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({
            error:
              "Certificate file not available on server. The file may have been moved or deleted.",
          });
        }

        console.log("✅ Viewing file from:", filePath);

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="certificate_${certificateId}.pdf"`
        );
        res.sendFile(path.resolve(filePath));
      } catch (error) {
        console.error("❌ View error:", error.message);
        res.status(500).json({
          error: "Failed to view certificate",
          details: error.message,
        });
      }
    });

    // Register institution mapping to a wallet address
    app.post("/api/register-institution", async (req, res) => {
      try {
        const { institution, address, signature, pin } = req.body;
        if (!institution || !address || !signature) {
          return res
            .status(400)
            .json({ error: "institution, address and signature are required" });
        }

        // Verify signature
        const message =
          typeof institution === "string"
            ? institution
            : JSON.stringify(institution);
        let recovered;
        try {
          recovered = ethers.verifyMessage(message, signature);
        } catch (error) {
          console.warn("Invalid signature format:", error.message);
          return res.status(400).json({ error: "Invalid signature format" });
        }
        if (recovered.toLowerCase() !== address.toLowerCase()) {
          return res
            .status(401)
            .json({ error: "Signature does not match address" });
        }

        const db = loadDB();
        // Store as a pending request unless the requester is the configured ADMIN_ADDRESS
        db.institutionRequests = db.institutionRequests || {};
        db.institutions = db.institutions || {};

        const requester = address.toLowerCase();
        const configuredAdmin = (process.env.ADMIN_ADDRESS || "").toLowerCase();

        // Optionally pin the institution data now (optional)
        let ipfsHash = null;
        if (pin) {
          try {
            const pinResult = await pinata.pinJSONToIPFS(institution);
            ipfsHash = pinResult.IpfsHash;
          } catch (error) {
            console.warn("Pinning institution to IPFS failed:", error.message);
          }
        }

        const now = new Date().toISOString();

        if (configuredAdmin && requester === configuredAdmin) {
          // Auto-approve admin registrations
          db.institutions[requester] = {
            institution,
            ipfsHash,
            registeredAt: now,
          };
          saveDB(db);
          return res.json({
            success: true,
            ipfsHash,
            message: "Admin institution registered",
          });
        }

        // Create a pending request
        db.institutionRequests[requester] = {
          institution,
          ipfsHash,
          requestedAt: now,
          status: "pending",
        };
        saveDB(db);

        return res.json({
          success: true,
          message:
            "Institution registration submitted and pending admin approval",
        });
      } catch (error) {
        console.error("Register institution error:", error.message);
        return res.status(500).json({ error: error.message });
      }
    });

    // Retrieve institution mapping for a wallet address
    app.get("/api/institution/:address", (req, res) => {
      try {
        const { address } = req.params;
        if (!address)
          return res.status(400).json({ error: "Address required" });
        const db = loadDB();
        const entry = db.institutions && db.institutions[address.toLowerCase()];
        if (!entry)
          return res
            .status(404)
            .json({ error: "No institution found for address" });
        return res.json({
          success: true,
          institution: entry.institution,
          ipfsHash: entry.ipfsHash,
          registeredAt: entry.registeredAt,
        });
      } catch (error) {
        console.error("Get institution error:", error.message);
        return res.status(500).json({ error: error.message });
      }
    });

    // Admin: list pending institution requests
    app.get("/api/admin/requests", (req, res) => {
      try {
        const adminHeader = (req.get("x-admin-address") || "").toLowerCase();
        const configuredAdmin = (process.env.ADMIN_ADDRESS || "").toLowerCase();
        if (!configuredAdmin || adminHeader !== configuredAdmin) {
          return res
            .status(401)
            .json({ error: "Unauthorized: admin header missing or incorrect" });
        }

        const db = loadDB();
        const requests = db.institutionRequests || {};
        return res.json({ success: true, requests });
      } catch (error) {
        console.error("Get admin requests error:", error.message);
        return res.status(500).json({ error: error.message });
      }
    });

    // Admin: approve a pending institution request
    app.post("/api/admin/requests/:address/approve", async (req, res) => {
      try {
        const adminHeader = (req.get("x-admin-address") || "").toLowerCase();
        const configuredAdmin = (process.env.ADMIN_ADDRESS || "").toLowerCase();
        if (!configuredAdmin || adminHeader !== configuredAdmin) {
          return res
            .status(401)
            .json({ error: "Unauthorized: admin header missing or incorrect" });
        }

        const target = (req.params.address || "").toLowerCase();
        if (!target) return res.status(400).json({ error: "Address required" });

        const db = loadDB();
        db.institutionRequests = db.institutionRequests || {};
        const request = db.institutionRequests[target];
        if (!request)
          return res
            .status(404)
            .json({ error: "No pending request for that address" });

        // Move to institutions
        db.institutions = db.institutions || {};
        const now = new Date().toISOString();

        // Optionally pin to IPFS if not already pinned
        let ipfsHash = request.ipfsHash || null;
        if (!ipfsHash) {
          try {
            const pinResult = await pinata.pinJSONToIPFS(request.institution);
            ipfsHash = pinResult.IpfsHash;
          } catch (pinErr) {
            console.warn("Pinning at approval failed:", pinErr.message);
          }
        }

        db.institutions[target] = {
          institution: request.institution,
          ipfsHash,
          registeredAt: now,
        };

        // mark the request approved
        request.status = "approved";
        request.handledAt = now;

        // Persist
        saveDB(db);

        // Try to authorize the issuer on-chain if this server wallet is the contract admin
        try {
          const contractAdmin = await contract.admin();
          if (contractAdmin.toLowerCase() === wallet.address.toLowerCase()) {
            console.log(
              "Server wallet is contract admin; authorizing issuer:",
              target
            );
            try {
              const gasEstimate = await contract.authorizeIssuer.estimateGas(
                target
              );
              const authTx = await contract.authorizeIssuer(target, {
                gasLimit: Math.floor(Number(gasEstimate) * 1.5),
              });
              console.log("Authorize tx sent:", authTx.hash);
              const authReceipt = await authTx.wait();
              console.log("Authorize receipt status:", authReceipt.status);
            } catch (authErr) {
              console.warn("Contract authorizeIssuer failed:", authErr.message);
            }
          } else {
            console.log(
              "Server wallet is not contract admin; skipping on-chain authorize for:",
              target
            );
          }
        } catch (err) {
          console.warn(
            "Failed to check/authorize on-chain during approval:",
            err.message
          );
        }

        return res.json({ success: true, address: target, registeredAt: now });
      } catch (error) {
        console.error("Approve request error:", error.message);
        return res.status(500).json({ error: error.message });
      }
    });

    // Admin: reject a pending institution request
    app.post("/api/admin/requests/:address/reject", (req, res) => {
      try {
        const adminHeader = (req.get("x-admin-address") || "").toLowerCase();
        const configuredAdmin = (process.env.ADMIN_ADDRESS || "").toLowerCase();
        if (!configuredAdmin || adminHeader !== configuredAdmin) {
          return res
            .status(401)
            .json({ error: "Unauthorized: admin header missing or incorrect" });
        }

        const target = (req.params.address || "").toLowerCase();
        if (!target) return res.status(400).json({ error: "Address required" });

        const db = loadDB();
        db.institutionRequests = db.institutionRequests || {};
        const request = db.institutionRequests[target];
        if (!request)
          return res
            .status(404)
            .json({ error: "No pending request for that address" });

        request.status = "rejected";
        request.handledAt = new Date().toISOString();
        saveDB(db);

        return res.json({ success: true, address: target, status: "rejected" });
      } catch (error) {
        console.error("Reject request error:", error.message);
        return res.status(500).json({ error: error.message });
      }
    });

    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`📁 Uploads directory: ${path.join(__dirname, "uploads")}`);
      console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error("Server failed to start:", error.message);
    process.exit(1);
  }
})();
