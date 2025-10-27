export default function BlockchainStatus({ status, progress, isUploading }) {
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border">
      <h3 className="text-lg font-semibold mb-4">Blockchain Status</h3>
      
      <div className="space-y-3">
        {isUploading && (
          <div className="flex justify-between text-sm">
            <span>Uploading to IPFS...</span>
            <span>{progress}%</span>
          </div>
        )}
        
        {isUploading && (
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        )}
        
        {status && (
          <div className={`p-3 rounded text-sm ${
            status.includes('Error') 
              ? 'bg-red-50 text-red-700 border border-red-200'
              : status.includes('successfully')
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
}