import { Queue, type RepeatOptions } from "bullmq";
import { DateTime } from "luxon";
import { getRedisConnection } from "../storage/db/redis.ts";

interface OnboardingJobData {
  cronExpression: string;
  createdAt: string;
}

let onboardingQueue: Queue<OnboardingJobData> | null = null;

function getOnboardingQueue(): Queue<OnboardingJobData> {
  if (!onboardingQueue) {
    onboardingQueue = new Queue<OnboardingJobData>("onboarding", {
      connection: getRedisConnection(),
    });
  }
  return onboardingQueue;
}

export async function addOnboardingCronJob(
  cronExpression: string
): Promise<void> {
  const queue = getOnboardingQueue();

  const existingJobs = await queue.getRepeatableJobs();
  const jobName = `onboarding-${cronExpression}`;
  const alreadyExists = existingJobs.some((job) => job.name === jobName);

  if (alreadyExists) {
    return;
  }

  const repeatOptions: RepeatOptions = {
    pattern: cronExpression,
  };

  await queue.add(
    jobName,
    {
      cronExpression,
      createdAt: DateTime.utc().toISO(),
    },
    {
      repeat: repeatOptions,
    }
  );
}