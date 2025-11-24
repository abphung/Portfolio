import React, { useState } from 'react';
import { Key } from 'lucide-react';

interface TokenModalProps {
  isOpen: boolean;
  onSubmit: (token: string) => void;
  message?: string;
}

export const TokenModal: React.FC<TokenModalProps> = ({ isOpen, onSubmit, message }) => {
  const [input, setInput] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-gray-900 border border-white/10 rounded-2xl shadow-2xl p-8">
        <div className="flex flex-col items-center gap-4 mb-6">
            <div className="p-4 bg-purple-500/10 rounded-full text-purple-400">
                <Key size={32} />
            </div>
            <h2 className="text-2xl font-bold text-white text-center">GitHub Access Required</h2>
            <p className="text-center text-gray-400 text-sm">
                {message || "The GitHub API rate limit has been reached. Please provide a Personal Access Token (PAT) to continue exploring the repository."}
            </p>
        </div>
        
        <form 
            onSubmit={(e) => {
                e.preventDefault();
                if(input.trim()) onSubmit(input);
            }}
            className="space-y-4"
        >
            <input
                type="password"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxx"
                className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors font-mono text-sm"
                autoFocus
            />
            <button 
                type="submit"
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-lg transition-colors"
            >
                Authenticate
            </button>
        </form>
        <p className="mt-4 text-xs text-center text-gray-600">
            Token is stored locally and sent only to GitHub API.
        </p>
      </div>
    </div>
  );
};