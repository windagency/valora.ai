# Planning Template: Background Job/Worker

## Pattern Type: Background Processing

**Use when**: Adding async tasks, scheduled jobs, queue processing, or long-running operations.

---

## Quick Fill Template

### 1. Job Overview

| Field | Value |
|-------|-------|
| **Job Name** | [e.g., EmailSender, ReportGenerator, DataSync] |
| **Type** | [ ] Queue-based [ ] Scheduled [ ] Event-driven |
| **Queue System** | [ ] BullMQ [ ] Agenda [ ] Custom |
| **Trigger** | [ ] API call [ ] Cron [ ] Event [ ] Webhook |
| **Retry Policy** | [ ] None [ ] Fixed [ ] Exponential |

### 2. Job Configuration

| Field | Value |
|-------|-------|
| Max Retries | [e.g., 3] |
| Retry Delay | [e.g., exponential: 1s, 5s, 30s] |
| Timeout | [e.g., 5 minutes] |
| Concurrency | [e.g., 5 workers] |
| Priority | [e.g., normal/high/low] |

### 3. Files to Create

| File | Action | Purpose |
|------|--------|---------|
| `src/jobs/[job-name].job.ts` | Create | Job definition |
| `src/jobs/[job-name].processor.ts` | Create | Job processing logic |
| `src/queues/[queue-name].queue.ts` | Create | Queue configuration |
| `src/workers/[worker-name].worker.ts` | Create | Worker process |
| `tests/jobs/[job-name].test.ts` | Create | Job tests |

### 4. Standard Implementation Steps

#### Step 1: Define Job Types

**Objective**: Create TypeScript types for job data

**Files**:
- `src/jobs/types/[job-name].types.ts`

```typescript
export interface [JobName]Data {
  // Job payload
  userId: string;
  action: string;
  payload: Record<string, unknown>;
}

export interface [JobName]Result {
  success: boolean;
  processedAt: Date;
  details?: string;
}

export interface [JobName]Options {
  priority?: 'low' | 'normal' | 'high';
  delay?: number;
  attempts?: number;
}
```

**Validation**: Types compile without errors

---

#### Step 2: Create Queue (BullMQ)

**Objective**: Configure queue with Redis connection

**Files**:
- `src/queues/[queue-name].queue.ts`

```typescript
import { Queue } from 'bullmq';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

export const [queueName]Queue = new Queue('[queue-name]', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      age: 24 * 60 * 60, // 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 60 * 60, // 7 days
    },
  },
});
```

**Validation**: Queue connects to Redis

---

#### Step 3: Create Processor

**Objective**: Implement job processing logic

**Files**:
- `src/jobs/[job-name].processor.ts`

```typescript
import { Job } from 'bullmq';
import { logger } from 'src/utils/logger';

export async function process[JobName](job: Job<[JobName]Data>): Promise<[JobName]Result> {
  const { userId, action, payload } = job.data;

  logger.info(`Processing job ${job.id}`, { userId, action });

  try {
    // Job implementation
    const result = await doWork(payload);

    logger.info(`Job ${job.id} completed`, { result });

    return {
      success: true,
      processedAt: new Date(),
      details: result,
    };
  } catch (error) {
    logger.error(`Job ${job.id} failed`, { error });
    throw error; // Will trigger retry
  }
}

// Progress reporting for long jobs
export async function process[JobName]WithProgress(job: Job<[JobName]Data>): Promise<[JobName]Result> {
  const items = await getItems(job.data);
  const total = items.length;

  for (let i = 0; i < total; i++) {
    await processItem(items[i]);
    await job.updateProgress(Math.round((i + 1) / total * 100));
  }

  return { success: true, processedAt: new Date() };
}
```

**Validation**: Processor handles job data correctly

---

#### Step 4: Create Worker

**Objective**: Set up worker process

**Files**:
- `src/workers/[worker-name].worker.ts`

```typescript
import { Worker } from 'bullmq';
import { process[JobName] } from 'src/jobs/[job-name].processor';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

export const [workerName]Worker = new Worker(
  '[queue-name]',
  process[JobName],
  {
    connection,
    concurrency: 5,
    limiter: {
      max: 100,
      duration: 1000, // 100 jobs per second
    },
  }
);

[workerName]Worker.on('completed', (job, result) => {
  logger.info(`Job ${job.id} completed`, { result });
});

[workerName]Worker.on('failed', (job, error) => {
  logger.error(`Job ${job?.id} failed`, { error: error.message });
});

[workerName]Worker.on('error', (error) => {
  logger.error('Worker error', { error });
});
```

