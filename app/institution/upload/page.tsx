"use client";
import { useState, useEffect, type ChangeEvent } from "react";
import InstitutionForm from "../components/InstitutionForm";

type DetectedOption = {
  id: string;
  confidence: number;
  pattern?: string;
  context?: string;
};

type Institution = {
  companyId: string;
  companyName: string;
  location: string;
  email?: string;
  phone?: string;
};

// SVG Spinner Component
const Spinner = () => (
  <svg
    className="animate-spin h-6 w-6 text-current"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [certificateId, setCertificateId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [message, setMessage] = useState("");
  const [confidence, setConfidence] = useState(0);
  const [extractedOptions, setExtractedOptions] = useState<DetectedOption[]>(
    []
  );
  const [institution, setInstitution] = useState<Institution | null>(null);

  // -----------------------------------------------------------------
  // 1. Institution form callback
  // -----------------------------------------------------------------
  const handleInstitutionSubmit = (data: Institution) => {
    setInstitution(data);
    setMessage("Institution details saved – now upload the certificate PDF");

    // Try to auto-register the institution to the connected wallet (best-effort)
    (async () => {
      try {
        if (typeof window !== "undefined" && (window as any).ethereum) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const eth = (window as any).ethereum;
          // Request accounts (will prompt if not already connected)
          const accounts = await eth.request({ method: "eth_requestAccounts" });
          const address = accounts && accounts[0];
          if (!address) return;

          const message = JSON.stringify(data);
          let signature = null;
          try {
            signature = await eth.request({
              method: "personal_sign",
              params: [message, address],
            });
          } catch (sigErr) {
            console.warn(
              "User declined signing or personal_sign failed:",
              sigErr
            );
          }

          if (signature) {
            try {
              const backendBase =
                process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
              await fetch(`${backendBase}/api/register-institution`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  institution: data,
                  address,
                  signature,
                  pin: true,
                }),
              });
              // Informational only; registration failure shouldn't block the user
              console.log("Institution registration attempted for", address);
            } catch (err) {
              console.warn("Failed to register institution with backend:", err);
            }
          }
        }
      } catch (err) {
        console.warn("Auto-register institution error:", err);
      }
    })();
  };

  // On mount: try to auto-fill from a connected wallet's registered institution
  useEffect(() => {
    (async () => {
      try {
        if (typeof window !== "undefined" && (window as any).ethereum) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const eth = (window as any).ethereum;
          let accounts = [];
          try {
            accounts = await eth.request({ method: "eth_accounts" });
          } catch {
            // ignore
          }
          if (!accounts || accounts.length === 0) return;
          const address = accounts[0];
          const backendBase =
            process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
          try {
            const resp = await fetch(
              `${backendBase}/api/institution/${address}`
            );
            if (resp.ok) {
              const json = await resp.json();
              if (json && json.institution) {
                setInstitution(json.institution);
                setMessage(
                  "Institution auto-filled from registered wallet mapping."
                );
              }
            }
          } catch (err) {
            console.warn("Failed to fetch institution mapping:", err);
          }
        }
      } catch (err) {
        console.warn("Auto-fill institution error:", err);
      }
    })();
  }, []);

  // -----------------------------------------------------------------
  // 2. File change to OCR
  // -----------------------------------------------------------------
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.type !== "application/pdf") {
      setMessage("Please upload a PDF file only.");
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setMessage(
        "File size too large. Please upload a file smaller than 10MB."
      );
      return;
    }

    setFile(selectedFile);
    setCertificateId("");
    setExtractedOptions([]);
    setConfidence(0);
    setMessage("AI is analyzing your certificate...");

    await extractCertificateIdWithAI(selectedFile);
  };

  // -----------------------------------------------------------------
  // 3. OCR + PDF to Image to Tesseract
  // -----------------------------------------------------------------
  const extractCertificateIdWithAI = async (pdfFile: File) => {
    setIsExtracting(true);
    try {
      const images = await convertPDFToImages(pdfFile);
      if (!images || images.length === 0)
        throw new Error("Could not process PDF");

      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setMessage(`AI analyzing: ${Math.round(m.progress * 100)}%`);
          }
        },
      });

      await worker.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-:. ",
        tessedit_pageseg_mode: "1",
      });

      let allText = "";
      for (let i = 0; i < Math.min(images.length, 2); i++) {
        const {
          data: { text },
        } = await worker.recognize(images[i]);
        allText += "\n" + text;
      }
      await worker.terminate();

      console.log("AI Extracted Text:", allText);

      const detectionResults = advancedCertificateIdDetection(allText);
      if (detectionResults.length > 0) {
        const topResult = detectionResults[0];
        setCertificateId(topResult.id);
        setConfidence(topResult.confidence);
        setExtractedOptions(detectionResults);
        setMessage(
          `AI detected Certificate ID: ${topResult.id} (${topResult.confidence}% confidence)`
        );
      } else {
        setMessage(
          "AI could not detect Certificate ID with high confidence. Please enter it manually."
        );
      }
    } catch (error) {
      console.error("AI Processing Error:", error);
      setMessage("AI processing failed. Please enter Certificate ID manually.");
    } finally {
      setIsExtracting(false);
    }
  };

  const convertPDFToImages = async (pdfFile: File) => {
    try {
      const pdfjsLib = await import("pdfjs-dist/webpack");
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const images = [];
      const numPages = Math.min(pdf.numPages, 2);

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport }).promise;
        images.push(canvas.toDataURL("image/png"));
      }
      return images;
    } catch (error) {
      console.error("PDF conversion error:", error);
      return [URL.createObjectURL(pdfFile)];
    }
  };

  const advancedCertificateIdDetection = (text: string) => {
    if (!text) return [] as DetectedOption[];
    const cleanText = text.replace(/\s+/g, " ").trim();
    const candidates: DetectedOption[] = [];

    const patterns = [
      {
        regex: /(?:certificate\s*(?:id|no|number|#)[:\s]*)([\w\/\-]{4,20})/gi,
        confidence: 95,
        name: "Certificate ID Label",
      },
      {
        regex: /(?:cert\s*(?:id|no|number|#)[:\s]*)([\w\/\-]{4,20})/gi,
        confidence: 90,
        name: "Cert ID Label",
      },
      {
        regex: /(?:id\s*(?:number|no|#)?[:\s]*)([\w\/\-]{4,20})/gi,
        confidence: 85,
        name: "ID Label",
      },
      {
        regex: /(?:registration\s*(?:no|number|#)[:\s]*)([\w\/\-]{4,20})/gi,
        confidence: 90,
        name: "Registration Number",
      },
      {
        regex: /(?:credential\s*(?:id|no|number)[:\s]*)([\w\/\-]{4,20})/gi,
        confidence: 90,
        name: "Credential ID",
      },
      {
        regex: /(?:serial\s*(?:no|number|#)?[:\s]*)([\w\/\-]{4,20})/gi,
        confidence: 85,
        name: "Serial Number",
      },
      {
        regex: /(?:reference\s*(?:no|number|#)?[:\s]*)([\w\/\-]{4,20})/gi,
        confidence: 80,
        name: "Reference Number",
      },
      {
        regex: /\b([A-Z]{2,6}[\/\-][A-Z0-9]{3,10})\b/g,
        confidence: 85,
        name: "Format: ABC/123",
      },
      {
        regex: /\b([A-Z]{3,}[0-9]{3,})\b/g,
        confidence: 75,
        name: "Format: ABC123",
      },
      {
        regex: /\b([0-9]{4,}[A-Z]{2,})\b/g,
        confidence: 70,
        name: "Format: 1234AB",
      },
      {
        regex: /\b([A-Z0-9]{8,15})\b/g,
        confidence: 65,
        name: "Alphanumeric 8-15 chars",
      },
    ];

    patterns.forEach((pattern) => {
      let match;
      const regex = new RegExp(pattern.regex);
      while ((match = regex.exec(cleanText)) !== null) {
        const potentialId = (match[1] || match[0]).trim();
        if (potentialId.length >= 4 && potentialId.length <= 20) {
          const hasLetters = /[A-Za-z]/.test(potentialId);
          const hasNumbers = /[0-9]/.test(potentialId);
          let adjustedConfidence = pattern.confidence;
          if (hasLetters && hasNumbers) adjustedConfidence += 10;
          if (!hasLetters && hasNumbers) adjustedConfidence -= 15;

          const lower = potentialId.toLowerCase();
          const falsePositives = [
            "certificate",
            "issued",
            "date",
            "name",
            "course",
            "university",
            "college",
          ];
          if (falsePositives.some((fp) => lower.includes(fp))) continue;

          candidates.push({
            id: potentialId,
            confidence: Math.min(adjustedConfidence, 100),
            pattern: pattern.name,
            context: match.input.substring(
              Math.max(0, match.index - 30),
              Math.min(match.input.length, match.index + 50)
            ),
          });
        }
      }
    });

    const uniqueCandidates: DetectedOption[] = [];
    const seenIds = new Set();
    candidates
      .sort((a, b) => b.confidence - a.confidence)
      .forEach((candidate) => {
        const normalizedId = candidate.id.toUpperCase();
        if (!seenIds.has(normalizedId)) {
          seenIds.add(normalizedId);
          uniqueCandidates.push(candidate);
        }
      });

    return uniqueCandidates.slice(0, 5);
  };

  // -----------------------------------------------------------------
  // 4. Upload to Blockchain
  // -----------------------------------------------------------------
  const handleUpload = async () => {
    if (!file) {
      setMessage("Please select a PDF file first.");
      return;
    }
    if (!certificateId.trim()) {
      setMessage("Please enter a Certificate ID.");
      return;
    }

    setIsLoading(true);
    setMessage("Uploading to blockchain...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("certificateId", certificateId.trim());

    try {
      const backendBase =
        process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
      const response = await fetch(`${backendBase}/api/upload-certificate`, {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (result.success) {
        setMessage(
          `Success! Certificate issued on blockchain!\n\nCertificate ID: ${result.certificateId}\nIPFS Hash: ${result.ipfsHash}\nBlockchain: Transaction confirmed`
        );

        setFile(null);
        setCertificateId("");
        setExtractedOptions([]);
        setConfidence(0);
        const inputEl = document.getElementById(
          "file-upload"
        ) as HTMLInputElement | null;
        if (inputEl) inputEl.value = "";
      } else {
        setMessage(`Upload failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      setMessage("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // -----------------------------------------------------------------
  // 5. Render UI
  // -----------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* === HEADER === */}
        <div className="text-center mb-12">
          <div className="text-7xl mb-4 text-black">Certificate</div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-black mb-3">
            AI‑Powered Certificate Issuance
          </h1>
          <p className="text-lg text-gray-700 max-w-2xl mx-auto">
            Issue tamper‑proof, blockchain‑verified certificates in seconds.
          </p>
        </div>

        {/* === INSTITUTION FORM OR UPLOAD SECTION === */}
        {!institution ? (
          <div className="bg-white rounded-3xl shadow-xl p-8 md:p-10 border border-gray-300">
            <h2 className="text-2xl md:text-3xl font-bold text-black mb-8 flex items-center">
              <span className="mr-3 text-3xl">Building</span> Institution
              Details
            </h2>
            <InstitutionForm onSubmit={handleInstitutionSubmit} />
          </div>
        ) : (
          <>
            {/* === INSTITUTION CONFIRMED BADGE === */}
            <div className="mb-8 p-6 bg-gray-100 rounded-2xl border border-gray-400 shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <p className="text-xl font-bold text-black">
                  {institution.companyName}
                  <span className="ml-3 text-sm font-mono bg-gray-300 text-black px-3 py-1 rounded-full">
                    {institution.companyId}
                  </span>
                </p>
                <p className="text-base text-gray-800 mt-1">
                  {institution.location}
                </p>
                {institution.email && (
                  <p className="text-sm text-gray-700 mt-1 flex items-center">
                    <span className="mr-1">Email</span> {institution.email}
                  </p>
                )}
                {institution.phone && (
                  <p className="text-sm text-gray-700 flex items-center">
                    <span className="mr-1">Phone</span> {institution.phone}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setInstitution(null);
                  setMessage("");
                }}
                className="text-sm font-medium text-red-600 hover:text-red-800 underline transition"
              >
                Change Institution
              </button>
            </div>

            {/* === CERTIFICATE UPLOAD CARD === */}
            <div className="bg-white rounded-3xl shadow-xl p-8 md:p-10 border border-gray-300">
              <h3 className="text-2xl font-bold text-black mb-8 flex items-center">
                <span className="mr-3 text-3xl">Document</span> Upload
                Certificate PDF
              </h3>

              {/* File Drop Zone */}
              <div
                className="relative border-4 border-dashed border-gray-400 rounded-2xl p-12 text-center bg-gray-50 transition-all hover:border-black hover:shadow-xl cursor-pointer group"
                onClick={() => document.getElementById("file-upload")?.click()}
              >
                <input
                  type="file"
                  id="file-upload"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                {file ? (
                  <div className="text-green-700">
                    <div className="text-7xl mb-4">Check</div>
                    <p className="text-xl font-bold text-black">{file.name}</p>
                    <p className="text-base text-green-700 mt-2">
                      {isExtracting
                        ? "AI is scanning..."
                        : "Ready for issuance"}
                    </p>
                  </div>
                ) : (
                  <div className="text-gray-700 group-hover:text-black transition-colors">
                    <div className="text-7xl mb-4">Paperclip</div>
                    <p className="text-xl font-bold">Drop your PDF here</p>
                    <p className="text-base text-gray-600 mt-2">
                      or click to browse — AI auto‑detects Certificate ID
                    </p>
                  </div>
                )}
              </div>

              {/* Certificate ID Input */}
              <div className="mt-10">
                <label className="block text-base font-bold text-black mb-3">
                  Certificate ID
                  {confidence > 0 && (
                    <span
                      className={`ml-3 inline-flex items-center px-4 py-1.5 rounded-full text-sm font-semibold ${
                        confidence >= 90
                          ? "bg-green-100 text-green-800"
                          : confidence >= 70
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-orange-100 text-orange-800"
                      }`}
                    >
                      {confidence}% confidence
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={certificateId}
                  onChange={(e) => setCertificateId(e.target.value)}
                  placeholder={
                    isExtracting
                      ? "AI analyzing..."
                      : "Auto‑filled or edit manually"
                  }
                  className="w-full px-6 py-4 text-lg font-mono border-2 border-gray-400 rounded-xl focus:border-black focus:ring-4 focus:ring-gray-200 transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                  disabled={isExtracting}
                />
                {isExtracting && (
                  <p className="mt-4 text-base text-gray-700 flex items-center justify-center gap-2">
                    <Spinner />
                    <span>AI is reading the certificate...</span>
                  </p>
                )}
              </div>

              {/* OCR Detected Options (dropdown) */}
              {extractedOptions.length > 0 && (
                <div className="mt-8 p-6 bg-gray-100 rounded-xl border-2 border-gray-300">
                  <p className="text-base font-bold text-black mb-4">
                    Detected IDs (choose one or edit manually):
                  </p>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <select
                      value={certificateId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCertificateId(val);
                        const sel = extractedOptions.find((o) => o.id === val);
                        if (sel) setConfidence(sel.confidence);
                      }}
                      className="w-full sm:w-1/2 px-4 py-3 rounded-lg border-2 border-gray-300 bg-white text-lg font-mono"
                    >
                      {extractedOptions.map((opt, idx) => (
                        <option key={idx} value={opt.id}>
                          {opt.id} — {opt.confidence}%
                        </option>
                      ))}
                    </select>

                    <div className="text-sm text-gray-700">
                      {certificateId ? (
                        (() => {
                          const current =
                            extractedOptions.find(
                              (o) => o.id === certificateId
                            ) || extractedOptions[0];
                          return (
                            <div>
                              <div className="font-mono font-bold">
                                {current.id}
                              </div>
                              <div className="text-xs text-gray-600">
                                {current.confidence}% — {current.pattern}
                              </div>
                              <div className="mt-2 text-xs text-gray-500">
                                Context: {current.context}
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        <div className="text-xs text-gray-500">
                          Select an AI-detected ID or type your own above.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Upload Button */}
              <button
                onClick={handleUpload}
                disabled={isLoading || isExtracting || !file || !certificateId}
                className="mt-10 w-full py-5 px-8 bg-black text-white text-xl font-bold rounded-xl shadow-xl hover:shadow-2xl transform hover:-translate-y-1 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-3"
              >
                {isLoading ? (
                  <>
                    <Spinner />
                    <span>Uploading to Blockchain...</span>
                  </>
                ) : (
                  <span>Issue Certificate on Blockchain</span>
                )}
              </button>

              {/* Status Message */}
              {message && (
                <div
                  className={`mt-8 p-6 rounded-xl border-2 font-medium text-base shadow-sm ${
                    message.includes("Success") || message.includes("issued")
                      ? "bg-green-50 border-green-300 text-green-900"
                      : message.includes("Error") || message.includes("failed")
                      ? "bg-red-50 border-red-300 text-red-900"
                      : "bg-gray-100 border-gray-400 text-black"
                  }`}
                >
                  <pre className="whitespace-pre-wrap">{message}</pre>
                </div>
              )}
            </div>

            {/* === AI FEATURES SHOWCASE === */}
            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-300 text-center">
                <div className="text-5xl mb-3 text-black">Magnifying Glass</div>
                <p className="text-lg font-bold text-black">Advanced OCR</p>
                <p className="text-sm text-gray-600">Tesseract.js Engine</p>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-300 text-center">
                <div className="text-5xl mb-3 text-black">Brain</div>
                <p className="text-lg font-bold text-black">
                  Smart Pattern Detection
                </p>
                <p className="text-sm text-gray-600">11+ ID Formats</p>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-300 text-center">
                <div className="text-5xl mb-3 text-black">Chart</div>
                <p className="text-lg font-bold text-black">
                  Confidence Scoring
                </p>
                <p className="text-sm text-gray-600">AI‑Powered Accuracy</p>
              </div>
            </div>

            {/* === TECHNICAL DETAILS === */}
            <div className="mt-10">
              <details className="bg-white rounded-2xl shadow-lg p-6 border border-gray-300">
                <summary className="text-xl font-bold text-black cursor-pointer hover:text-gray-800 flex items-center justify-between">
                  <span>Technical Details</span>
                  <span className="ml-2 text-2xl">Down Arrow</span>
                </summary>
                <div className="mt-5 text-left text-base text-gray-700 space-y-3 leading-relaxed">
                  <p>
                    <strong className="text-black">OCR Engine:</strong>{" "}
                    Tesseract.js with custom parameters
                  </p>
                  <p>
                    <strong className="text-black">PDF Processing:</strong>{" "}
                    First 2 pages at 2x resolution
                  </p>
                  <p>
                    <strong className="text-black">Pattern Matching:</strong>{" "}
                    11+ intelligent regex patterns
                  </p>
                  <p>
                    <strong className="text-black">
                      False Positive Filter:
                    </strong>{" "}
                    Removes common words
                  </p>
                  <p>
                    <strong className="text-black">Blockchain:</strong>{" "}
                    Immutable record via smart contract
                  </p>
                  <p>
                    <strong className="text-black">Storage:</strong> IPFS +
                    local backup
                  </p>
                </div>
              </details>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
