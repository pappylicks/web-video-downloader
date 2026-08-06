import React, { useState } from 'react';

const VideoDownloader = () => {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('idle'); // idle, downloading, error
  const [errorMessage, setErrorMessage] = useState('');

  const handleDownload = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;

    setStatus('downloading');
    setErrorMessage('');

    try {
      // 1. Send the URL to our local Node.js backend
      // Note: We use window.location.href for the actual download to trigger the browser's save dialog,
      // but we do a preliminary fetch here just to catch connection errors easily in the UI.
      
      const backendUrl = `http://localhost:4000/download?url=${encodeURIComponent(url)}`;
      
      // Preliminary check to see if the server is alive
      const checkResponse = await fetch(`http://localhost:4000/ping`).catch(() => null);
      
      if (!checkResponse) {
          throw new Error("Cannot connect to backend. Is your Node.js server running on port 4000?");
      }

      // If server is alive, trigger the download via browser navigation
      window.location.href = backendUrl;
      
      // Reset UI after a short delay, assuming the download started
      setTimeout(() => {
          setStatus('idle');
          setUrl('');
      }, 2000);

    } catch (err) {
      console.error(err);
      setStatus('error');
      setErrorMessage(err.message || "An error occurred while trying to download.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
        
        {/* Header Section */}
        <div className="bg-blue-600 p-6 text-center">
          <div className="w-16 h-16 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-4">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
             </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Video Downloader</h1>
          <p className="text-blue-100 text-sm">Save videos locally, without watermarks.</p>
        </div>

        {/* Input Section */}
        <div className="p-6">
          <form onSubmit={handleDownload} className="space-y-4">
            <div>
              <label htmlFor="video-url" className="block text-sm font-medium text-slate-700 mb-1">
                Video Link
              </label>
              <input
                id="video-url"
                type="url"
                required
                placeholder="Paste TikTok, IG, or YT link here..."
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={status === 'downloading'}
              />
            </div>

            {/* Error Message Display */}
            {status === 'error' && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100 flex items-start">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Download Button */}
            <button
              type="submit"
              disabled={status === 'downloading' || !url.trim()}
              className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-all flex items-center justify-center
                ${status === 'downloading' 
                  ? 'bg-blue-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg active:transform active:scale-[0.98]'
                }
              `}
            >
              {status === 'downloading' ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : (
                'Download Video'
              )}
            </button>
          </form>

          {/* Instructions */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-3">How it works</h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-start">
                <span className="text-blue-500 font-bold mr-2">1.</span>
                Ensure your Node.js backend is running on port 4000.
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 font-bold mr-2">2.</span>
                Paste a valid video URL into the box.
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 font-bold mr-2">3.</span>
                Click download and wait for the file prompt.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoDownloader;