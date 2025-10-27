'use client';
import { useState, useEffect } from 'react';

export default function OCRScanner({ file, onOCRComplete }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (file) {
      processOCR(file);
    }
  }, [file]);

  const processOCR = async (pdfFile) => {
    if (!pdfFile || !(pdfFile instanceof File) || pdfFile.type !== 'application/pdf') {
      console.error('Invalid file provided:', pdfFile?.type || 'No file');
      onOCRComplete({
        detectedId: '',
        confidence: 0,
        error: 'Only PDF files are supported. Please upload a valid PDF.',
        status: 'error',
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      // Simulate OCR processing for PDF (tesseract.js can't directly OCR PDFs)
      console.log('Simulating OCR for PDF:', pdfFile.name);
      for (let i = 0; i <= 100; i += 20) {
        await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate progress
        setProgress(i / 100);
      }

      // No actual OCR; prompt for manual ID entry
      onOCRComplete({
        detectedId: '',
        confidence: 0,
        fullText: 'PDF detected. Please enter Certificate ID manually.',
        status: 'pdf_detected',
      });
    } catch (error) {
      console.error('OCR Simulation Error:', error);
      onOCRComplete({
        detectedId: '',
        confidence: 0,
        error: 'OCR simulation failed. Please enter ID manually.',
        status: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border">
      <h3 className="text-lg font-semibold mb-4">AI OCR Processing</h3>
      {isProcessing ? (
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span>Processing PDF...</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress * 100}%` }}></div>
          </div>
          <p className="text-sm text-gray-500">Only PDF files are supported</p>
        </div>
      ) : (
        <div>
          <p className="text-gray-600">OCR will simulate processing for PDF files</p>
          <p className="text-sm text-gray-500 mt-2">Note: Manual ID entry is required</p>
        </div>
      )}
    </div>
  );
}