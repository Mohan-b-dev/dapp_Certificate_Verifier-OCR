const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PinataSDK = require('@pinata/sdk');
const { ethers } = require('ethers');
require('dotenv').config();

console.log('Starting server...');

try {
  const app = express();
  const upload = multer({ dest: 'uploads/' });
  app.use(cors());
  app.use(express.json());

  const pinata = new PinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_SECRET_API_KEY);
  const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const contractABI = [
    {
      "inputs": [],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "string", "name": "id", "type": "string" },
        { "indexed": false, "internalType": "string", "name": "ipfsHash", "type": "string" },
        { "indexed": true, "internalType": "address", "name": "issuer", "type": "address" }
      ],
      "name": "CertificateIssued",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "string", "name": "id", "type": "string" },
        { "indexed": true, "internalType": "address", "name": "issuer", "type": "address" },
        { "indexed": false, "internalType": "bool", "name": "isValid", "type": "bool" }
      ],
      "name": "CertificateVerified",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "address", "name": "issuer", "type": "address" }
      ],
      "name": "IssuerAuthorized",
      "type": "event"
    },
    {
      "inputs": [],
      "name": "admin",
      "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "address", "name": "_issuer", "type": "address" }],
      "name": "authorizeIssuer",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
      "name": "authorizedIssuers",
      "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "string", "name": "", "type": "string" }],
      "name": "certificates",
      "outputs": [
        { "internalType": "string", "name": "ipfsHash", "type": "string" },
        { "internalType": "address", "name": "issuer", "type": "address" },
        { "internalType": "uint256", "name": "issueDate", "type": "uint256" },
        { "internalType": "bool", "name": "exists", "type": "bool" }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "string", "name": "_id", "type": "string" },
        { "internalType": "string", "name": "_ipfsHash", "type": "string" }
      ],
      "name": "issueCertificate",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "string", "name": "_id", "type": "string" }],
      "name": "revokeCertificate",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "string", "name": "_id", "type": "string" }],
      "name": "verifyCertificate",
      "outputs": [
        { "internalType": "string", "name": "ipfsHash", "type": "string" },
        { "internalType": "address", "name": "issuer", "type": "address" },
        { "internalType": "bool", "name": "isValid", "type": "bool" },
        { "internalType": "uint256", "name": "issueDate", "type": "uint256" }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ];
  const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, contractABI, wallet);

  const DB_PATH = path.join(__dirname, 'db.json');

  function loadDB() {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
    return {};
  }

  function saveDB(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  }

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'OK',
      message: 'Backend running normally',
      timestamp: new Date().toISOString()
    });
  });

  app.post('/api/upload-certificate', upload.single('file'), async (req, res) => {
    console.log('=== UPLOAD STARTED ===');
    const { certificateId } = req.body;
    const file = req.file;

    if (!file || !certificateId) {
      if (file) fs.unlinkSync(file.path);
      return res.status(400).json({ error: 'File and Certificate ID required' });
    }

    // Enforce PDF only
    if (file.mimetype !== 'application/pdf') {
      fs.unlinkSync(file.path);
      return res.status(400).json({ error: 'Only PDF files are supported' });
    }

    const normalizedId = certificateId.replace(/[^a-zA-Z0-9]/g, '_');
    const db = loadDB();

    // Check duplicate ID
    if (db[normalizedId]) {
      fs.unlinkSync(file.path);
      return res.status(400).json({ error: 'Certificate ID already exists' });
    }

    // Compute file hash to prevent duplicate content
    const fileBuffer = fs.readFileSync(file.path);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    for (const [existingId, entry] of Object.entries(db)) {
      if (entry.fileHash === fileHash && existingId !== normalizedId) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ error: 'This certificate content is already registered under another ID' });
      }
    }

    try {
      // Upload to Pinata IPFS
      console.log('Uploading to Pinata...');
      const ipfsResult = await pinata.pinFileToIPFS(fs.createReadStream(file.path), {
        pinataMetadata: { name: `${normalizedId}.pdf` },
      });
      const ipfsHash = ipfsResult.IpfsHash;
      console.log('IPFS Upload successful, hash:', ipfsHash);

      // Ensure wallet is authorized
      const isAuthorized = await contract.authorizedIssuers(wallet.address);
      if (!isAuthorized) {
        console.log('Authorizing issuer...');
        const tx = await contract.authorizeIssuer(wallet.address, { gasLimit: 100000 });
        await tx.wait();
        console.log('Issuer authorized');
      }

      // Interact with contract
      console.log('Issuing certificate on blockchain...');
      const tx = await contract.issueCertificate(certificateId, ipfsHash, { gasLimit: 300000 });
      await tx.wait();
      console.log('Certificate issued on blockchain, tx confirmed');

      // Fetch issueDate from contract to ensure consistency
      const [contractIpfsHash, issuer, isValid, issueDate] = await contract.verifyCertificate(certificateId);
      if (!isValid || contractIpfsHash !== ipfsHash) {
        throw new Error('Contract verification failed after issuance');
      }

      // Save to local DB with contract's issueDate
      const filePath = path.join('uploads', `${ipfsHash}.pdf`);
      console.log('Renaming file to:', filePath);
      fs.renameSync(file.path, filePath);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
        throw new Error('Failed to save file locally or file is empty');
      }
      console.log('File saved successfully, size:', fs.statSync(filePath).size, 'bytes');

      db[normalizedId] = {
        fileHash,
        ipfsHash,
        issuer: wallet.address,
        issueDate: issueDate.toString(), // Use contract's issueDate
        filePath,
      };
      saveDB(db);
      console.log('Database updated');

      console.log('=== UPLOAD COMPLETED ===');
      res.json({ success: true, certificateId, ipfsHash, message: 'Certificate issued successfully' });
    } catch (error) {
      console.error('Upload error:', error.message);
      if (file) fs.unlinkSync(file.path);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/verify-certificate', async (req, res) => {
    try {
      const { certificateId } = req.body;
      if (!certificateId) {
        return res.status(400).json({ error: 'Certificate ID required' });
      }

      console.log('🔍 Verification request for:', certificateId);
      const [ipfsHash, issuer, isValid, issueDate] = await contract.verifyCertificate(certificateId);

      if (!isValid) {
        console.log('❌ Certificate not found:', certificateId);
        return res.json({ valid: false, certificateId, error: 'Certificate not found' });
      }

      console.log('✅ Certificate found:', ipfsHash);
      const issueDateNum = Number(issueDate);
      const issueDateReadable = new Date(issueDateNum * 1000).toLocaleString(); 
      res.json({
        valid: true,
        certificateId,
        issuer,
        issueDate: issueDateReadable,
        ipfsHash,
        message: 'Certificate verified successfully'
      });
    } catch (error) {
      console.error('Verification error:', error);
      res.status(500).json({ error: 'Verification failed', details: error.message });
    }
  });

  app.get('/api/download-certificate', async (req, res) => {
    try {
      const { certificateId, download } = req.query;
      
      if (!certificateId) {
        return res.status(400).json({ error: 'Certificate ID required' });
      }

      console.log('📥 Download request for:', certificateId, 'download flag:', download);
      
      // Check local DB for file path
      const db = loadDB();
      const normalizedId = certificateId.replace(/[^a-zA-Z0-9]/g, '_');
      const entry = db[normalizedId];

      if (!entry || !entry.filePath) {
        return res.status(404).json({ error: 'Certificate file not found in local database' });
      }

      const filePath = entry.filePath;
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ 
          error: 'Certificate file not available on server. The file may have been moved or deleted.' 
        });
      }

      console.log('✅ Serving file from:', filePath);
      
      // Set appropriate headers based on whether it's for viewing or downloading
      if (download === 'true') {
        // Force download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="certificate_${certificateId}.pdf"`);
      } else {
        // For viewing in browser
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="certificate_${certificateId}.pdf"`);
      }
      
      res.sendFile(path.resolve(filePath));
      
    } catch (error) {
      console.error('❌ Download error:', error.message);
      res.status(500).json({ 
        error: 'Failed to download certificate', 
        details: error.message 
      });
    }
  });

  app.get('/api/view-certificate', async (req, res) => {
    try {
      const { certificateId } = req.query;
      
      if (!certificateId) {
        return res.status(400).json({ error: 'Certificate ID required' });
      }

      console.log('👀 View request for:', certificateId);
      
      // Check local DB for file path
      const db = loadDB();
      const normalizedId = certificateId.replace(/[^a-zA-Z0-9]/g, '_');
      const entry = db[normalizedId];

      if (!entry || !entry.filePath) {
        return res.status(404).json({ error: 'Certificate file not found in local database' });
      }

      const filePath = entry.filePath;
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ 
          error: 'Certificate file not available on server. The file may have been moved or deleted.' 
        });
      }

      console.log('✅ Viewing file from:', filePath);
      
      // Always set to inline for viewing
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="certificate_${certificateId}.pdf"`);
      res.sendFile(path.resolve(filePath));
      
    } catch (error) {
      console.error('❌ View error:', error.message);
      res.status(500).json({ 
        error: 'Failed to view certificate', 
        details: error.message 
      });
    }
  });

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📁 Uploads directory: ${path.join(__dirname, 'uploads')}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
  });
} catch (error) {
  console.error('Server failed to start:', error.message);
  process.exit(1); // Exit with error code
}






