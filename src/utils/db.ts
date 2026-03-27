
// Simple wrapper around IndexedDB to mimic basic Dexie functionality
// implementation since we cannot install the actual library due to environment issues.

export interface RepoData {
    id?: number;
    name: string;
    brief: string;
    assets: any[];
    fileSystem: any[];
    created: number;
}

export interface AssetData {
    id: string;
    name: string;
    type: 'video' | 'image' | 'audio';
    blob?: Blob;
    url?: string; // For mock or external
    duration?: string;
    size?: number;
    created: number;
    thumb?: string;
    tags?: string[];
    meta?: any;
    status?: 'pending' | 'uploading' | 'processing' | 'ready' | 'error';
    progress?: number;
}

export interface IngestionJob {
    repoId: string;
    files: { name: string, type: string, blob: Blob }[];
    status: 'queued' | 'processing' | 'completed' | 'failed';
    progress: number;
    logs: string[];
    currentFileIndex: number;
    error?: string;
}

export interface PendingRepoData {
    id: string; // UUID
    name: string;
    brief: string;
    assets: AssetData[];
    jobStatus: 'idle' | 'ingesting' | 'completed' | 'failed' | 'ready_to_commit';
    generatedData?: any; // Stores the final AI output before manual commit
    logs?: string[]; // Persisted log activity
    createdAt: number;
}

class TremDatabase {
    private dbName = 'TremDB';
    private version = 3;
    private db: IDBDatabase | null = null;

    constructor() {
        this.init();
    }

    private init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = (event) => {
                console.error("IndexedDB error:", (event.target as any).error);
                reject((event.target as any).error);
            };

