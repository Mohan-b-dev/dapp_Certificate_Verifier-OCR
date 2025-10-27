'use client';
import { useState } from 'react';

// Simple PDF Viewer Component
function PDFViewer({ pdfUrl }) {
  if (!pdfUrl) {
    return null;
  }

  return (
    <div className="w-full h-[600px] bg-gray-100 rounded-lg overflow-hidden">
      <iframe
        src={pdfUrl}
        className="w-full h-full border-0"
        title="Certificate PDF Viewer"
      />
    </div>
  );
}

export default function CertificateVerification() {
  const [certificateId, setCertificateId] = useState('');
  const [verificationResult, setVerificationResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');

  const handleVerify = async () => {
    if (!certificateId.trim()) {
      alert('Please enter a Certificate ID');
      return;
    }

    setIsLoading(true);
    setVerificationResult(null);
    setPdfUrl('');

    try {
      const response = await fetch('/api/verify-certificate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ certificateId }),
      });

      const result = await response.json();
      
      if (result.valid) {
        setVerificationResult(result);
        const viewUrl = `/api/download-certificate?certificateId=${encodeURIComponent(certificateId)}`;
        setPdfUrl(viewUrl);
        console.log('PDF URL set to:', viewUrl);
      } else {
        setVerificationResult(result);
      }
    } catch (error) {
      console.error('Verification error:', error);
      setVerificationResult({
        valid: false,
        error: 'Failed to verify certificate'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!certificateId) return;
    
    try {
      const downloadUrl = `/api/download-certificate?certificateId=${encodeURIComponent(certificateId)}&download=true`;
      
      const response = await fetch(downloadUrl);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `certificate_${certificateId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Download failed');
      }
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download certificate');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-12">
      <div className="max-w-5xl mx-auto px-4">
        
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-block mb-4">
            <div className="text-6xl mb-2">🔐</div>
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent mb-4">
            Certificate Verification
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            Verify the authenticity of certificates using blockchain technology.
            Enter a certificate ID to check its validity and view the original document.
          </p>
        </div>

        {/* Verification Input Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 mb-8 border border-gray-100 hover:shadow-3xl transition-shadow duration-300">
          <div className="flex items-center mb-6">
            <div className="bg-gradient-to-br from-blue-100 to-indigo-100 p-3 rounded-xl mr-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Verify Certificate</h2>
          </div>

          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-bold text-gray-700 mb-3">
                🔑 Certificate ID
              </label>
              <input
                type="text"
                value={certificateId}
                onChange={(e) => setCertificateId(e.target.value)}
                placeholder="Enter Certificate ID (e.g., TTDIN/1545)"
                className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all duration-200 text-lg font-mono placeholder-gray-400"
                onKeyPress={(e) => e.key === 'Enter' && handleVerify()}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleVerify}
                disabled={isLoading}
                className="w-full md:w-auto px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5 transition-all duration-200"
              >
                {isLoading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Verifying...
                  </span>
                ) : (
                  '✓ Verify Certificate'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Verification Result */}
        {verificationResult && (
          <div className={`rounded-2xl shadow-2xl p-8 mb-8 border-2 transition-all duration-500 animate-fadeIn ${
            verificationResult.valid 
              ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200' 
              : 'bg-gradient-to-br from-red-50 to-rose-50 border-red-200'
          }`}>
            <div className="flex items-center mb-6">
              <div className={`p-3 rounded-xl mr-4 ${
                verificationResult.valid 
                  ? 'bg-green-100' 
                  : 'bg-red-100'
              }`}>
                {verificationResult.valid ? (
                  <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Verification Result</h2>
            </div>
            
            {verificationResult.valid ? (
              <div className="space-y-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0 w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mr-4">
                    <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-700">Certificate is Valid</p>
                    <p className="text-green-600">This certificate is authentic and verified on the blockchain</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl p-5 border border-green-200 shadow-sm">
                    <div className="flex items-center mb-3">
                      <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span className="font-bold text-gray-700">Issuer Address</span>
                    </div>
                    <div className="font-mono text-xs bg-gray-50 p-3 rounded-lg border border-gray-200 break-all">
                      {verificationResult.issuer}
                    </div>
                  </div>

                  <div className="bg-white rounded-xl p-5 border border-green-200 shadow-sm">
                    <div className="flex items-center mb-3">
                      <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="font-bold text-gray-700">Issue Date</span>
                    </div>
                    <div className="text-lg font-semibold text-gray-800">
                      {verificationResult.issueDate}
                    </div>
                  </div>

                  <div className="md:col-span-2 bg-white rounded-xl p-5 border border-green-200 shadow-sm">
                    <div className="flex items-center mb-3">
                      <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                      </svg>
                      <span className="font-bold text-gray-700">IPFS Hash</span>
                    </div>
                    <div className="font-mono text-xs bg-gray-50 p-3 rounded-lg border border-gray-200 break-all">
                      {verificationResult.ipfsHash}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center">
                <div className="flex-shrink-0 w-12 h-12 bg-red-500 rounded-full flex items-center justify-center mr-4">
                  <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-700">Certificate Invalid</p>
                  <p className="text-red-600 mt-1">
                    {verificationResult.error || 'Certificate not found or invalid'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Original Certificate Viewer */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 border border-gray-100">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div className="flex items-center">
              <div className="bg-gradient-to-br from-purple-100 to-pink-100 p-3 rounded-xl mr-4">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Original Certificate</h2>
            </div>
            
            {pdfUrl && (
              <button
                onClick={handleDownload}
                className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl hover:from-green-700 hover:to-emerald-700 focus:outline-none focus:ring-4 focus:ring-green-300 transform hover:-translate-y-0.5 transition-all duration-200 flex items-center"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download PDF
              </button>
            )}
          </div>
          
          <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-gray-50">
            <PDFViewer pdfUrl={pdfUrl} />
          </div>
          
          {pdfUrl && verificationResult && (
            <div className="mt-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-200">
              <div className="flex items-center justify-center space-x-8 text-sm">
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Certificate ID</p>
                    <p className="font-mono font-bold text-blue-900">{certificateId}</p>
                  </div>
                </div>
                <div className="hidden md:block h-8 w-px bg-blue-300"></div>
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">IPFS Storage</p>
                    <p className="font-mono text-xs font-bold text-blue-900 truncate max-w-xs">
                      {verificationResult.ipfsHash}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!pdfUrl && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <svg className="w-24 h-24 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg font-semibold text-gray-500">No certificate loaded</p>
              <p className="text-sm text-gray-400 mt-2">Enter a certificate ID and verify to view the document</p>
            </div>
          )}
        </div>

        {/* Info Banner */}
        <div className="mt-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl shadow-xl p-6 text-white">
          <div className="flex items-start">
            <svg className="w-6 h-6 mr-3 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div>
              <h3 className="font-bold text-lg mb-2">Blockchain-Verified Certificates</h3>
              <p className="text-blue-100 text-sm leading-relaxed">
                All certificates are stored on the blockchain with IPFS, ensuring immutability and authenticity. 
                Each verification check confirms the certificate's validity against the blockchain record.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}




/*'use client';
import { useState } from 'react';
import PDFViewer from '../../../components/PDFViewer';

export default function CompanyVerify() {
  const [certificateId, setCertificateId] = useState('');
  const [verificationResult, setVerificationResult] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');

  const handleVerify = async () => {
    if (!certificateId.trim()) {
      alert('Please enter a certificate ID');
      return;
    }

    setIsVerifying(true);
    setVerificationResult(null);
    setPdfUrl('');

    try {
      const response = await fetch('/api/verify-certificate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ certificateId }),
      });

      const result = await response.json();
      setVerificationResult(result);

      if (result.valid && result.ipfsHash) {
        setPdfUrl(`/api/download-certificate?ipfsHash=${result.ipfsHash}`);
      }
    } catch (error) {
      setVerificationResult({ 
        valid: false, 
        error: 'Verification failed. Please try again.' 
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Certificate Verification
        </h1>
        <p className="text-gray-600">
          Verify the authenticity of certificates using blockchain
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold mb-4">Verify Certificate</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Certificate ID
                </label>
                <input
                  type="text"
                  value={certificateId}
                  onChange={(e) => setCertificateId(e.target.value)}
                  placeholder="Enter certificate ID (e.g., CERT-2024-UNI-001)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                onClick={handleVerify}
                disabled={isVerifying}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isVerifying ? 'Verifying...' : 'Verify Certificate'}
              </button>
            </div>
          </div>

          {verificationResult && (
            <div className={`p-6 rounded-lg border ${
              verificationResult.valid 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <h3 className="text-lg font-semibold mb-2">
                Verification Result
              </h3>
              
              {verificationResult.valid ? (
                <div className="space-y-2">
                  <p className="text-green-700 font-medium">
                    ✓ Certificate is valid and authentic
                  </p>
                  <p className="text-sm text-gray-600">
                    Issuer: {verificationResult.issuer}
                  </p>
                  <p className="text-sm text-gray-600">
                    Issue Date: {new Date(verificationResult.issueDate * 1000).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-gray-600">
                    IPFS Hash: {verificationResult.ipfsHash}
                  </p>
                </div>
              ) : (
                <p className="text-red-700">
                  {verificationResult.error || 'Certificate not found or invalid'}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {pdfUrl && (
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Original Certificate</h3>
                <div className="space-x-2">
                  <a
                    href={pdfUrl}
                    download="certificate.pdf"
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Download
                  </a>
                  <button
                    onClick={() => window.print()}
                    className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                  >
                    Print
                  </button>
                </div>
              </div>
              <PDFViewer pdfUrl={pdfUrl} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}*/