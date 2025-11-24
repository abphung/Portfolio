import { Mesh } from 'three';

export interface GitHubFile {
  name: string;
  url: string;
  path: string;
  scadContent?: string;
  sha?: string;
}

export interface ModelData extends GitHubFile {
  uuid?: string;
}

export interface ViewerState {
  isLoading: boolean;
  loadingProgress: number; // 0 to 100
  totalFiles: number;
  loadedCount: number;
  error: string | null;
}

// Augment Three.js Mesh user data
export type ModelMesh = Mesh & {
  userData: {
    fileName: string;
    scadContent?: string;
    originalPosition?: { x: number; y: number; z: number };
    [key: string]: any;
  };
};
