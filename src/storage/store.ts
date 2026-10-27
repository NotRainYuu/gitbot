import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.js';
import type { AppStoreData, AutoGetTask, SyncConfig, TrackTask } from './types.js';

const STORE_FILE = path.join(DATA_DIR, 'store.json');

const DEFAULT_DATA: AppStoreData = {
  sync: null,
  track: [],
  autoget: []
};

class LocalStore {
  private data: AppStoreData = { ...DEFAULT_DATA };
  private initialized = false;

  constructor() {
    this.init();
  }

  private init(): void {
    if (this.initialized) return;

    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(STORE_FILE)) {
      try {
        const raw = fs.readFileSync(STORE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = {
          sync: parsed.sync || null,
          track: Array.isArray(parsed.track) ? parsed.track : [],
          autoget: Array.isArray(parsed.autoget) ? parsed.autoget : []
        };
      } catch (err) {
        console.error('[Store] Failed to parse store.json, resetting with defaults:', err);
        this.data = { ...DEFAULT_DATA };
        this.persist();
      }
    } else {
      this.data = { ...DEFAULT_DATA };
      this.persist();
    }

    this.initialized = true;
  }

  private persist(): void {
    try {
      const tempFile = `${STORE_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempFile, STORE_FILE);
    } catch (err) {
      console.error('[Store] Error persisting data to store.json:', err);
    }
  }

  public getSync(): SyncConfig | null {
    return this.data.sync ? { ...this.data.sync } : null;
  }

  public setSync(config: SyncConfig): void {
    this.data.sync = { ...config };
    this.persist();
  }

  public clearSync(): void {
    this.data.sync = null;
    this.persist();
  }

  public updateSync(updates: Partial<SyncConfig>): void {
    if (!this.data.sync) return;
    this.data.sync = { ...this.data.sync, ...updates };
    this.persist();
  }

  public getTrackTasks(): TrackTask[] {
    return [...this.data.track];
  }

  public getTrackTask(id: string): TrackTask | undefined {
    return this.data.track.find(t => t.id.toLowerCase() === id.toLowerCase());
  }

  public addTrackTask(task: TrackTask): void {
    const existingIndex = this.data.track.findIndex(t => t.id.toLowerCase() === task.id.toLowerCase());
    if (existingIndex >= 0) {
      this.data.track[existingIndex] = { ...task };
    } else {
      this.data.track.push({ ...task });
    }
    this.persist();
  }

  public updateTrackTask(id: string, updates: Partial<TrackTask>): void {
    const task = this.data.track.find(t => t.id.toLowerCase() === id.toLowerCase());
    if (task) {
      Object.assign(task, updates);
      this.persist();
    }
  }

  public removeTrackTask(id: string): void {
    this.data.track = this.data.track.filter(t => t.id.toLowerCase() !== id.toLowerCase());
    this.persist();
  }

  public getAutoGetTasks(): AutoGetTask[] {
    return [...this.data.autoget];
  }

  public getAutoGetTask(id: string): AutoGetTask | undefined {
    return this.data.autoget.find(t => t.id.toLowerCase() === id.toLowerCase());
  }

  public addAutoGetTask(task: AutoGetTask): void {
    const existingIndex = this.data.autoget.findIndex(t => t.id.toLowerCase() === task.id.toLowerCase());
    if (existingIndex >= 0) {
      this.data.autoget[existingIndex] = { ...task };
    } else {
      this.data.autoget.push({ ...task });
    }
    this.persist();
  }

  public updateAutoGetTask(id: string, updates: Partial<AutoGetTask>): void {
    const task = this.data.autoget.find(t => t.id.toLowerCase() === id.toLowerCase());
    if (task) {
      Object.assign(task, updates);
      this.persist();
    }
  }

  public removeAutoGetTask(id: string): void {
    this.data.autoget = this.data.autoget.filter(t => t.id.toLowerCase() !== id.toLowerCase());
    this.persist();
  }
}

export const store = new LocalStore();
