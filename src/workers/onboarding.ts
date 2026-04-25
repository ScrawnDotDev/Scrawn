import { Worker, Job } from "bullmq";
import { DateTime } from "luxon";
import { getRedisConnection } from "../storage/db/redis.ts";
import { getPostgresDB } from "../storage/db/postgres/db.ts";
import { metadataTable } from "../storage/db/postgres/schema.ts";
import { logger } from "../errors/logger.ts";

export class OnboardingWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      "onboarding",
      async (job: Job) => {
        await this.processJob(job);
      },
      {
        connection: getRedisConnection(),
        concurrency: 1,
      }
    );
  }

  private async processJob(job: Job): Promise<void> {
    const db = getPostgresDB();
    const [metadata] = await db.select().from(metadataTable).limit(1);

    if (!metadata) {
      logger.lifecycle("[onboarding] No metadata found, skipping");
      return;
    }

    if (!metadata.payment_webhook) {
      logger.lifecycle("[onboarding] No webhook configured, skipping");
      return;
    }

    const timestamp = DateTime.utc().toISO();

    try {
      const response = await fetch(metadata.payment_webhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ timestamp }),
      });

      if (!response.ok) {
        logger.fatal(
          `[onboarding] Webhook failed: ${response.status} ${response.statusText}`
        );
        return;
      }

      logger.lifecycle(`[onboarding] Webhook triggered at ${timestamp}`);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      logger.fatal(`[onboarding] Webhook error: ${err.message}`, err);
    }
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}
