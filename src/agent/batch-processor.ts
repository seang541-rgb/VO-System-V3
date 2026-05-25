// Batch Processor
// Enables multi-project batch operations: bulk VO comparison, audit, and report generation.
// Runs sequentially to avoid overloading the browser with WASM instances.

import type { VoComparisonResults } from '../BimEngine';
import type { ToolContext } from './tools';

export type BatchTaskType = 'compare' | 'audit' | 'report';

export interface BatchTask {
  id: string;
  projectId: string;
  projectName: string;
  type: BatchTaskType;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface BatchProgress {
  total: number;
  completed: number;
  failed: number;
  current: BatchTask | null;
}

export type BatchEventHandler = (progress: BatchProgress) => void;

export class BatchProcessor {
  private tasks: BatchTask[] = [];
  private onProgress: BatchEventHandler | null = null;
  private aborted = false;

  setOnProgress(handler: BatchEventHandler) {
    this.onProgress = handler;
  }

  addTask(projectId: string, projectName: string, type: BatchTaskType): string {
    const id = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.tasks.push({
      id,
      projectId,
      projectName,
      type,
      status: 'pending',
    });
    return id;
  }

  abort() {
    this.aborted = true;
  }

  getTasks(): readonly BatchTask[] {
    return this.tasks;
  }

  async run(
    executeTask: (task: BatchTask) => Promise<unknown>,
  ): Promise<BatchTask[]> {
    this.aborted = false;

    for (const task of this.tasks) {
      if (this.aborted) break;
      if (task.status !== 'pending') continue;

      task.status = 'running';
      task.startedAt = Date.now();
      this.emitProgress();

      try {
        task.result = await executeTask(task);
        task.status = 'completed';
      } catch (err) {
        task.status = 'failed';
        task.error = err instanceof Error ? err.message : String(err);
      }
      task.completedAt = Date.now();
      this.emitProgress();
    }

    return [...this.tasks];
  }

  private emitProgress() {
    if (!this.onProgress) return;
    const completed = this.tasks.filter((t) => t.status === 'completed').length;
    const failed = this.tasks.filter((t) => t.status === 'failed').length;
    const current = this.tasks.find((t) => t.status === 'running') ?? null;
    this.onProgress({
      total: this.tasks.length,
      completed,
      failed,
      current,
    });
  }

  reset() {
    this.tasks = [];
    this.aborted = false;
  }

  getSummary(): { total: number; completed: number; failed: number; totalDurationMs: number } {
    const completed = this.tasks.filter((t) => t.status === 'completed');
    const failed = this.tasks.filter((t) => t.status === 'failed');
    const totalDuration = this.tasks.reduce((sum, t) => {
      if (t.startedAt && t.completedAt) return sum + (t.completedAt - t.startedAt);
      return sum;
    }, 0);
    return {
      total: this.tasks.length,
      completed: completed.length,
      failed: failed.length,
      totalDurationMs: totalDuration,
    };
  }
}
