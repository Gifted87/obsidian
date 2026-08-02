import path from "path";
import { ExecutionEvent, FileLockEntry } from "./dag_types.ts";

export interface QueueItem {
  agentId: string;
  requestedAt: number;
  resolve: () => void;
  reject: (err: Error) => void;
}

export interface InternalLockRecord {
  filePath: string;
  heldByAgentId: string;
  acquiredAt: number;
  queue: QueueItem[];
}

export class FileLockManager {
  private static instance: FileLockManager | null = null;
  private locks: Map<string, InternalLockRecord> = new Map();
  private deadlockCheckInterval: NodeJS.Timeout | null = null;
  private deadlockTimeoutMs: number;
  private onEvent?: (event: ExecutionEvent) => void;

  constructor(
    deadlockTimeoutMs = 30000,
    onEvent?: (event: ExecutionEvent) => void
  ) {
    this.deadlockTimeoutMs = deadlockTimeoutMs;
    this.onEvent = onEvent;
    this.startDeadlockDetector();
  }

  public static getInstance(
    deadlockTimeoutMs = 30000,
    onEvent?: (event: ExecutionEvent) => void
  ): FileLockManager {
    if (!FileLockManager.instance) {
      FileLockManager.instance = new FileLockManager(deadlockTimeoutMs, onEvent);
    } else if (onEvent) {
      FileLockManager.instance.setOnEvent(onEvent);
    }
    return FileLockManager.instance;
  }

  public static resetInstance(): void {
    if (FileLockManager.instance) {
      FileLockManager.instance.stopDeadlockDetector();
      FileLockManager.instance = null;
    }
  }

  public setOnEvent(onEvent: (event: ExecutionEvent) => void): void {
    this.onEvent = onEvent;
  }

  /**
   * Normalize path to handle Windows/WSL inconsistencies
   */
  private normalizePath(filePath: string): string {
    return path.resolve(filePath).toLowerCase();
  }

  /**
   * Acquire a write lock on a file for an agent.
   * If the lock is held by another agent, returns a Promise that resolves when acquired.
   */
  public async acquire(filePath: string, agentId: string): Promise<void> {
    const normalized = this.normalizePath(filePath);
    const existing = this.locks.get(normalized);

    // Case 1: File is not currently locked
    if (!existing) {
      const record: InternalLockRecord = {
        filePath: normalized,
        heldByAgentId: agentId,
        acquiredAt: Date.now(),
        queue: [],
      };
      this.locks.set(normalized, record);
      this.emitEvent("file_locked", {
        filePath: normalized,
        agentId,
        queueLength: 0,
      });
      return;
    }

    // Case 2: Already held by the same agent (re-entrant lock)
    if (existing.heldByAgentId === agentId) {
      return;
    }

    // Case 3: Held by another agent → Queue the request
    return new Promise<void>((resolve, reject) => {
      existing.queue.push({
        agentId,
        requestedAt: Date.now(),
        resolve,
        reject,
      });

      this.emitEvent("file_locked", {
        filePath: normalized,
        agentId: existing.heldByAgentId,
        queueLength: existing.queue.length,
        waitingAgentId: agentId,
      });
    });
  }

  /**
   * Release a lock held by an agent.
   * Wakes up the next agent in queue if any.
   */
  public release(filePath: string, agentId: string): void {
    const normalized = this.normalizePath(filePath);
    const existing = this.locks.get(normalized);

    if (!existing) {
      return; // No lock held
    }

    if (existing.heldByAgentId !== agentId) {
      console.warn(
        `[FileLockManager] Agent ${agentId} attempted to release lock on ${normalized} held by ${existing.heldByAgentId}`
      );
      return;
    }

    if (existing.queue.length > 0) {
      // Transfer lock to the next waiting agent
      const nextItem = existing.queue.shift()!;
      existing.heldByAgentId = nextItem.agentId;
      existing.acquiredAt = Date.now();

      this.emitEvent("file_released", {
        filePath: normalized,
        releasedBy: agentId,
        nextAgentId: nextItem.agentId,
        remainingQueueLength: existing.queue.length,
      });

      nextItem.resolve();
    } else {
      // No waiting agents → Remove lock record entirely
      this.locks.delete(normalized);

      this.emitEvent("file_released", {
        filePath: normalized,
        releasedBy: agentId,
        nextAgentId: null,
        remainingQueueLength: 0,
      });
    }
  }

  /**
   * Force release all locks held by a specific agent (e.g., on agent failure/timeout)
   */
  public releaseAllForAgent(agentId: string): void {
    for (const [filePath, record] of this.locks.entries()) {
      if (record.heldByAgentId === agentId) {
        this.release(filePath, agentId);
      } else {
        // Remove from waiting queues as well
        record.queue = record.queue.filter((q) => {
          if (q.agentId === agentId) {
            q.reject(new Error(`Agent ${agentId} was terminated while waiting for lock on ${filePath}`));
            return false;
          }
          return true;
        });
      }
    }
  }

  /**
   * Returns snapshot of current locks for monitoring and SSE updates
   */
  public getLockState(): FileLockEntry[] {
    const entries: FileLockEntry[] = [];
    for (const [filePath, record] of this.locks.entries()) {
      entries.push({
        filePath,
        heldByAgentId: record.heldByAgentId,
        acquiredAt: record.acquiredAt,
        queueLength: record.queue.length,
      });
    }
    return entries;
  }

  /**
   * Background detector for stale locks (deadlock resolution)
   */
  private startDeadlockDetector(): void {
    if (this.deadlockCheckInterval) return;

    this.deadlockCheckInterval = setInterval(() => {
      const now = Date.now();
      for (const [filePath, record] of this.locks.entries()) {
        const heldDuration = now - record.acquiredAt;
        if (heldDuration > this.deadlockTimeoutMs) {
          console.warn(
            `[FileLockManager] Deadlock detected: File ${filePath} held by ${record.heldByAgentId} for ${heldDuration}ms. Forcing release.`
          );

          this.emitEvent("lock_deadlock", {
            filePath,
            agentId: record.heldByAgentId,
            heldForMs: heldDuration,
          });

          // Force release
          this.release(filePath, record.heldByAgentId);
        }
      }
    }, 10000); // Check every 10 seconds
  }

  public stopDeadlockDetector(): void {
    if (this.deadlockCheckInterval) {
      clearInterval(this.deadlockCheckInterval);
      this.deadlockCheckInterval = null;
    }
  }

  private emitEvent(type: ExecutionEvent["type"], payload: any): void {
    if (this.onEvent) {
      this.onEvent({
        type,
        payload,
        timestamp: Date.now(),
      });
    }
  }
}
