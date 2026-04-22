import { Queue, CronRepeatOptions } from "bullmq";
import { DateTime } from "luxon";
import { getRedisConnection } from "../storage/db/redis.ts";

export interface OnboardingJobData {
  cronExpression: string;
  createdAt: string;
}

let onboardingQueue: Queue<OnboardingJobData> | null = null;

export function getOnboardingQueue(): Queue<OnboardingJobData> {
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
  const repeatOptions: CronRepeatOptions = {
    pattern: cronExpression,
  };

  const queue = getOnboardingQueue();
  await queue.upsertJob(
    `onboarding-${cronExpression}`,
    {
      cronExpression,
      createdAt: DateTime.utc().toISO(),
    },
    {
      repeat: repeatOptions,
    }
  );
}