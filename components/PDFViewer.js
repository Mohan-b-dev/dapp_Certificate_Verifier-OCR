'use client';
import { useState, useEffect } from 'react';

export default function PDFViewer({ pdfUrl }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (pdfUrl) {
      console.log('PDF Viewer: Loading URL:', pdfUrl);
      setIsLoading(true);
      setError('');
    } else {
      setIsLoading(false);
      setError('');
    }
  }, [pdfUrl]);

  const handleLoad = () => {
    console.log('PDF loaded successfully');
    setIsLoading(false);
    setError('');
  };

  const handleError = () => {
    console.error('PDF failed to load');
    setIsLoading(false);
    setError('Failed to load PDF document. The file may be corrupted or unavailable.');
  };

  if (!pdfUrl) {
    return (
      <div className="w-full h-96 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-center">
          <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-lg">No certificate to display</p>
          <p className="text-sm mt-2">Verify a certificate to view it here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-96 border rounded-lg overflow-hidden bg-gray-100 relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <div className="text-gray-600 font-medium">Loading certificate...</div>
            <div className="text-sm text-gray-500 mt-2">Please wait</div>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 z-10">
          <div className="text-center text-red-600 max-w-md">
            <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-medium mb-2">Unable to load certificate</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}
      
      <iframe
        src={pdfUrl}
        className="w-full h-full border-0"
        onLoad={handleLoad}
        onError={handleError}
        title="Certificate PDF"
        style={{ 
          display: isLoading || error ? 'none' : 'block',
          background: 'white'
        }}
      />
    </div>
  );
}




/*'use client';
import { useState, useEffect } from 'react';

export default function PDFViewer({ pdfUrl }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (pdfUrl) {
      setIsLoading(true);
      setError('');
    }
  }, [pdfUrl]);

  if (!pdfUrl) {
    return (
      <div className="w-full h-96 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-center">
          <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p>Certificate PDF will appear here after verification</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-96 border rounded-lg overflow-hidden bg-gray-50 relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <div className="text-gray-600">Loading PDF...</div>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80">
          <div className="text-center text-red-600">
            <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>{error}</p>
          </div>
        </div>
      )}
      
      <iframe
        src={pdfUrl}
        className="w-full h-full"
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setError('Failed to load PDF. You can download it using the button above.');
        }}
        title="Certificate PDF"
      />
    </div>
  );
}*/




/*'use client';
import { useState, useEffect } from 'react';

export default function PDFViewer({ pdfUrl }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setIsLoading(true);
    setError('');
  }, [pdfUrl]);

  const handleLoad = () => {
    setIsLoading(false);
    setError('');
  };

  const handleError = () => {
    setIsLoading(false);
    setError('Failed to load PDF');
  };

  return (
    <div className="w-full h-96 border rounded-lg overflow-hidden bg-gray-50">
      {isLoading && (
        <div className="flex items-center justify-center h-full">
          <div className="text-gray-500">Loading PDF...</div>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center h-full">
          <div className="text-red-500">{error}</div>
        </div>
      )}
      <iframe
        src={pdfUrl}
        className="w-full h-full"
        onLoad={handleLoad}
        onError={handleError}
        title="Certificate PDF"
        style={{ display: isLoading || error ? 'none' : 'block' }}
      />
    </div>
  );
}*/