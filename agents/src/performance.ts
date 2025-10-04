/**
 * Performance Monitoring and Metrics
 * Tracks service performance, action execution times, and system health
 */

import { logger } from '@elizaos/core';

/**
 * Performance metric data
 * @interface PerformanceMetric
 */
export interface PerformanceMetric {
  /** Name of the operation */
  operation: string;
  /** Duration in milliseconds */
  duration: number;
  /** Timestamp when operation started */
  timestamp: number;
  /** Whether operation succeeded */
  success: boolean;
  /** Optional error message */
  error?: string;
}

/**
 * Performance statistics
 * @interface PerformanceStats
 */
export interface PerformanceStats {
  /** Operation name */
  operation: string;
  /** Total number of executions */
  count: number;
  /** Average duration in ms */
  avgDuration: number;
  /** Minimum duration in ms */
  minDuration: number;
  /** Maximum duration in ms */
  maxDuration: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Last execution timestamp */
  lastExecution: number;
}

/**
 * Performance monitor for tracking and analyzing service performance
 * @class PerformanceMonitor
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics: number = 1000; // Keep last 1000 metrics

  /**
   * Record a performance metric
   * @param {string} operation - Name of the operation
   * @param {number} duration - Duration in milliseconds
   * @param {boolean} success - Whether operation succeeded
   * @param {string} [error] - Optional error message
   */
  record(operation: string, duration: number, success: boolean, error?: string): void {
    const metric: PerformanceMetric = {
      operation,
      duration,
      timestamp: Date.now(),
      success,
      error,
    };

    this.metrics.push(metric);

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // Log slow operations (>1s)
    if (duration > 1000) {
      logger.warn(`[Perf] Slow operation: ${operation} took ${duration}ms`);
    }

    // Log failures
    if (!success && error) {
      logger.error(`[Perf] Failed operation: ${operation} - ${error}`);
    }
  }

  /**
   * Measure and record execution time of an async operation
   * @template T
   * @param {string} operation - Name of the operation
   * @param {() => Promise<T>} fn - Function to measure
   * @returns {Promise<T>} Result of the operation
   */
  async measure<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    let success = true;
    let error: string | undefined;

    const result = await fn().catch((err: Error) => {
      success = false;
      error = err.message;
      throw err;
    });

    const duration = Date.now() - start;
    this.record(operation, duration, success, error);

    return result;
  }

  /**
   * Get statistics for a specific operation
   * @param {string} operation - Operation name
   * @returns {PerformanceStats | null} Statistics or null if no data
   */
  getStats(operation: string): PerformanceStats | null {
    const operationMetrics = this.metrics.filter((m) => m.operation === operation);

    if (operationMetrics.length === 0) {
      return null;
    }

    const durations = operationMetrics.map((m) => m.duration);
    const successes = operationMetrics.filter((m) => m.success).length;

    return {
      operation,
      count: operationMetrics.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      successRate: successes / operationMetrics.length,
      lastExecution: operationMetrics[operationMetrics.length - 1].timestamp,
    };
  }

  /**
   * Get statistics for all operations
   * @returns {PerformanceStats[]} Array of statistics
   */
  getAllStats(): PerformanceStats[] {
    const operations = [...new Set(this.metrics.map((m) => m.operation))];
    return operations
      .map((op) => this.getStats(op))
      .filter((stats): stats is PerformanceStats => stats !== null);
  }

  /**
   * Get recent metrics (last N)
   * @param {number} count - Number of metrics to retrieve
   * @returns {PerformanceMetric[]} Recent metrics
   */
  getRecentMetrics(count: number = 10): PerformanceMetric[] {
    return this.metrics.slice(-count);
  }

  /**
   * Get metrics for a specific time window
   * @param {number} windowMs - Time window in milliseconds
   * @returns {PerformanceMetric[]} Metrics within the window
   */
  getMetricsInWindow(windowMs: number): PerformanceMetric[] {
    const cutoff = Date.now() - windowMs;
    return this.metrics.filter((m) => m.timestamp >= cutoff);
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Generate a performance report
   * @returns {string} Formatted performance report
   */
  generateReport(): string {
    const stats = this.getAllStats();
    
    if (stats.length === 0) {
      return 'No performance data available';
    }

    let report = '\n📊 PERFORMANCE REPORT\n';
    report += '═'.repeat(80) + '\n\n';

    for (const stat of stats) {
      report += `Operation: ${stat.operation}\n`;
      report += `  Executions: ${stat.count}\n`;
      report += `  Avg Duration: ${stat.avgDuration.toFixed(2)}ms\n`;
      report += `  Min/Max: ${stat.minDuration.toFixed(2)}ms / ${stat.maxDuration.toFixed(2)}ms\n`;
      report += `  Success Rate: ${(stat.successRate * 100).toFixed(2)}%\n`;
      report += `  Last Run: ${new Date(stat.lastExecution).toISOString()}\n\n`;
    }

    report += '═'.repeat(80) + '\n';

    return report;
  }

  /**
   * Log current performance metrics
   */
  logMetrics(): void {
    logger.info(this.generateReport());
  }
}

/**
 * Global performance monitor instance
 */
export const performanceMonitor = new PerformanceMonitor();

