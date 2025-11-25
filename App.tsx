import React, { useEffect, useState, useCallback, useRef } from 'react';
import { SceneView } from './components/SceneView.js';
import { BlogPost } from './components/BlogPost.js';
import { TokenModal } from './components/TokenModal.js';
import { GitHubService } from './services/githubService.js';
import { REPO_OWNER, REPO_NAME } from './constants.js';
import { GitHubFile, ModelMesh } from './types';
import { Github, Loader2, Key, Search } from 'lucide-react';

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
  const [panelSize, setPanelSize] = useState(450);
  
  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  
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

  const handleHoverUpdate = useCallback((data: { name: string; x: number; y: number } | null) => {
    if (!tooltipRef.current) return;
    
    if (data && !selectedModel) {
        tooltipRef.current.style.display = 'block';
        tooltipRef.current.textContent = data.name;
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
      
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-400 via-indigo-400 to-orange-500 pointer-events-none" />

      {/* Main Scene z-0 */}
      {!loading && !error && files.length > 0 && (
        <div className="absolute inset-0 z-0">
          <SceneView 
            files={files} 
            onModelSelect={setSelectedModel}
            onProgress={handleProgress}
            onHover={handleHoverUpdate}
            panelSize={panelSize}
            selectedModel={selectedModel}
            searchTerm={searchTerm}
          />
        </div>
      )}

      {/* UI: Hover Tooltip z-1 */}
      <div 
        ref={tooltipRef}
        className="absolute pointer-events-none z-[1] px-4 py-2 text-gray-900 text-sm rounded-lg shadow-xl font-mono tracking-wide whitespace-nowrap hidden mt-4 border"
        style={{
             transform: `translateX(-50%)`,
             backgroundColor: '#ffe4e9',
             borderColor: '#ffe4e9'
        }}
      />

      {/* Visibility Gradients z-20 */}
      <div className="absolute top-0 left-0 w-full h-40 bg-gradient-to-b from-gray-900 from-10% via-gray-900/40 to-transparent pointer-events-none z-20" />
      <div className="absolute bottom-0 left-0 w-full h-40 bg-gradient-to-t from-gray-900 from-10% via-gray-900/40 to-transparent pointer-events-none z-20" />

      {/* UI: Header z-30 */}
      <div className={`absolute top-0 left-0 p-8 z-30 transition-opacity duration-500 ${selectedModel ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <h1 className="text-4xl font-black text-white tracking-tighter mb-2 drop-shadow-md">
          ANDREW<span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-100 to-orange-100">PHUNG</span>
        </h1>
        <a 
            href={`https://github.com/${REPO_OWNER}`}
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-white/80 text-sm font-mono drop-shadow hover:text-white transition-colors w-fit pointer-events-auto"
        >
            <Github size={16} />
            <span>{REPO_OWNER}</span>
        </a>
      </div>

      {/* UI: Search Bar z-30 */}
      <div className={`absolute top-8 right-8 z-30 transition-all duration-500 ${selectedModel ? 'opacity-0 translate-x-10 pointer-events-none' : 'opacity-100'}`}>
          <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={16} className="text-white/60 group-focus-within:text-white transition-colors" />
              </div>
              <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search"
                  className="bg-gray-900/30 backdrop-blur-md border border-white/10 text-white text-sm rounded-full pl-10 pr-4 py-2 w-48 focus:w-64 transition-all duration-300 focus:outline-none focus:bg-gray-900/50 focus:border-white/30 placeholder-white/40 font-mono shadow-lg"
              />
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

      {/* Instruction Footer z-30 */}
      {!selectedModel && !loading && (
        <div className="absolute bottom-8 right-8 text-right text-white/90 text-xs font-mono pointer-events-none drop-shadow-sm z-30 hidden sm:block">
          <p>SCROLL to navigate</p>
          <p>CLICK to inspect / DRAG to rotate</p>
        </div>
      )}
    </div>
  );
}