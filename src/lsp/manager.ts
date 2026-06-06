import {LspDetector} from './detector.js';
import type {LspDetectionResult, LspManagerOptions} from './types.js';
import {inferLanguageFromPath} from '../context/symbols.js';
import {getSharedLspSessionManager, type LspSessionManager} from './sessionManager.js';

export class LspManager {
  private detector: LspDetector;
  private options: Required<LspManagerOptions>;
  private detectionCache: Map<string, LspDetectionResult> = new Map();
  private readonly sessionManager: LspSessionManager;

  constructor(options: LspManagerOptions = {}) {
    this.detector = new LspDetector();
    this.options = {
      enabled: options.enabled ?? true,
      fallbackOnFailure: options.fallbackOnFailure ?? true,
      idleTimeoutMs: options.idleTimeoutMs ?? 300_000,
      longLivedSessions: options.longLivedSessions ?? true,
      maxSessions: options.maxSessions ?? 5,
      requestTimeoutMs: options.requestTimeoutMs ?? options.timeout ?? 5_000,
      startupTimeoutMs: options.startupTimeoutMs ?? options.timeout ?? 5_000,
      timeout: options.timeout ?? 5000,
      maxConcurrent: options.maxConcurrent ?? 4,
      fallbackEnabled: options.fallbackEnabled ?? true,
    };
    this.sessionManager = getSharedLspSessionManager(this.options);
  }

  async getLanguageStatus(language: string): Promise<LspDetectionResult> {
    const cached = this.detectionCache.get(language);
    if (cached) {
      return cached;
    }

    const result = await this.detector.detectLanguage(language);
    this.detectionCache.set(language, result);
    return result;
  }

  async getFileStatus(filePath: string): Promise<LspDetectionResult> {
    const language = inferLanguageFromPath(filePath);
    return this.getLanguageStatus(language);
  }

  async getAllLanguageStatus(): Promise<LspDetectionResult[]> {
    const results = await this.detector.detectAll();
    for (const result of results) {
      this.detectionCache.set(result.language, result);
    }
    return results;
  }

  isAvailable(language: string): boolean {
    const cached = this.detectionCache.get(language);
    if (cached) {
      return cached.status === 'available';
    }
    return false;
  }

  async isAvailableAsync(language: string): Promise<boolean> {
    const status = await this.getLanguageStatus(language);
    return status.status === 'available';
  }

  isFallbackEnabled(): boolean {
    return this.options.fallbackEnabled;
  }

  isEnabled(): boolean {
    return this.options.enabled;
  }

  shouldFallbackOnFailure(): boolean {
    return this.options.fallbackOnFailure;
  }

  isLongLivedSessionsEnabled(): boolean {
    return this.options.longLivedSessions;
  }

  getRequestTimeoutMs(): number {
    return this.options.requestTimeoutMs;
  }

  getStartupTimeoutMs(): number {
    return this.options.startupTimeoutMs;
  }

  async getSessionForFile(filePath: string, workspaceRoot = process.cwd()) {
    const status = await this.getFileStatus(filePath);
    return this.sessionManager.getOrCreateSession(workspaceRoot, status);
  }

  listSessions(language?: string) {
    return this.sessionManager.listSessions(language);
  }

  async stopSessions(language?: string): Promise<number> {
    return this.sessionManager.stopSessions(language);
  }

  async restartSessions(language?: string): Promise<number> {
    return this.sessionManager.restartSessions(language);
  }

  getLspCacheSnapshot() {
    return this.sessionManager.getCacheSnapshot();
  }

  getCacheSnapshot() {
    return this.sessionManager.getCacheSnapshot();
  }

  clearLspCache(): void {
    this.sessionManager.clearCache();
  }

  invalidateFile(filePath: string): void {
    this.sessionManager.invalidateFile(filePath);
  }

  clearCache(): void {
    this.detectionCache.clear();
    this.detector.clearCache();
  }

  formatStatusReport(result: LspDetectionResult): string {
    switch (result.status) {
      case 'available':
        return `${result.language}: available via ${result.serverName}${result.version ? ` (${result.version})` : ''}`;
      case 'missing':
        return `${result.language}: missing, install with ${result.installHint}`;
      case 'unsupported':
        return `${result.language}: unsupported`;
      case 'disabled':
        return `${result.language}: disabled`;
      case 'fallback':
        return `${result.language}: using fallback (LSP unavailable)`;
      default:
        return `${result.language}: unknown status`;
    }
  }

  async formatAllStatusReport(): Promise<string[]> {
    const results = await this.getAllLanguageStatus();
    return results.map((r) => this.formatStatusReport(r));
  }
}
