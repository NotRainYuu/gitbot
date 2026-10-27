import { config } from '../config.js';

export interface WorkerStatus {
  url: string | null;
  status: 'ONLINE' | 'WAKING_UP' | 'OFFLINE' | 'UNCONFIGURED';
  lastPingTime: string | null;
  lastResponseMs: number;
  totalPings: number;
  successCount: number;
  failCount: number;
  lastStatusCode: number | null;
  lastError: string | null;
}

export class CloudflareWakeKeeper {
  private timer: NodeJS.Timeout | null = null;
  private isPinging = false;
  private state: WorkerStatus = {
    url: config.cfWorkerUrl || null,
    status: config.cfWorkerUrl ? 'OFFLINE' : 'UNCONFIGURED',
    lastPingTime: null,
    lastResponseMs: 0,
    totalPings: 0,
    successCount: 0,
    failCount: 0,
    lastStatusCode: null,
    lastError: null,
  };

  public getStatus(): WorkerStatus {
    return { ...this.state };
  }

  public setWorkerUrl(url: string): void {
    this.state.url = url.trim();
    this.state.status = 'WAKING_UP';
    this.wakeNow();
  }

  public start(): void {
    if (!config.cfWorkerUrl || !config.cfWorkerAutoWakeup) {
      return;
    }

    const intervalSeconds = Math.max(30, config.cfWorkerPingIntervalSeconds || 120);
    const intervalMs = intervalSeconds * 1000;

    console.log(
      `\x1b[35m[CF WakeKeeper]\x1b[0m Monitoring Cloudflare Worker at \x1b[36m${config.cfWorkerUrl}\x1b[0m (Ping every ${intervalSeconds}s to prevent idle sleep).`
    );

    this.wakeNow();

    this.timer = setInterval(() => {
      this.wakeNow();
    }, intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async wakeNow(): Promise<{ success: boolean; statusCode?: number; latencyMs: number; error?: string }> {
    const targetUrl = this.state.url || config.cfWorkerUrl;
    if (!targetUrl) {
      return { success: false, latencyMs: 0, error: 'No Cloudflare Worker URL configured' };
    }

    if (this.isPinging) {
      return { success: false, latencyMs: 0, error: 'Ping already in progress' };
    }

    this.isPinging = true;
    const startTime = Date.now();
    this.state.totalPings++;
    this.state.lastPingTime = new Date().toISOString();

    try {
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000); 

      const res = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'GitBot-CF-WakeKeeper/1.0 (+https://github.com/Antigravity)',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          'X-Wake-Ping': 'true',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;

      this.state.lastResponseMs = latencyMs;
      this.state.lastStatusCode = res.status;
      this.state.status = res.ok || res.status < 500 ? 'ONLINE' : 'OFFLINE';
      this.state.successCount++;
      this.state.lastError = null;

      return {
        success: true,
        statusCode: res.status,
        latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      this.state.lastResponseMs = latencyMs;
      this.state.status = 'OFFLINE';
      this.state.failCount++;
      this.state.lastError = err.name === 'AbortError' ? 'Request timed out (10s)' : err.message;

      try {
        const retryRes = await fetch(targetUrl, {
          method: 'GET',
          headers: { 'User-Agent': 'GitBot-CF-WakeKeeper/1.0 (Retry)' },
        });
        if (retryRes.ok || retryRes.status < 500) {
          this.state.status = 'ONLINE';
          this.state.lastError = null;
        }
      } catch {
        
      }

      return {
        success: false,
        latencyMs,
        error: this.state.lastError || 'Failed to connect to Cloudflare Worker',
      };
    } finally {
      this.isPinging = false;
    }
  }
}

export const cfWakeKeeper = new CloudflareWakeKeeper();
