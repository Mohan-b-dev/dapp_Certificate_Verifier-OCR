// app/layout.js
import "./globals.css";
import WagmiClientProvider from "@/components/WagmiClientProvider";
import WalletConnectButton from "@/components/WalletConnectButton";

export const metadata = {
  title: "Blockchain Certificate Verification",
  description:
    "Decentralized certificate verification system using Blockchain + AI",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <WagmiClientProvider>
          <nav className="bg-white/80 backdrop-blur-lg shadow-lg border-b border-gray-200 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-20">
                <div className="flex items-center space-x-3">
                  <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-2.5 rounded-xl shadow-lg">
                    <svg
                      className="w-7 h-7 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                      CertVerify
                    </h1>
                    <p className="text-xs text-gray-500 font-medium">
                      Blockchain + AI Verification
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <a
                    href="/institution/upload"
                    className="px-5 py-2.5 text-gray-700 hover:text-blue-600 font-semibold rounded-xl hover:bg-blue-50 transition-all duration-200 flex items-center space-x-2"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    <span>Institution Portal</span>
                  </a>
                  <a
                    href="/company/verify"
                    className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 flex items-center space-x-2 transform hover:-translate-y-0.5"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>Verify Certificate</span>
                  </a>
                  <WalletConnectButton />
                </div>
              </div>
            </div>
          </nav>
          {children}
          <footer className="bg-gradient-to-r from-gray-900 to-gray-800 text-white mt-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div>
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="bg-gradient-to-br from-blue-500 to-indigo-500 p-2 rounded-lg">
                      <svg
                        className="w-6 h-6 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold">CertVerify</h3>
                  </div>
                  <p className="text-gray-400 text-sm">
                    Decentralized certificate verification powered by blockchain
                    technology and artificial intelligence.
                  </p>
                </div>
                <div>
                  <h4 className="text-lg font-bold mb-4">Quick Links</h4>
                  <ul className="space-y-2 text-gray-400">
                    <li>
                      <a
                        href="/institution/upload"
                        className="hover:text-white transition-colors"
                      >
                        Issue Certificate
                      </a>
                    </li>
                    <li>
                      <a
                        href="/company/verify"
                        className="hover:text-white transition-colors"
                      >
                        Verify Certificate
                      </a>
                    </li>
                    <li>
                      <a
                        href="#"
                        className="hover:text-white transition-colors"
                      >
                        Documentation
                      </a>
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-lg font-bold mb-4">Technology</h4>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1 bg-blue-600/20 text-blue-300 rounded-full text-xs font-semibold">
                      Blockchain
                    </span>
                    <span className="px-3 py-1 bg-purple-600/20 text-purple-300 rounded-full text-xs font-semibold">
                      AI/OCR
                    </span>
                    <span className="px-3 py-1 bg-green-600/20 text-green-300 rounded-full text-xs font-semibold">
                      IPFS
                    </span>
                    <span className="px-3 py-1 bg-indigo-600/20 text-indigo-300 rounded-full text-xs font-semibold">
                      Web3
                    </span>
                  </div>
                </div>
              </div>
              <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400 text-sm">
                <p>
                  &copy; 2025 CertVerify. All rights reserved. Built with
                  Blockchain & AI.
                </p>
              </div>
            </div>
          </footer>
        </WagmiClientProvider>
      </body>
    </html>
  );
}
