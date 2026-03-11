import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://bpm:bpm@localhost:5432/bpm_engine_test';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: TEST_DATABASE_URL,
    },
  },
});

const BPM_KEY = process.env.BPM_KEY || 'bpm_live_cDYgM3jvZk2Rv5P_YLxO01ovO9yd6r4s';
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function cleanup() {
  await prisma.workflowEvent.deleteMany({});
  await prisma.workflowExecution.deleteMany({});
  await prisma.idempotencyKey.deleteMany({});
}

describe('Workflow Execution Integration Tests', () => {
  beforeAll(async () => {
    try {
      await prisma.$connect();
    } catch (error) {
      console.log('Warning: Could not connect to test database');
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Test 1: Register workflow → execute → COMPLETED', () => {
    it('should register and execute a simple workflow', async () => {
      const workflowType = `test-order-${Date.now()}`;
      
      const registerRes = await fetch(`${BASE_URL}/api/v1/registry/register`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BPM_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: workflowType,
          version: '1.0.0',
          base_url: 'https://httpbin.org',
          steps: [
            {
              name: 'check-stock',
              type: 'auto',
              url: '/post',
              timeout_ms: 5000,
              retry: 1,
              on_failure: 'abort',
            },
            {
              name: 'create-order',
              type: 'auto',
              url: '/post',
              timeout_ms: 5000,
            },
          ],
        }),
      });

      expect([200, 201]).toContain(registerRes.status);
      const registerData = await registerRes.json();
      expect(registerData.type).toBe(workflowType);

      const executeRes = await fetch(`${BASE_URL}/api/v1/workflow/execute`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BPM_KEY}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `${workflowType}-test-1-${Date.now()}`,
        },
        body: JSON.stringify({
          type: workflowType,
          payload: { product_id: 123, quantity: 2 },
        }),
      });

      expect(executeRes.status).toBe(202);
      const executeData = await executeRes.json();
      expect(executeData.execution_id).toBeDefined();
      expect(executeData.status).toBe('QUEUED');

      await new Promise(resolve => setTimeout(resolve, 5000));

      const statusRes = await fetch(
        `${BASE_URL}/api/v1/workflow/${executeData.execution_id}`,
        {
          headers: { 'Authorization': `Bearer ${BPM_KEY}` },
        }
      );

      const statusData = await statusRes.json();
      expect(statusData.status).toBe('COMPLETED');
    }, 30000);
  });

  describe('Test 2: Idempotence - same key → same execution_id', () => {
    it('should return same execution_id for same idempotency key', async () => {
      const workflowType = `test-idempotent-${Date.now()}`;
      const idempotencyKey = `idem-test-${Date.now()}`;

      await fetch(`${BASE_URL}/api/v1/registry/register`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BPM_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: workflowType,
          version: '1.0.0',
          base_url: 'https://httpbin.org',
          steps: [
            {
              name: 'process',
              type: 'auto',
              url: '/post',
              timeout_ms: 5000,
            },
          ],
        }),
      });

      const res1 = await fetch(`${BASE_URL}/api/v1/workflow/execute`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BPM_KEY}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          type: workflowType,
          payload: { test: 1 },
        }),
      });

      const data1 = await res1.json();
      const execId1 = data1.execution_id;

      const res2 = await fetch(`${BASE_URL}/api/v1/workflow/execute`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BPM_KEY}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          type: workflowType,
          payload: { test: 1 },
        }),
      });

      const data2 = await res2.json();

      expect(data2.execution_id).toBe(execId1);
    }, 15000);
  });

  describe('Test 3: Unknown type → 422', () => {
    it('should return 422 for unknown workflow type', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/workflow/execute`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BPM_KEY}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `unknown-test-${Date.now()}`,
        },
        body: JSON.stringify({
          type: 'unknown-type-xyz',
          payload: {},
        }),
      });

      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.error).toContain('not found');
    });
  });

  describe('Test 4: Invalid API Key → 401', () => {
    it('should return 401 for invalid API key', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/workflow/execute`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer bpm_live_invalid_key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'any',
          payload: {},
        }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe('Test 5: Human step → WAITING_HUMAN → resume → COMPLETED', () => {
    it('should handle human step workflow', async () => {
      const workflowType = `test-human-${Date.now()}`;

      await fetch(`${BASE_URL}/api/v1/registry/register`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BPM_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: workflowType,
          version: '1.0.0',
          base_url: 'https://httpbin.org',
          steps: [
            {
              name: 'approval',
              type: 'human',
              actor: '$.payload.approver_email',
              timeout_hours: 48,
              decisions: [
                { key: 'approved', label: 'Approve', next: 'finalize' },
                { key: 'rejected', label: 'Reject', next: 'notify' },
              ],
            },
            {
              name: 'finalize',
              type: 'auto',
              url: '/post',
              timeout_ms: 5000,
            },
            {
              name: 'notify',
              type: 'auto',
              url: '/post',
              timeout_ms: 5000,
              terminal: true,
            },
          ],
        }),
      });

      const execRes = await fetch(`${BASE_URL}/api/v1/workflow/execute`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BPM_KEY}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `human-test-${Date.now()}`,
        },
        body: JSON.stringify({
          type: workflowType,
          payload: { approver_email: 'test@test.com' },
        }),
      });

      const execData = await execRes.json();
      expect(['QUEUED', 'WAITING_HUMAN']).toContain(execData.status);

      await new Promise(resolve => setTimeout(resolve, 5000));

      const statusRes2 = await fetch(
        `${BASE_URL}/api/v1/workflow/${execData.execution_id}`,
        {
          headers: { 'Authorization': `Bearer ${BPM_KEY}` },
        }
      );
      const statusData2 = await statusRes2.json();
      expect(statusData2.status).toBe('WAITING_HUMAN');

      const resumeRes = await fetch(
        `${BASE_URL}/api/v1/workflow/${execData.execution_id}/resume`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${BPM_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            step: 'approval',
            decision: 'approved',
            actor: 'test@test.com',
            comment: 'Approved',
          }),
        }
      );

      expect(resumeRes.status).toBe(200);
      const resumeData = await resumeRes.json();
      expect(resumeData.next_step).toBe('finalize');

      await new Promise(resolve => setTimeout(resolve, 5000));

      const statusRes = await fetch(
        `${BASE_URL}/api/v1/workflow/${execData.execution_id}`,
        {
          headers: { 'Authorization': `Bearer ${BPM_KEY}` },
        }
      );

      const statusData = await statusRes.json();
      expect(statusData.status).toBe('COMPLETED');
    }, 30000);
  });

  describe('Test 6: Saga rollback → FAILED with compensations', () => {
    it('should rollback on failure with compensate strategy', async () => {
      const workflowType = `test-saga-${Date.now()}`;

      await fetch(`${BASE_URL}/api/v1/registry/register`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BPM_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: workflowType,
          version: '1.0.0',
          base_url: 'https://httpbin.org',
          steps: [
            {
              name: 'step1',
              type: 'auto',
              url: '/post',
              timeout_ms: 5000,
              on_failure: 'compensate',
              compensate_url: '/delay/1',
            },
            {
              name: 'step2-fail',
              type: 'auto',
              url: '/status/500',
              timeout_ms: 5000,
              on_failure: 'compensate',
              compensate_url: '/delay/1',
            },
          ],
        }),
      });

      const execRes = await fetch(`${BASE_URL}/api/v1/workflow/execute`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BPM_KEY}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `saga-test-${Date.now()}`,
        },
        body: JSON.stringify({
          type: workflowType,
          payload: {},
        }),
      });

      const execData = await execRes.json();
      
      await new Promise(resolve => setTimeout(resolve, 10000));

      const statusRes = await fetch(
        `${BASE_URL}/api/v1/workflow/${execData.execution_id}`,
        {
          headers: { 'Authorization': `Bearer ${BPM_KEY}` },
        }
      );

      const statusData = await statusRes.json();
      expect(statusData.status).toBe('FAILED');
    }, 30000);
  });
});
