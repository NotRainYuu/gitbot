export interface SyncConfig {
  localPath: string;
  repoName: string;
  repoUrl: string;
  intervalMinutes: number;
  channelId: string;
  guildId: string;
  lastCommitSha: string | null;
  lastSyncTime: string | null;
  status: 'active' | 'paused';
}

export interface TrackTask {
  id: string; 
  repoUrl: string;
  owner: string;
  repo: string;
  channelId: string;
  guildId: string;
  lastCommitSha: string | null;
  lastReleaseId: string | number | null;
  lastCheckedTime: string | null;
}

export interface AutoGetTask {
  id: string; 
  repoUrl: string;
  owner: string;
  repo: string;
  localPath: string;
  channelId: string;
  guildId: string;
  lastCommitSha: string | null;
  lastCheckedTime: string | null;
}

export interface AppStoreData {
  sync: SyncConfig | null;       
  track: TrackTask[];            
  autoget: AutoGetTask[];        
}
