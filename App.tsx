import React, { useEffect, useState, useCallback, useRef } from 'react';
import { SceneView } from './components/SceneView';
import { BlogPost } from './components/BlogPost';
import { TokenModal } from './components/TokenModal';
import { GitHubService } from './services/githubService';
import { REPO_OWNER, REPO_NAME } from './constants';
import { GitHubFile, ModelMesh } from './types';
import { Github, Loader2, Key } from 'lucide-react';

const gitHubService = new GitHubService(REPO_OWNER, REPO_NAME);

export default function App() {
  const [files, setFiles] = useState<GitHubFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenModalMessage, setTokenModalMessage] = useState<string | undefined>();
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });
  
  const [selectedModel, setSelectedModel] = useState<ModelMesh | null>(null);
  
  // Panel Size State (Pixels)
  // Default to 450px for Desktop, or roughly 50vh for mobile (calc on init if needed, but 450 is a safe start)
  const [panelSize, setPanelSize] = useState(450);
  
  // Ref for Tooltip DOM to update directly without re-render
  const tooltipRef = useRef<HTMLDivElement>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await gitHubService.fetchAllFiles();
      setFiles(data);
    } catch (err: any) {
      const errorMessage = err.message || '';
      
      if (errorMessage === 'RATE_LIMITED') {
        setTokenModalMessage('The GitHub API rate limit has been reached. Please provide a Personal Access Token (PAT) to continue.');
        setShowTokenModal(true);
      } else if (errorMessage.startsWith('GitHub API Error')) {
        // Handle API errors (like 401 Unauthorized) by asking for a new key
        setTokenModalMessage(`GitHub API Error: ${errorMessage.replace('GitHub API Error: ', '')}. Please update your Access Token.`);
        setShowTokenModal(true);
      } else {
        setError(errorMessage || 'Failed to fetch repository contents.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleTokenSubmit = (token: string) => {
    gitHubService.setToken(token);
    setShowTokenModal(false);
    loadFiles();
  };

  const handleProgress = (current: number, total: number) => {
    setLoadingProgress({ current, total });
  };

  const openTokenModalManually = () => {
    setTokenModalMessage("Please enter your GitHub Personal Access Token.");
    setShowTokenModal(true);
  };

  // Callback from SceneView to update tooltip position
  const handleHoverUpdate = useCallback((data: { name: string; x: number; y: number } | null) => {
    if (!tooltipRef.current) return;
    
    if (data && !selectedModel) {
        tooltipRef.current.style.display = 'block';
        tooltipRef.current.textContent = data.name;
        // x and y are now relative to the bottom of the object
        tooltipRef.current.style.left = `${data.x}px`;
        tooltipRef.current.style.top = `${data.y}px`;
    } else {
        tooltipRef.current.style.display = 'none';
    }
  }, [selectedModel]);

  return (
    <div 
        className="w-full h-screen bg-gray-50 relative overflow-hidden font-sans select-none"
    >
      
      {/* Background Ambience - Lighter Sunrise Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-400 via-indigo-400 to-orange-500 pointer-events-none" />

      {/* Main Scene z-0 */}
      {!loading && !error && files.length > 0 && (
        <div className="absolute inset-0 z-0">
          <SceneView 
            files={files} 
            onModelSelect={setSelectedModel}
            onProgress={handleProgress}
            onHover={handleHoverUpdate}
            panelSize={panelSize} // Pass dynamic size for centering
            selectedModel={selectedModel}
          />
        </div>
      )}

      {/* UI: Hover Tooltip z-1 - lowered to be barely above scene */}
      <div 
        ref={tooltipRef}
        className="absolute pointer-events-none z-[1] px-4 py-2 text-gray-900 text-sm rounded-lg shadow-xl font-mono tracking-wide whitespace-nowrap hidden mt-4 border"
        style={{
             transform: `translateX(-50%)`, // Center horizontally relative to passed x
             backgroundColor: '#ffe4e9',
             borderColor: '#ffe4e9'
        }}
      />

      {/* Visibility Gradients - Top and Bottom z-20 (Covers Scene and Tooltip) */}
      <div className="absolute top-0 left-0 w-full h-40 bg-gradient-to-b from-gray-900 from-10% via-gray-900/40 to-transparent pointer-events-none z-20" />
      <div className="absolute bottom-0 left-0 w-full h-40 bg-gradient-to-t from-gray-900 from-10% via-gray-900/40 to-transparent pointer-events-none z-20" />

      {/* UI: Header z-30 (Above Gradients) */}
      <div className={`absolute top-0 left-0 p-8 z-30 transition-opacity duration-500 ${selectedModel ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <h1 className="text-4xl font-black text-white tracking-tighter mb-2 drop-shadow-md">
          STL<span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-100 to-orange-100">VERSE</span>
        </h1>
        <div className="flex items-center gap-2 text-white/80 text-sm font-mono drop-shadow">
            <Github size={16} />
            <span>{REPO_OWNER} / {REPO_NAME}</span>
        </div>
      </div>

      {/* UI: Loading Overlay z-40 */}
      {(loading || (files.length > 0 && loadingProgress.current < files.length)) && (
        <div className="absolute bottom-8 left-8 z-40 bg-white px-6 py-4 rounded-xl shadow-xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
           <Loader2 className="animate-spin text-purple-600" size={24} />
           <div>
             <div className="text-gray-900 text-sm font-semibold">
                {loading ? 'Fetching Repository...' : 'Rendering Models'}
             </div>
             <div className="text-xs text-gray-600 font-mono mt-1">
                {loadingProgress.total > 0 
                  ? `${loadingProgress.current} / ${loadingProgress.total} loaded`
                  : 'Connecting to GitHub API...'
                }
             </div>
           </div>
        </div>
      )}

      {/* UI: Error z-50 */}
      {error && !showTokenModal && (
        <div className="absolute inset-0 flex items-center justify-center z-50">
           <div className="text-center max-w-lg p-8 bg-gray-900/90 backdrop-blur rounded-2xl border border-white/20 shadow-2xl">
             <h2 className="text-red-500 text-xl font-bold mb-2">Connection Error</h2>
             <p className="text-white mb-6">{error}</p>
             <div className="flex gap-4 justify-center">
               <button 
                 onClick={loadFiles}
                 className="px-6 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors font-semibold"
               >
                 Retry
               </button>
               <button 
                 onClick={openTokenModalManually}
                 className="px-6 py-2 bg-purple-500/50 hover:bg-purple-500/60 text-white border border-white/20 rounded-lg transition-colors flex items-center gap-2"
               >
                 <Key size={16} />
                 Update API Key
               </button>
             </div>
           </div>
        </div>
      )}

      {/* Overlays (Blog Post, Modals) z-50+ handled internally */}
      <BlogPost 
        model={selectedModel} 
        visible={!!selectedModel} 
        onClose={() => setSelectedModel(null)}
        width={panelSize}
        onResize={setPanelSize}
      />

      <TokenModal 
        isOpen={showTokenModal} 
        onSubmit={handleTokenSubmit} 
        message={tokenModalMessage}
      />

      {/* Instruction Footer z-30 (Above Gradients) */}
      {!selectedModel && !loading && (
        <div className="absolute bottom-8 right-8 text-right text-white/90 text-xs font-mono pointer-events-none drop-shadow-sm z-30">
          <p>SCROLL to navigate</p>
          <p>CLICK to inspect / DRAG to rotate</p>
        </div>
      )}
    </div>
  );
}