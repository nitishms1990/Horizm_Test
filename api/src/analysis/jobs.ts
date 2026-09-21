/**
 * Analysis jobs.
 *
 * Reading an image takes the better part of a minute, and a browser will not hold a
 * request open that long — it gives up, the user sees a failure, and the work completes
 * anyway. So the upload starts a job and returns at once; the page watches it.
 *
 * In memory is the right size for a pilot: one process, jobs that live for seconds. The
 * production version puts this in a queue (BullMQ, or a jobs table) so it survives a
 * restart and can run on more than one worker.
 */
import { randomUUID } from "node:crypto";

export type JobEvent =
  | { type: "status"; message: string }
  | { type: "done"; postId: string; detections: number; scene: string; ms: number }
  | { type: "error"; message: string };

type Job = {
  id: string;
  orgId: string;
  events: JobEvent[];
  finished: boolean;
  listeners: Set<(event: JobEvent) => void>;
  startedAt: number;
};

const jobs = new Map<string, Job>();
const KEEP_MS = 10 * 60 * 1000;

export function createJob(orgId: string): Job {
  const job: Job = { id: randomUUID(), orgId, events: [], finished: false, listeners: new Set(), startedAt: Date.now() };
  jobs.set(job.id, job);

  // Jobs are short-lived; drop them once nobody could reasonably still be watching.
  setTimeout(() => jobs.delete(job.id), KEEP_MS).unref?.();
  return job;
}

/** Only the club that started a job can see it. */
export function getJob(id: string, orgId: string): Job | null {
  const job = jobs.get(id);
  return job && job.orgId === orgId ? job : null;
}

export function pushEvent(job: Job, event: JobEvent) {
  job.events.push(event);
  if (event.type === "done" || event.type === "error") job.finished = true;
  for (const listener of job.listeners) listener(event);
}

/**
 * Replays what has already happened, then streams the rest.
 *
 * The event list is the single source: the listener only wakes the loop, so a watcher
 * that attaches mid-job sees each event exactly once.
 */
export async function* watchJob(job: Job): AsyncGenerator<JobEvent> {
  let index = 0;
  let wake: (() => void) | null = null;

  const listener = () => {
    wake?.();
    wake = null;
  };
  job.listeners.add(listener);

  try {
    while (true) {
      while (index < job.events.length) {
        const event = job.events[index++];
        yield event;
        if (event.type === "done" || event.type === "error") return;
      }
      if (job.finished) return;
      await new Promise<void>((resolve) => (wake = resolve));
    }
  } finally {
    job.listeners.delete(listener);
  }
}
