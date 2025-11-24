import React, { useEffect, useRef, useState } from 'react';
import { ModelMesh } from '../types';
import { X, Code, Box, Share2, GripHorizontal, GripVertical } from 'lucide-react';

interface BlogPostProps {
  model: ModelMesh | null;
  visible: boolean;
  onClose: () => void;
  width: number;
  onResize: (size: number) => void;
}

export const BlogPost: React.FC<BlogPostProps> = ({ model, visible, onClose, width, onResize }) => {
  const isDraggingRef = useRef(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();

      if (window.innerWidth > 768) {
        // Desktop: Resize Width (Right side aligned)
        // Mouse is x pixels from left. Width = WindowWidth - MouseX
        const newWidth = window.innerWidth - e.clientX;
        const clampedWidth = Math.max(300, Math.min(newWidth, window.innerWidth * 0.6));
        onResize(clampedWidth);
      } else {
        // Mobile: Resize Height (Bottom aligned)
        // Mouse is y pixels from top. Height = WindowHeight - MouseY
        const newHeight = window.innerHeight - e.clientY;
        const clampedHeight = Math.max(200, Math.min(newHeight, window.innerHeight * 0.9));
        onResize(clampedHeight);
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onResize]);

  const startResize = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    document.body.style.userSelect = 'none'; // Prevent text selection
    document.body.style.cursor = window.innerWidth > 768 ? 'ew-resize' : 'ns-resize';
  };

  if (!model) return null;

  const fileName = model.userData.fileName;
  const scadContent = model.userData.scadContent;
  const isScad = !!scadContent;

  return (
    <div 
      style={{
        width: isMobile ? '100%' : `${width}px`,
        height: isMobile ? `${width}px` : '100%', // reusing 'width' prop as 'size'
      }}
      className={`fixed bg-gray-900 text-white shadow-2xl transform transition-transform duration-500 ease-in-out z-50 flex flex-col
        /* Base positioning */
        bottom-0 right-0 
        /* Mobile overrides */
        ${isMobile ? 'left-0 rounded-t-2xl border-t border-white/10' : 'top-0 left-auto rounded-none border-l border-white/10'}
        ${visible 
          ? 'translate-y-0 translate-x-0' 
          : isMobile ? 'translate-y-full' : 'translate-x-full'
        }
      `}
    >
      {/* Resizer Handle */}
      <div 
        onMouseDown={startResize}
        className={`absolute z-50 flex items-center justify-center
          ${isMobile 
            ? 'top-0 left-0 w-full h-6 cursor-ns-resize -mt-3' // Mobile: Horizontal strip at top
            : 'top-0 left-0 w-1 h-full cursor-ew-resize -ml-0.5' // Desktop: Vertical strip at left
          }
        `}
      >
        {/* Visual Grip Indicator */}
        {isMobile && (
            <div className="w-12 h-1 bg-white/20 rounded-full mt-8 pointer-events-none" />
        )}
      </div>

      {/* Header */}
      <div className="p-6 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-blue-900/20 to-transparent shrink-0">
        <h2 className="text-xl font-bold font-mono text-cyan-400 truncate pr-4">{fileName}</h2>
        <button 
          onClick={onClose}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* Metadata Card */}
        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
          <div className="flex items-center gap-3 mb-3 text-sm text-gray-400">
            <Box size={16} className="text-pink-500" />
            <span>Model Details</span>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed">
            This 3D model was procedurally loaded from the repository. 
            Rendered with standard physical materials in a Three.js environment.
          </p>
        </div>

        {/* Code Block */}
        {isScad ? (
          <div className="space-y-2">
             <div className="flex items-center gap-2 text-sm text-green-400 font-mono">
                <Code size={16} />
                <span>Source Code (.scad)</span>
             </div>
             <div className="bg-black/50 rounded-lg p-4 border border-white/5 overflow-x-auto">
               <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap break-all">
                 {scadContent}
               </pre>
             </div>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500 border border-dashed border-white/10 rounded-xl">
            <span className="block text-sm">No source code available for this binary STL.</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-white/10 bg-black/40 shrink-0">
        <button className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2">
            <Share2 size={16} />
            <span>Share Model</span>
        </button>
      </div>
    </div>
  );
};