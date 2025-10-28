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

// Wrap initialization in an async IIFE so we can probe RPC endpoints at startup
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
      await Promise.race([p.getBlockNumber(), timeout]);
      return Date.now() - start;
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
      } else {
        console.log(
          "RPC probe results (fastest first):",
          successes.map((s) => `${s.url} (${s.lat}ms)`)
        );
        try {
          const providers = successes.map(
            (s) => new ethers.JsonRpcProvider(s.url)
          );
          // Assign priority based on probe order (lower number = higher priority)
          const fallbackList = providers.map((p, idx) => ({
            provider: p,
            priority: idx + 1,
          }));
          provider = new ethers.FallbackProvider(fallbackList);
          providerType = "fallback";
          providerUsing = successes.map((s) => s.url);
          console.log(
            "Using ethers.FallbackProvider for RPC failover (prioritized by latency)"
          );
        } catch (error) {
          console.warn(
            "FallbackProvider init failed, using fastest URL directly:",
            error && error.message ? error.message : error
          );
          provider = new ethers.JsonRpcProvider(successes[0].url);
          providerType = "single-fallback";
          providerUsing = successes[0].url;
        }
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
    const contract = new ethers.Contract(
      process.env.CONTRACT_ADDRESS,
      contractABI,
      wallet
    );

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

    // Simple retry helper for unreliable RPC/providers or network blips
    async function retry(fn, attempts = 3, delayMs = 1000) {
      let lastErr;
      for (let i = 0; i < attempts; i++) {
        try {
          return await fn();
        } catch (error) {
          lastErr = error;
          console.warn(
            `Retry ${i + 1}/${attempts} failed:`,
            error && error.message ? error.message : error
          );
          // exponential backoff
          await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
        }
      }
      throw lastErr;
    }

    // (RPC timeout detection handled inline where needed)

    app.get("/api/health", (req, res) => {
      res.json({
        status: "OK",
        message: "Backend running normally",
        timestamp: new Date().toISOString(),
      });
    });

    // ==============================================
    // UPDATED: /api/upload-certificate (WITH INSTITUTION)
    // ==============================================
    app.post(
      "/api/upload-certificate",
      upload.single("file"),
      async (req, res) => {
        console.log("=== UPLOAD STARTED ===");
        const { certificateId } = req.body;
        const file = req.file;

        // ---------- 1. Basic validation ----------
        if (!file || !certificateId) {
          if (file) fs.unlinkSync(file.path);
          return res
            .status(400)
            .json({ error: "File and Certificate ID required" });
        }

        if (file.mimetype !== "application/pdf") {
          fs.unlinkSync(file.path);
          return res
            .status(400)
            .json({ error: "Only PDF files are supported" });
        }

        // ---------- 2. Normalise ID ----------
        const normalizedId = certificateId.replace(/[^a-zA-Z0-9]/g, "_");
        const db = loadDB();

        // ---------- 4. Duplicate checks ----------
        if (db[normalizedId]) {
          fs.unlinkSync(file.path);
          return res
            .status(400)
            .json({ error: "Certificate ID already exists" });
        }

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

        // ---------- 5. Pinata + Blockchain ----------
        try {
          console.log("Uploading to Pinata...");
          const ipfsResult = await pinata.pinFileToIPFS(
            fs.createReadStream(file.path),
            {
              pinataMetadata: { name: `${normalizedId}.pdf` },
            }
          );
          const ipfsHash = ipfsResult.IpfsHash;
          console.log("IPFS Upload successful, hash:", ipfsHash);

          // Authorise wallet if needed (with retries for flaky RPC)
          const isAuthorized = await retry(
            () => contract.authorizedIssuers(wallet.address),
            3,
            2000
          );
          if (!isAuthorized) {
            console.log("Authorizing issuer...");
            await retry(
              async () => {
                const tx = await contract.authorizeIssuer(wallet.address, {
                  gasLimit: 100000,
                });
                return tx.wait();
              },
              3,
              2000
            );
            console.log("Issuer authorized");
          }

          // Issue on-chain (with retries). Retry wraps tx send + wait so transient RPC failures are retried.
          console.log("Issuing certificate on blockchain...");
          await retry(
            async () => {
              const tx = await contract.issueCertificate(
                certificateId,
                ipfsHash,
                { gasLimit: 300000 }
              );
              return tx.wait();
            },
            3,
            2000
          );
          console.log("Certificate issued on blockchain, tx confirmed");

          // Verify on-chain (to get the exact issueDate)
          const [contractIpfsHash, , isValid, issueDate] = await retry(
            () => contract.verifyCertificate(certificateId),
            3,
            2000
          );
          if (!isValid || contractIpfsHash !== ipfsHash) {
            throw new Error("Contract verification failed after issuance");
          }

          // ---------- 6. Persist locally ----------
          const filePath = path.join("uploads", `${ipfsHash}.pdf`);
          console.log("Renaming file to:", filePath);
          fs.renameSync(file.path, filePath);
          if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
            throw new Error("Failed to save file locally or file is empty");
          }
          console.log("File saved, size:", fs.statSync(filePath).size, "bytes");

          // ---------- 6. Save to DB ----------
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

          // ---------- 7. Response ----------
          res.json({
            success: true,
            certificateId,
            ipfsHash,
            message: "Certificate issued successfully",
          });
        } catch (error) {
          // Better error messaging for RPC/provider timeouts (522) vs other errors
          const isRpcTimeout = (err) => {
            if (!err) return false;
            const m = (err.message || err.toString() || "").toLowerCase();
            if (
              m.includes("522") ||
              m.includes("gateway timeout") ||
              m.includes("timed out")
            )
              return true;
            if (
              err.info &&
              err.info.responseStatus &&
              String(err.info.responseStatus).includes("522")
            )
              return true;
            return false;
          };

          console.error(
            "Upload error:",
            error && error.message ? error.message : error
          );
          if (file) fs.unlinkSync(file.path);
          if (isRpcTimeout(error)) {
            return res.status(502).json({
              error:
                "Blockchain RPC provider timeout (522). Try again or configure a different RPC endpoint.",
            });
          }
          res.status(500).json({ error: error.message || String(error) });
        }
      }
    );

    // ==============================================
    // REST OF YOUR ENDPOINTS (UNTOUCHED)
    // ==============================================

    app.post("/api/verify-certificate", async (req, res) => {
      try {
        const { certificateId } = req.body;
        if (!certificateId) {
          return res.status(400).json({ error: "Certificate ID required" });
        }

        console.log("Verification request for:", certificateId);
        const [ipfsHash, issuer, isValid, issueDate] =
          await contract.verifyCertificate(certificateId);

        if (!isValid) {
          console.log("Certificate not found:", certificateId);
          return res.json({
            valid: false,
            certificateId,
            error: "Certificate not found",
          });
        }

        console.log("Certificate found:", ipfsHash);
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
          "Download request for:",
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

        console.log("Serving file from:", filePath);

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
        console.error("Download error:", error.message);
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

        console.log("View request for:", certificateId);

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

        console.log("Viewing file from:", filePath);

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="certificate_${certificateId}.pdf"`
        );
        res.sendFile(path.resolve(filePath));
      } catch (error) {
        console.error("View error:", error.message);
        res.status(500).json({
          error: "Failed to view certificate",
          details: error.message,
        });
      }
    });

    // -----------------------------------------------------------------
    // Register institution mapping to a wallet address (signed by owner)
    // Client must provide: { institution, address, signature, pin (optional) }
    // The server verifies the signature and stores the mapping in db.json.
    // If pin=true the institution JSON is pinned to Pinata and ipfsHash is stored.
    // -----------------------------------------------------------------
    app.post("/api/register-institution", async (req, res) => {
      try {
        const { institution, address, signature, pin } = req.body;
        if (!institution || !address || !signature) {
          return res
            .status(400)
            .json({ error: "institution, address and signature are required" });
        }

        // Verify signature: the user should sign the institution JSON string
        const message =
          typeof institution === "string"
            ? institution
            : JSON.stringify(institution);
        let recovered;
        try {
          recovered = ethers.verifyMessage(message, signature);
        } catch (error) {
          console.warn(
            "Invalid signature format:",
            error && error.message ? error.message : error
          );
          return res.status(400).json({ error: "Invalid signature format" });
        }
        if (recovered.toLowerCase() !== address.toLowerCase()) {
          return res
            .status(401)
            .json({ error: "Signature does not match address" });
        }

        const db = loadDB();
        db.institutions = db.institutions || {};

        let ipfsHash = null;
        if (pin) {
          try {
            const pinResult = await pinata.pinJSONToIPFS(institution);
            ipfsHash = pinResult.IpfsHash;
          } catch (error) {
            console.warn(
              "Pinning institution to IPFS failed:",
              error && error.message ? error.message : error
            );
          }
        }

        db.institutions[address.toLowerCase()] = {
          institution,
          ipfsHash,
          registeredAt: new Date().toISOString(),
        };
        saveDB(db);

        return res.json({ success: true, ipfsHash });
      } catch (error) {
        console.error(
          "Register institution error:",
          error && error.message ? error.message : error
        );
        return res.status(500).json({ error: error.message || String(error) });
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
        console.error(
          "Get institution error:",
          error && error.message ? error.message : error
        );
        return res.status(500).json({ error: error.message || String(error) });
      }
    });

    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Uploads directory: ${path.join(__dirname, "uploads")}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error("Server failed to start:", error.message);
    process.exit(1);
  }
})();
