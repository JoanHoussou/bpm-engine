import { prisma } from '../../services/PrismaService.js';
import { toJsonValue } from '../../core/JsonValue.js';

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

export interface ReplayOptions {
  fromStep?: string;
  useOriginalPayload?: boolean;
}

export interface ReplayResult {
  success: boolean;
  newExecutionId: string | null;
  message: string;
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

  async getExecutionForReplay(executionId: string): Promise<{
    type: string;
    payload: Record<string, unknown>;
    context: Record<string, unknown>;
    events: any[];
  } | null> {
    const execution = await prisma.workflowExecution.findUnique({
      where: { id: executionId },
    });

    if (!execution) {
      return null;
    }

    const events = await prisma.workflowEvent.findMany({
      where: { executionId },
      orderBy: { timestamp: 'asc' },
    });

    return {
      type: execution.type,
      payload: execution.payload as Record<string, unknown>,
      context: execution.context as Record<string, unknown>,
      events: events.map(e => ({
        type: e.eventType,
        step: e.stepName,
        data: e.data,
        timestamp: e.timestamp,
      })),
    };
  }

  async replayExecution(
    originalExecutionId: string,
    options: ReplayOptions = {}
  ): Promise<ReplayResult> {
    const { fromStep, useOriginalPayload = true } = options;

    const replayData = await this.getExecutionForReplay(originalExecutionId);
    if (!replayData) {
      return {
        success: false,
        newExecutionId: null,
        message: `Original execution ${originalExecutionId} not found`,
      };
    }

    // Get the original execution to copy clientId and traceId
    const originalExecution = await prisma.workflowExecution.findUnique({
      where: { id: originalExecutionId },
    });

    if (!originalExecution) {
      return {
        success: false,
        newExecutionId: null,
        message: `Original execution ${originalExecutionId} not found`,
      };
    }

    const { v4: uuidv4 } = await import('uuid');
    const newExecutionId = uuidv4();
    const newTraceId = uuidv4();

    let payload = replayData.payload;
    let startFromStep = 0;

    if (!useOriginalPayload) {
      return {
        success: false,
        newExecutionId: null,
        message: 'Custom payload replay not yet implemented',
      };
    }

    if (fromStep) {
      const stepIndex = replayData.events.findIndex(
        (e: any) => e.step === fromStep && e.type === 'STEP_STARTED'
      );
      if (stepIndex === -1) {
        return {
          success: false,
          newExecutionId: null,
          message: `Step ${fromStep} not found in original execution`,
        };
      }

      payload = this.rebuildPayloadFromEvents(replayData.events, stepIndex);
      startFromStep = stepIndex + 1;
    }

    // First create the new execution in the database
    try {
      await prisma.workflowExecution.create({
        data: {
          id: newExecutionId,
          traceId: newTraceId,
          type: replayData.type,
          clientId: originalExecution.clientId,
          status: 'RUNNING',
          payload: payload as any,
          context: {} as any,
        },
      });
    } catch (err) {
      console.error('Failed to create execution for replay:', err);
      return {
        success: false,
        newExecutionId: null,
        message: 'Failed to create execution record',
      };
    }

    await this.writeEvent(
      newExecutionId,
      'REPLAY_INITIATED',
      null,
      {
        originalExecutionId,
        fromStep,
        startFromStep,
        timestamp: new Date().toISOString(),
      }
    );

    return {
      success: true,
      newExecutionId,
      message: `Replay initiated. New execution: ${newExecutionId}. Use POST /api/v1/workflow/execute with the original payload to run.`,
    };
  }

  private rebuildPayloadFromEvents(events: any[], upToStepIndex: number): Record<string, unknown> {
    const replayPayload: Record<string, unknown> = {};

    for (let i = 0; i <= upToStepIndex; i++) {
      const event = events[i];
      if (event.data && event.data.payload) {
        Object.assign(replayPayload, event.data.payload);
      }
    }

    return replayPayload;
  }

  async getReplayableExecutions(filters: {
    type?: string;
    status?: string;
    limit?: number;
  } = {}): Promise<any[]> {
    const { type, status, limit = 50 } = filters;

    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;

    const executions = await prisma.workflowExecution.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        status: true,
        createdAt: true,
        completedAt: true,
        payload: true,
      },
    });

    return executions.map(e => ({
      execution_id: e.id,
      type: e.type,
      status: e.status,
      created_at: e.createdAt?.toISOString(),
      completed_at: e.completedAt?.toISOString(),
      can_replay: e.status !== 'COMPLETED' && e.status !== 'RUNNING',
    }));
  }

  async getExecutionTimeline(executionId: string): Promise<any[]> {
    const events = await prisma.workflowEvent.findMany({
      where: { executionId },
      orderBy: { timestamp: 'asc' },
    });

    return events.map(e => ({
      id: e.id,
      step: e.stepName,
      type: e.eventType,
      data: e.data,
      timestamp: e.timestamp.toISOString(),
    }));
  }

  async stop(): Promise<void> {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
    }
  }
}

export const ArchiveService = new ArchiveServiceClass();
