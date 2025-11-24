import { GitHubFile } from '../types';

const GITHUB_API_BASE = 'https://api.github.com';

export class GitHubService {
  private owner: string;
  private repo: string;
  private token: string | null;

  constructor(owner: string, repo: string) {
    this.owner = owner;
    this.repo = repo;
    this.token = localStorage.getItem('github_pat');
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('github_pat', token);
  }

  async fetchAllFiles(path = ''): Promise<GitHubFile[]> {
    const cacheKey = `stlverse-${this.owner}-${this.repo}-${path}`;
    const cached = localStorage.getItem(cacheKey);
    
    // Simple 1-hour cache invalidation
    if (cached) {
      const { timestamp, data } = JSON.parse(cached);
      if (Date.now() - timestamp < 3600000) {
        return data;
      }
    }

    const headers: HeadersInit = this.token ? { 'Authorization': `token ${this.token}` } : {};
    const url = `${GITHUB_API_BASE}/repos/${this.owner}/${this.repo}/contents/${path}`;

    try {
      const response = await fetch(url, { headers });
      
      if (response.status === 403) {
        throw new Error('RATE_LIMITED');
      }
      if (!response.ok) {
        throw new Error(`GitHub API Error: ${response.statusText}`);
      }

      const items = await response.json();
      let allFiles: GitHubFile[] = [];
      let stlFiles: GitHubFile[] = [];
      let scadFiles: GitHubFile[] = [];
      const subDirPromises = [];

      for (const item of items) {
        if (item.type === 'file') {
          const lowerName = item.name.toLowerCase();
          if (lowerName.endsWith('.stl')) {
            stlFiles.push({
              name: item.name, // Display name
              url: item.download_url,
              path: item.path
            });
          } else if (lowerName.endsWith('.scad')) {
            scadFiles.push({
              name: item.name,
              url: item.download_url,
              path: item.path // Use full path for matching
            });
          }
        } else if (item.type === 'dir') {
          subDirPromises.push(this.fetchAllFiles(item.path));
        }
      }

      // Wait for subdirectories
      const subDirResults = await Promise.all(subDirPromises);
      subDirResults.forEach(files => {
        allFiles = allFiles.concat(files);
      });

      // Match SCAD to STL in current directory
      // Note: The logic assumes they are in the same folder
      for (const stl of stlFiles) {
        // Find a SCAD file in the same directory (simplified matching)
        // This regex removes the extension to match "box.stl" with "box.scad"
        const baseName = stl.name.replace(/\.[^/.]+$/, "");
        
        // Try to find exact match first, then any SCAD in the folder
        let matchingScad = scadFiles.find(s => s.name === `${baseName}.scad`);
        if (!matchingScad && scadFiles.length > 0) {
            // Fallback: Just grab the first SCAD in this folder if exact match fails
            // This mirrors the original script logic roughly
             matchingScad = scadFiles[0];
        }

        if (matchingScad) {
           try {
             const scadContent = await this.fetchFileContent(matchingScad.url);
             stl.scadContent = scadContent;
           } catch (e) {
             console.warn('Failed to fetch SCAD content', e);
           }
        }
        allFiles.push(stl);
      }

      const finalResult = allFiles;
      
      // Save to cache
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          timestamp: Date.now(),
          data: finalResult
        }));
      } catch (e) {
        console.warn('LocalStorage full, skipping cache');
      }

      return finalResult;
    } catch (error: any) {
      throw error;
    }
  }

  async fetchFileContent(url: string): Promise<string> {
    const headers: HeadersInit = this.token ? { 'Authorization': `token ${this.token}` } : {};
    const res = await fetch(url, { headers });
    if (!res.ok) return '';
    return await res.text();
  }
}