/*const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PinataSDK = require('@pinata/sdk');
const { ethers } = require('ethers');
require('dotenv').config();

console.log('Starting server...');

try {
  const app = express();
  const upload = multer({ dest: 'uploads/' });
  app.use(cors());
  app.use(express.json());

  const pinata = new PinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_SECRET_API_KEY);
  const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const contractABI = [
    {
      "inputs": [],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "string", "name": "id", "type": "string" },
        { "indexed": false, "internalType": "string", "name": "ipfsHash", "type": "string" },
        { "indexed": true, "internalType": "address", "name": "issuer", "type": "address" }
      ],
      "name": "CertificateIssued",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "string", "name": "id", "type": "string" },
        { "indexed": true, "internalType": "address", "name": "issuer", "type": "address" },
        { "indexed": false, "internalType": "bool", "name": "isValid", "type": "bool" }
      ],
      "name": "CertificateVerified",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "address", "name": "issuer", "type": "address" }
      ],
      "name": "IssuerAuthorized",
      "type": "event"
    },
    {
      "inputs": [],
      "name": "admin",
      "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "address", "name": "_issuer", "type": "address" }],
      "name": "authorizeIssuer",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
      "name": "authorizedIssuers",
      "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "string", "name": "", "type": "string" }],
      "name": "certificates",
      "outputs": [
        { "internalType": "string", "name": "ipfsHash", "type": "string" },
        { "internalType": "address", "name": "issuer", "type": "address" },
        { "internalType": "uint256", "name": "issueDate", "type": "uint256" },
        { "internalType": "bool", "name": "exists", "type": "bool" }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "string", "name": "_id", "type": "string" },
        { "internalType": "string", "name": "_ipfsHash", "type": "string" }
      ],
      "name": "issueCertificate",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "string", "name": "_id", "type": "string" }],
      "name": "revokeCertificate",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "string", "name": "_id", "type": "string" }],
      "name": "verifyCertificate",
      "outputs": [
        { "internalType": "string", "name": "ipfsHash", "type": "string" },
        { "internalType": "address", "name": "issuer", "type": "address" },
        { "internalType": "bool", "name": "isValid", "type": "bool" },
        { "internalType": "uint256", "name": "issueDate", "type": "uint256" }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ];
  const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, contractABI, wallet);

  const DB_PATH = path.join(__dirname, 'db.json');

  function loadDB() {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
    return {};
  }

  function saveDB(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  }

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'OK',
      message: 'Backend running normally',
      timestamp: new Date().toISOString()
    });
  });

  app.post('/api/upload-certificate', upload.single('file'), async (req, res) => {
    console.log('=== UPLOAD STARTED ===');
    const { certificateId } = req.body;
    const file = req.file;

    if (!file || !certificateId) {
      if (file) fs.unlinkSync(file.path);
      return res.status(400).json({ error: 'File and Certificate ID required' });
    }

    // Enforce PDF only
    if (file.mimetype !== 'application/pdf') {
      fs.unlinkSync(file.path);
      return res.status(400).json({ error: 'Only PDF files are supported' });
    }

    const normalizedId = certificateId.replace(/[^a-zA-Z0-9]/g, '_');
    const db = loadDB();

    // Check duplicate ID
    if (db[normalizedId]) {
      fs.unlinkSync(file.path);
      return res.status(400).json({ error: 'Certificate ID already exists' });
    }

    // Compute file hash to prevent duplicate content
    const fileBuffer = fs.readFileSync(file.path);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    for (const [existingId, entry] of Object.entries(db)) {
      if (entry.fileHash === fileHash && existingId !== normalizedId) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ error: 'This certificate content is already registered under another ID' });
      }
    }

    try {
      // Upload to Pinata IPFS
      console.log('Uploading to Pinata...');
      const ipfsResult = await pinata.pinFileToIPFS(fs.createReadStream(file.path), {
        pinataMetadata: { name: `${normalizedId}.pdf` },
      });
      const ipfsHash = ipfsResult.IpfsHash;
      console.log('IPFS Upload successful, hash:', ipfsHash);

      // Ensure wallet is authorized
      const isAuthorized = await contract.authorizedIssuers(wallet.address);
      if (!isAuthorized) {
        console.log('Authorizing issuer...');
        const tx = await contract.authorizeIssuer(wallet.address, { gasLimit: 100000 });
        await tx.wait();
        console.log('Issuer authorized');
      }

      // Interact with contract
      console.log('Issuing certificate on blockchain...');
      const tx = await contract.issueCertificate(certificateId, ipfsHash, { gasLimit: 300000 });
      await tx.wait();
      console.log('Certificate issued on blockchain, tx confirmed');

      // Save to local DB
      const filePath = path.join('uploads', `${ipfsHash}.pdf`);
      console.log('Renaming file to:', filePath);
      fs.renameSync(file.path, filePath);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
        throw new Error('Failed to save file locally or file is empty');
      }
      console.log('File saved successfully, size:', fs.statSync(filePath).size, 'bytes');

      db[normalizedId] = {
        fileHash,
        ipfsHash,
        issuer: wallet.address,
        issueDate: Math.floor(Date.now() / 1000),
        filePath,
      };
      saveDB(db);
      console.log('Database updated');

      console.log('=== UPLOAD COMPLETED ===');
      res.json({ success: true, certificateId, ipfsHash, message: 'Certificate issued successfully' });
    } catch (error) {
      console.error('Upload error:', error.message);
      if (file) fs.unlinkSync(file.path);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/verify-certificate', async (req, res) => {
    try {
      const { certificateId } = req.body;
      if (!certificateId) {
        return res.status(400).json({ error: 'Certificate ID required' });
      }

      console.log('🔍 Verification request for:', certificateId);
      const [ipfsHash, issuer, isValid, issueDate] = await contract.verifyCertificate(certificateId);

      if (!isValid) {
        console.log('❌ Certificate not found:', certificateId);
        return res.json({ valid: false, certificateId, error: 'Certificate not found' });
      }

      console.log('✅ Certificate found:', ipfsHash);
      const issueDateStr = issueDate.toString();
      res.json({
        valid: true,
        certificateId,
        issuer,
        issueDate: issueDateStr,
        ipfsHash,
        message: 'Certificate verified successfully'
      });
    } catch (error) {
      console.error('Verification error:', error);
      res.status(500).json({ error: 'Verification failed', details: error.message });
    }
  });

  app.get('/api/download-certificate', async (req, res) => {
    try {
      const { certificateId } = req.query;
      if (!certificateId) {
        return res.status(400).json({ error: 'Certificate ID required' });
      }

      const db = loadDB();
      const normalizedId = certificateId.replace(/[^a-zA-Z0-9]/g, '_');
      const entry = db[normalizedId];

      if (!entry || !entry.filePath) {
        return res.status(404).json({ error: 'Certificate not found' });
      }

      const filePath = entry.filePath;
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Certificate file not available on server. Please contact the issuer.' });
      }

      console.log('Serving file from:', filePath);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${normalizedId}.pdf"`);
      res.sendFile(path.resolve(filePath));
    } catch (error) {
      console.error('Download error:', error.message);
      res.status(500).json({ error: 'Failed to download certificate', details: error.message });
    }
  });

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📁 Uploads directory: ${path.join(__dirname, 'uploads')}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
  });
} catch (error) {
  console.error('Server failed to start:', error.message);
  process.exit(1); // Exit with error code
}*/