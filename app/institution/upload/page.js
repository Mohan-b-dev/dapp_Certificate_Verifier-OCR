'use client';
import { useState } from 'react';

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [certificateId, setCertificateId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [message, setMessage] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [extractedOptions, setExtractedOptions] = useState([]);

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    
    if (!selectedFile) return;

    if (selectedFile.type !== 'application/pdf') {
      setMessage('Please upload a PDF file only.');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setMessage('File size too large. Please upload a file smaller than 10MB.');
      return;
    }

    setFile(selectedFile);
    setCertificateId('');
    setExtractedOptions([]);
    setConfidence(0);
    setMessage('🤖 AI is analyzing your certificate...');

    await extractCertificateIdWithAI(selectedFile);
  };

  const extractCertificateIdWithAI = async (pdfFile) => {
    setIsExtracting(true);
    
    try {
      // Convert PDF to images (first 2 pages for better detection)
      const images = await convertPDFToImages(pdfFile);
      
      if (!images || images.length === 0) {
        throw new Error('Could not process PDF');
      }

      // Use Tesseract.js for OCR with optimized settings
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            setMessage(`🔍 AI analyzing: ${Math.round(m.progress * 100)}%`);
          }
        }
      });

      // Configure Tesseract for better accuracy
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-:. ',
        tessedit_pageseg_mode: '1', // Automatic page segmentation
      });

      let allText = '';
      
      // Process multiple pages for better detection
      for (let i = 0; i < Math.min(images.length, 2); i++) {
        const { data: { text } } = await worker.recognize(images[i]);
        allText += '\n' + text;
      }
      
      await worker.terminate();

      console.log('AI Extracted Text:', allText);

      // Advanced AI pattern matching with multiple candidates
      const detectionResults = advancedCertificateIdDetection(allText);
      
      if (detectionResults.length > 0) {
        const topResult = detectionResults[0];
        setCertificateId(topResult.id);
        setConfidence(topResult.confidence);
        setExtractedOptions(detectionResults);
        setMessage(`✅ AI detected Certificate ID: ${topResult.id} (${topResult.confidence}% confidence)`);
      } else {
        setMessage('⚠️ AI could not detect Certificate ID with high confidence. Please enter it manually.');
      }

    } catch (error) {
      console.error('AI Processing Error:', error);
      setMessage('❌ AI processing failed. Please enter Certificate ID manually.');
    } finally {
      setIsExtracting(false);
    }
  };

  const convertPDFToImages = async (pdfFile) => {
    try {
      const pdfjsLib = await import('pdfjs-dist/webpack');
      
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      const images = [];
      const numPages = Math.min(pdf.numPages, 2); // Process first 2 pages
      
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;
        
        images.push(canvas.toDataURL('image/png'));
      }
      
      return images;
    } catch (error) {
      console.error('PDF conversion error:', error);
      // Fallback: return the PDF blob URL
      return [URL.createObjectURL(pdfFile)];
    }
  };

  const advancedCertificateIdDetection = (text) => {
    if (!text) return [];

    const cleanText = text.replace(/\s+/g, ' ').trim();
    const lines = cleanText.split('\n');
    
    const candidates = [];

    // Enhanced pattern definitions with confidence scores
    const patterns = [
      { regex: /(?:certificate\s*(?:id|no|number|#)[:\s]*)([\w\/-]{4,20})/gi, confidence: 95, name: 'Certificate ID Label' },
      { regex: /(?:cert\s*(?:id|no|number|#)[:\s]*)([\w\/-]{4,20})/gi, confidence: 90, name: 'Cert ID Label' },
      { regex: /(?:id\s*(?:number|no|#)?[:\s]*)([\w\/-]{4,20})/gi, confidence: 85, name: 'ID Label' },
      { regex: /(?:registration\s*(?:no|number|#)[:\s]*)([\w\/-]{4,20})/gi, confidence: 90, name: 'Registration Number' },
      { regex: /(?:credential\s*(?:id|no|number)[:\s]*)([\w\/-]{4,20})/gi, confidence: 90, name: 'Credential ID' },
      { regex: /(?:serial\s*(?:no|number|#)?[:\s]*)([\w\/-]{4,20})/gi, confidence: 85, name: 'Serial Number' },
      { regex: /(?:reference\s*(?:no|number|#)?[:\s]*)([\w\/-]{4,20})/gi, confidence: 80, name: 'Reference Number' },
      { regex: /\b([A-Z]{2,6}[\/\-][A-Z0-9]{3,10})\b/g, confidence: 85, name: 'Format: ABC/123' },
      { regex: /\b([A-Z]{3,}[0-9]{3,})\b/g, confidence: 75, name: 'Format: ABC123' },
      { regex: /\b([0-9]{4,}[A-Z]{2,})\b/g, confidence: 70, name: 'Format: 1234AB' },
      { regex: /\b([A-Z0-9]{8,15})\b/g, confidence: 65, name: 'Alphanumeric 8-15 chars' },
      { regex: /\b(?:Certificate\s*(?:No\.?|Number|ID)[:\-]?\s*([A-Z0-9\-\/]+)|Cert\s*No\.?[:\-]?\s*([A-Z0-9\-\/]+)|Ref\s*No\.?[:\-]?\s*([A-Z0-9\-\/]+)|(?:ID|No\.?)[:\-]?\s*([A-Z0-9\-\/]+)|\b([A-Z]{2,5}\d{3,})\b|\b\d{5,}\b)\b/gi, confidence: 95, name: 'Generic Certificate Number'},

    ];

    // Process each pattern
    patterns.forEach(pattern => {
      let match;
      const regex = new RegExp(pattern.regex);
      
      while ((match = regex.exec(cleanText)) !== null) {
        const potentialId = (match[1] || match[0]).trim();
        
        // Validation checks
        if (potentialId.length >= 4 && potentialId.length <= 20) {
          // Check if it has both letters and numbers (typical for cert IDs)
          const hasLetters = /[A-Za-z]/.test(potentialId);
          const hasNumbers = /[0-9]/.test(potentialId);
          
          let adjustedConfidence = pattern.confidence;
          
          // Boost confidence if it has both letters and numbers
          if (hasLetters && hasNumbers) {
            adjustedConfidence += 10;
          }
          
          // Reduce confidence for all-numeric IDs (less common)
          if (!hasLetters && hasNumbers) {
            adjustedConfidence -= 15;
          }
          
          // Check for common false positives
          const lowerPotentialId = potentialId.toLowerCase();
          const falsePositives = ['certificate', 'issued', 'date', 'name', 'course', 'university', 'college'];
          if (falsePositives.some(fp => lowerPotentialId.includes(fp))) {
            continue;
          }
          
          candidates.push({
            id: potentialId,
            confidence: Math.min(adjustedConfidence, 100),
            pattern: pattern.name,
            context: match.input.substring(Math.max(0, match.index - 30), Math.min(match.input.length, match.index + 50))
          });
        }
      }
    });

    // Deduplicate and sort by confidence
    const uniqueCandidates = [];
    const seenIds = new Set();
    
    candidates
      .sort((a, b) => b.confidence - a.confidence)
      .forEach(candidate => {
        const normalizedId = candidate.id.toUpperCase();
        if (!seenIds.has(normalizedId)) {
          seenIds.add(normalizedId);
          uniqueCandidates.push(candidate);
        }
      });

    return uniqueCandidates.slice(0, 5); // Return top 5 candidates
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage('Please select a PDF file first.');
      return;
    }

    if (!certificateId.trim()) {
      setMessage('Please enter a Certificate ID.');
      return;
    }

    setIsLoading(true);
    setMessage('📤 Uploading to blockchain...');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('certificateId', certificateId.trim());

    try {
      const response = await fetch('/api/upload-certificate', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      
      if (result.success) {
        setMessage(`🎉 Success! Certificate issued on blockchain!
        
Certificate ID: ${result.certificateId}
IPFS Hash: ${result.ipfsHash}
Blockchain: Transaction confirmed`);

        setFile(null);
        setCertificateId('');
        setExtractedOptions([]);
        setConfidence(0);
        document.getElementById('file-upload').value = '';
      } else {
        setMessage(`❌ Upload failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      setMessage('❌ Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🤖</div>
          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            AI Certificate Verification
          </h1>
          <p className="text-gray-600 text-lg">
            Advanced OCR automatically detects certificate IDs with high accuracy
          </p>
        </div>

        {/* Upload Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          
          {/* File Upload */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-800 mb-3">
              📄 Upload Certificate PDF
            </label>
            <div 
              className="border-3 border-dashed border-indigo-300 rounded-2xl p-8 text-center bg-gradient-to-br from-indigo-50 to-purple-50 transition-all hover:border-indigo-500 hover:shadow-lg cursor-pointer group"
              onClick={() => document.getElementById('file-upload').click()}
            >
              <input 
                type="file" 
                id="file-upload" 
                accept=".pdf" 
                onChange={handleFileChange} 
                className="hidden" 
              />
              
              {file ? (
                <div className="text-green-600">
                  <div className="text-6xl mb-3">✅</div>
                  <p className="font-bold text-lg">{file.name}</p>
                  <p className="text-sm text-green-600 mt-2">AI analysis {isExtracting ? 'in progress...' : 'complete'}</p>
                </div>
              ) : (
                <div className="text-indigo-600 group-hover:text-indigo-700 transition-colors">
                  <div className="text-6xl mb-3">📎</div>
                  <p className="font-bold text-lg">Click to upload PDF</p>
                  <p className="text-sm text-indigo-500 mt-2">AI will automatically extract the certificate ID</p>
                </div>
              )}
            </div>
          </div>

          {/* Certificate ID */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-800 mb-3">
              🔑 Certificate ID
              {confidence > 0 && (
                <span className={`ml-3 text-xs px-3 py-1 rounded-full ${
                  confidence >= 85 ? 'bg-green-100 text-green-700' :
                  confidence >= 70 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-orange-100 text-orange-700'
                }`}>
                  {confidence}% confidence
                </span>
              )}
            </label>
            <input
              type="text"
              value={certificateId}
              onChange={(e) => setCertificateId(e.target.value)}
              placeholder={isExtracting ? "AI is analyzing..." : "AI will detect this automatically..."}
              className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all text-lg font-mono"
              disabled={isExtracting}
            />
            {isExtracting && (
              <p className="text-sm text-indigo-600 mt-3 flex items-center">
                <span className="animate-spin mr-2 text-xl">⟳</span>
                AI is processing your certificate with advanced OCR...
              </p>
            )}
          </div>

          {/* Alternative Options */}
          {extractedOptions.length > 1 && (
            <div className="mb-6 p-4 bg-blue-50 rounded-xl border-2 border-blue-200">
              <p className="text-sm font-bold text-blue-900 mb-3">🎯 Other detected options:</p>
              <div className="space-y-2">
                {extractedOptions.slice(1).map((option, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setCertificateId(option.id);
                      setConfidence(option.confidence);
                    }}
                    className="w-full text-left px-4 py-2 bg-white rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
                  >
                    <span className="font-mono font-bold">{option.id}</span>
                    <span className="text-xs text-blue-600 ml-3">
                      ({option.confidence}% - {option.pattern})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={isLoading || isExtracting || !file || !certificateId}
            className="w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white py-5 rounded-xl font-bold text-lg shadow-xl hover:shadow-2xl transform hover:-translate-y-1 transition-all disabled:opacity-50 disabled:transform-none disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <span className="animate-spin mr-3 text-2xl">⟳</span>
                Uploading to Blockchain...
              </span>
            ) : (
              '🚀 Issue Certificate on Blockchain'
            )}
          </button>

          {/* Status Message */}
          {message && (
            <div className={`mt-6 p-5 rounded-xl border-2 ${
              message.includes('✅') || message.includes('Success') 
                ? 'bg-green-50 border-green-300 text-green-900'
                : message.includes('❌') || message.includes('failed')
                ? 'bg-red-50 border-red-300 text-red-900'
                : 'bg-blue-50 border-blue-300 text-blue-900'
            }`}>
              <pre className="whitespace-pre-wrap text-sm font-medium">{message}</pre>
            </div>
          )}

        </div>

        {/* AI Features Info */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl shadow-md text-center">
            <div className="text-3xl mb-2">🔍</div>
            <p className="text-sm font-bold text-gray-800">OCR Technology</p>
            <p className="text-xs text-gray-600">Tesseract.js</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-md text-center">
            <div className="text-3xl mb-2">🎯</div>
            <p className="text-sm font-bold text-gray-800">Pattern Matching</p>
            <p className="text-xs text-gray-600">11+ patterns</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-md text-center">
            <div className="text-3xl mb-2">⚡</div>
            <p className="text-sm font-bold text-gray-800">Confidence Score</p>
            <p className="text-xs text-gray-600">AI-powered</p>
          </div>
        </div>

        {/* Technical Details */}
        <div className="mt-6 text-center">
          <details className="text-sm text-gray-600">
            <summary className="cursor-pointer font-semibold hover:text-indigo-600">🔧 Technical Details</summary>
            <div className="mt-4 p-4 bg-white rounded-xl shadow text-left">
              <p className="mb-2"><strong>OCR Engine:</strong> Tesseract.js with optimized parameters</p>
              <p className="mb-2"><strong>PDF Processing:</strong> Multi-page analysis (up to 2 pages)</p>
              <p className="mb-2"><strong>Pattern Recognition:</strong> 11 intelligent patterns with context analysis</p>
              <p className="mb-2"><strong>Confidence Scoring:</strong> Dynamic scoring based on pattern type and validation</p>
              <p><strong>False Positive Filtering:</strong> Automatic removal of common certificate text</p>
            </div>
          </details>
        </div>

      </div>
    </div>
  );
}

