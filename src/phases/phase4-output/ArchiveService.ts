import { PrismaClient } from '@prisma/client';
import { toJsonValue } from '../../core/JsonValue.js';

const prisma = new PrismaClient();

export interface KPI {
  total: number;
  completed: number;
  failed: number;
  rejected: number;
  waitingHuman: number;
  totalDurationMs: number;
  successRate: number;
  averageDurationMs: number;
}

export interface KPIsByType {
  [workflowType: string]: KPI;
}

export interface KPIsSnapshot {
  timestamp: Date;
  byType: KPIsByType;
  global: KPI;
}

class ArchiveServiceClass {
  private snapshotInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startSnapshotScheduler();
  }

  async writeEvent(
    executionId: string,
    eventType: string,
    stepName: string | null,
    data: Record<string, unknown>
  ): Promise<void> {
    await prisma.workflowEvent.create({
      data: {
        id: `${executionId}-${eventType}-${Date.now()}`,
        executionId,
        stepName: stepName || undefined,
        eventType,
        data: toJsonValue(data),
        timestamp: new Date(),
      },
    });
  }

  async updateKPI(
    type: string,
    status: string,
    durationMs: number | null
  ): Promise<void> {
    await prisma.kpiSnapshot.upsert({
      where: { workflowType: type },
      create: {
        workflowType: type,
        total: 1,
        completed: status === 'COMPLETED' ? 1 : 0,
        failed: status === 'FAILED' ? 1 : 0,
        rejected: status === 'REJECTED' ? 1 : 0,
        waitingHuman: status === 'WAITING_HUMAN' ? 1 : 0,
        totalDurationMs: durationMs || 0,
      },
      update: {
        total: { increment: 1 },
        completed: { increment: status === 'COMPLETED' ? 1 : 0 },
        failed: { increment: status === 'FAILED' ? 1 : 0 },
        rejected: { increment: status === 'REJECTED' ? 1 : 0 },
        waitingHuman: { increment: status === 'WAITING_HUMAN' ? 1 : 0 },
        totalDurationMs: { increment: durationMs || 0 },
        updatedAt: new Date(),
      },
    });
  }

  async getKPIs(): Promise<{ byType: KPIsByType; global: KPI }> {
    const rows = await prisma.kpiSnapshot.findMany();

    const byType: KPIsByType = {};
    const global: KPI = {
      total: 0,
      completed: 0,
      failed: 0,
      rejected: 0,
      waitingHuman: 0,
      totalDurationMs: 0,
      successRate: 0,
      averageDurationMs: 0,
    };

    for (const row of rows) {
      const successRate = row.total > 0
        ? Math.round((row.completed / row.total) * 100 * 10) / 10
        : 0;
      const avgDurationMs = row.total > 0
        ? Math.round(row.totalDurationMs / row.total)
        : 0;

      byType[row.workflowType] = {
        total: row.total,
        completed: row.completed,
        failed: row.failed,
        rejected: row.rejected,
        waitingHuman: row.waitingHuman,
        totalDurationMs: row.totalDurationMs,
        successRate,
        averageDurationMs: avgDurationMs,
      };

      global.total += row.total;
      global.completed += row.completed;
      global.failed += row.failed;
      global.rejected += row.rejected;
      global.waitingHuman += row.waitingHuman;
      global.totalDurationMs = (global.totalDurationMs || 0) + row.totalDurationMs;
    }

    global.successRate = global.total > 0
      ? Math.round((global.completed / global.total) * 100 * 10) / 10
      : 0;
    global.averageDurationMs = global.total > 0
      ? Math.round(global.totalDurationMs / global.total)
      : 0;

    return { byType, global };
  }

  private startSnapshotScheduler(): void {
    const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

    this.snapshotInterval = setInterval(async () => {
      try {
        await this.persistSnapshot();
      } catch (error) {
        console.error('[ArchiveService] Failed to persist KPI snapshot:', error);
      }
    }, SNAPSHOT_INTERVAL_MS);
  }

  async persistSnapshot(): Promise<void> {
    console.log('[ArchiveService] KPI snapshots stored directly in DB, no separate persistence needed');
  }

  async getHistory(type: string, hours: number = 24): Promise<any[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const results = await prisma.$queryRaw<any[]>`
      SELECT 
        "workflowType",
        AVG(total) as "avgTotal",
        AVG(completed) as "avgCompleted",
        AVG(failed) as "avgFailed",
        AVG("totalDurationMs" / NULLIF(total, 0)) as "avgDuration",
        COUNT(*) as "snapshots"
      FROM "KpiSnapshot"
      WHERE "workflowType" = ${type}
        AND "createdAt" > ${since}
      GROUP BY "workflowType"
    `;

    return results;
  }

  async stop(): Promise<void> {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
    }
  }
}

export const ArchiveService = new ArchiveServiceClass();