**Validation**: Worker starts and processes jobs

---

#### Step 5: Create Job Scheduler (if scheduled)

**Objective**: Add cron-based scheduling

**Files**:
- `src/schedulers/[job-name].scheduler.ts`

```typescript
import { [queueName]Queue } from 'src/queues/[queue-name].queue';

export async function schedule[JobName]() {
  // Remove existing repeatable job
  const repeatableJobs = await [queueName]Queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === '[job-name]') {
      await [queueName]Queue.removeRepeatableByKey(job.key);
    }
  }

  // Add new repeatable job
  await [queueName]Queue.add(
    '[job-name]',
    { /* default data */ },
    {
      repeat: {
        pattern: '0 * * * *', // Every hour
      },
    }
  );
}
```

**Validation**: Job runs on schedule

---

#### Step 6: Add Job API (optional)

**Objective**: Create API to enqueue jobs

**Files**:
- `src/controllers/jobs.controller.ts`

```typescript
export class JobsController {
  async enqueue(req: Request, res: Response) {
    const data = [jobName]Schema.parse(req.body);

    const job = await [queueName]Queue.add('[job-name]', data, {
      priority: data.priority === 'high' ? 1 : 3,
    });

    res.status(202).json({
      jobId: job.id,
      status: 'queued',
    });
  }

  async getStatus(req: Request, res: Response) {
    const { jobId } = req.params;
    const job = await [queueName]Queue.getJob(jobId);

    if (!job) {
      throw new NotFoundError('Job not found');
    }

    const state = await job.getState();
    const progress = job.progress;

    res.json({
      jobId: job.id,
      state,
      progress,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
    });
  }
}
```

**Validation**: Jobs can be enqueued and status checked via API

---

#### Step 7: Write Tests

**Objective**: Add job and worker tests

**Files**:
- `tests/jobs/[job-name].test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('[JobName] Processor', () => {
  it('processes job successfully', async () => {
    const job = createMockJob({ userId: '123', action: 'test' });
    const result = await process[JobName](job);
    expect(result.success).toBe(true);
  });

  it('handles errors and triggers retry', async () => {
    const job = createMockJob({ invalid: true });
    await expect(process[JobName](job)).rejects.toThrow();
  });

  it('reports progress for long jobs', async () => {
    const job = createMockJob({ items: 10 });
    await process[JobName]WithProgress(job);
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });
});
```

**Validation**: `pnpm test:quick` passes

---

### 5. Environment Variables

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
JOB_CONCURRENCY=5
JOB_MAX_RETRIES=3
```

### 6. Standard Dependencies

| Dependency | Purpose | Status |
|------------|---------|--------|
| BullMQ | Job queue | [ ] Available |
| Redis | Queue storage | [ ] Available |
| ioredis | Redis client | [ ] Available |

### 7. Standard Risks

| Risk | Mitigation |
|------|------------|
| Job stuck | Timeout configuration |
| Memory leak | Remove completed jobs |
| Lost jobs | Redis persistence |
| Duplicate processing | Job ID + idempotency |
| Queue backup | Monitor queue depth |

### 8. Monitoring

```typescript
// Queue metrics
const metrics = {
  waiting: await queue.getWaitingCount(),
  active: await queue.getActiveCount(),
  completed: await queue.getCompletedCount(),
  failed: await queue.getFailedCount(),
  delayed: await queue.getDelayedCount(),
};
```

### 9. Rollback

```bash
# Stop workers
pm2 stop [worker-name]

# Clear queue
redis-cli DEL bull:[queue-name]:*

# Revert code
git revert HEAD
```

---

## Estimated Effort

| Step | Points | Confidence |
|------|--------|------------|
| Types | 1 | High |
| Queue Setup | 1 | High |
| Processor | 3 | Medium |
| Worker | 1 | High |
| Scheduler | 1 | High |
| API | 2 | High |
| Tests | 2 | Medium |
| **Total** | **11** | **Medium** |