            request.onsuccess = (event) => {
                this.db = (event.target as IDBOpenDBRequest).result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains('repos')) {
                    db.createObjectStore('repos', { keyPath: 'id', autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('assets')) {
                    db.createObjectStore('assets', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('pendingRepos')) {
                    db.createObjectStore('pendingRepos', { keyPath: 'id' });
                }
            };
        });
    }

    private async ensureDb(): Promise<IDBDatabase> {
        if (!this.db) {
            await this.init();
        }

        // Critical Sanity Check: Ensure 'pendingRepos' exists
        if (this.db && !this.db.objectStoreNames.contains('pendingRepos')) {
            console.error("DB Corruption Detected: 'pendingRepos' store missing. Initiating emergency reset.");
            this.db.close();
            this.db = null;
            await new Promise((resolve) => {
                const req = indexedDB.deleteDatabase(this.dbName);
                req.onsuccess = resolve;
                req.onerror = resolve; // Proceed anyway
                req.onblocked = resolve;
            });
            console.log("DB Reset Complete. Re-initializing...");
            await this.init();
        }

        return this.db!;
    }

    async addRepo(repo: Omit<RepoData, 'id'>): Promise<number> {
        const db = await this.ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['repos'], 'readwrite');
            const store = transaction.objectStore('repos');
            const request = store.add(repo);

            request.onsuccess = () => {
                resolve(request.result as number);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async getAllRepos(): Promise<RepoData[]> {
        const db = await this.ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['repos'], 'readonly');
            const store = transaction.objectStore('repos');
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result as RepoData[]);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async getRepo(id: number): Promise<RepoData | undefined> {
        const db = await this.ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['repos'], 'readonly');
            const store = transaction.objectStore('repos');
            const request = store.get(id);

            request.onsuccess = () => {
                resolve(request.result as RepoData);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async updateRepo(id: number, updates: Partial<RepoData>): Promise<void> {
        const db = await this.ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['repos'], 'readwrite');
            const store = transaction.objectStore('repos');
            const getRequest = store.get(id);

            getRequest.onsuccess = () => {
                const repo = getRequest.result;
                if (repo) {
                    const updatedRepo = { ...repo, ...updates };
                    const putRequest = store.put(updatedRepo);

                    putRequest.onsuccess = () => resolve();
                    putRequest.onerror = () => reject(putRequest.error);
                } else {
                    reject(new Error('Repository not found'));
                }
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async deleteRepo(id: number): Promise<void> {
        const db = await this.ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['repos'], 'readwrite');
            const store = transaction.objectStore('repos');
            const request = store.delete(id);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async addAsset(asset: AssetData): Promise<string> {
        const db = await this.ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['assets'], 'readwrite');
            const store = transaction.objectStore('assets');
            const request = store.put(asset); // use put to allow updates or inserts based on id

            request.onsuccess = () => {
                resolve(request.result as string);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async getAllAssets(): Promise<AssetData[]> {
        const db = await this.ensureDb();
        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction(['assets'], 'readonly');
                const store = transaction.objectStore('assets');
                const request = store.getAll();

                request.onsuccess = () => {
                    resolve(request.result as AssetData[]);
                };

                request.onerror = () => {
                    reject(request.error);
                };
            } catch (e) {
                // Store might not exist if update failed or old version loaded?
                // Should not happen with onupgradeneeded logic but safe to handle
                console.warn("Assets store access failed", e);
                resolve([]);
            }
        });
    }

    async getAsset(id: string): Promise<AssetData | undefined> {
        const db = await this.ensureDb();
        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction(['assets'], 'readonly');
                const store = transaction.objectStore('assets');
                const request = store.get(id);

                request.onsuccess = () => {
                    resolve(request.result as AssetData);
                };

                request.onerror = () => {
                    reject(request.error);
                };
            } catch (e) {
                console.warn("Assets store access failed", e);
                resolve(undefined);
            }
        });
    }

    async deleteAsset(id: string): Promise<void> {
        const db = await this.ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['assets'], 'readwrite');
            const store = transaction.objectStore('assets');
            const request = store.delete(id);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    // Pending Repos (Jobs)
    async addPendingRepo(repo: PendingRepoData): Promise<void> {
        const db = await this.ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['pendingRepos'], 'readwrite');
            const store = transaction.objectStore('pendingRepos');
            const request = store.put(repo);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getPendingRepo(id: string): Promise<PendingRepoData | undefined> {
        const db = await this.ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['pendingRepos'], 'readonly');
            const store = transaction.objectStore('pendingRepos');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllPendingRepos(): Promise<PendingRepoData[]> {
        const db = await this.ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['pendingRepos'], 'readonly');
            const store = transaction.objectStore('pendingRepos');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async updatePendingRepo(id: string, updates: Partial<PendingRepoData>): Promise<void> {
        const db = await this.ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['pendingRepos'], 'readwrite');
            const store = transaction.objectStore('pendingRepos');
            const getRequest = store.get(id);

            getRequest.onsuccess = () => {
                const repo = getRequest.result;
                if (repo) {
                    const updated = { ...repo, ...updates };
                    store.put(updated).onsuccess = () => resolve();
                } else {
                    reject(new Error("Pending repo not found"));
                }
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async addLogToPendingRepo(id: string, log: string): Promise<void> {
        const db = await this.ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['pendingRepos'], 'readwrite');
            const store = transaction.objectStore('pendingRepos');
            const getRequest = store.get(id);

            getRequest.onsuccess = () => {
                const repo = getRequest.result as PendingRepoData;
                if (repo) {
                    if (!repo.logs) repo.logs = [];
                    repo.logs.push(log);
                    store.put(repo).onsuccess = () => resolve();
                } else {
                    // If repo not found, strictly reject? Or ignore?
                    // Rejecting helps debug timing issues.
                    reject(new Error("Pending repo not found for logging"));
                }
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async deletePendingRepo(id: string): Promise<void> {
        const db = await this.ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['pendingRepos'], 'readwrite');
            const store = transaction.objectStore('pendingRepos');
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    async updatePendingAsset(repoId: string, assetId: string, updates: Partial<AssetData>): Promise<void> {
        const db = await this.ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['pendingRepos'], 'readwrite');
            const store = transaction.objectStore('pendingRepos');
            const getRequest = store.get(repoId);

            getRequest.onsuccess = () => {
                const repo = getRequest.result as PendingRepoData;
                if (repo) {
                    const assetIndex = repo.assets.findIndex(a => a.id === assetId);
                    if (assetIndex !== -1) {
                        repo.assets[assetIndex] = { ...repo.assets[assetIndex], ...updates };
                        store.put(repo).onsuccess = () => resolve();
                    } else {
                        // Asset not found, maybe already removed or bad ID. 
                        // Resolve anyway to avoid crashing the job.
                        console.warn(`Asset ${assetId} not found in repo ${repoId} during update`);
                        resolve();
                    }
                } else {
                    reject(new Error("Pending repo not found"));
                }
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }
}

export const db = new TremDatabase();
