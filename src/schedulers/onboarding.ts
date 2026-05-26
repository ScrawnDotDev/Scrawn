import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { DateTime } from "luxon";
import { logger } from "../errors/logger";
import {
  getMetadata,
  tryClaimWebhookFire,
} from "../storage/db/postgres/helpers/metadata";
import { getPostgresDB } from "../storage/db/postgres/db";

const WEBHOOK_TIMEOUT_MS = 15_000;

export class OnboardingScheduler {
  private tasks: ScheduledTask[] = [];
  private reloading = false;
  private pendingReload = false;

  async start(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    if (this.reloading) {
      this.pendingReload = true;
      return;
    }

    this.reloading = true;

    try {
      const metadata = await getMetadata();

      if (!metadata) {
        return;
      }

      const nextTasks: ScheduledTask[] = [];

      for (const expr of metadata.payment_cron) {
        if (!cron.validate(expr)) {
          logger.lifecycleWarning(
            `[scheduler] Invalid cron expression: ${expr}`
          );
          continue;
        }

        const task = cron.schedule(
          expr,
          () => {
            this.fireWebhook(metadata.id).catch((e) => {
              const err = e instanceof Error ? e : new Error(String(e));
              logger.fatal(`[scheduler] Unhandled error: ${err.message}`, err);
            });
          },
          { timezone: "UTC" }
        );

        nextTasks.push(task);
      }

      this.stop();
      this.tasks = nextTasks;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      logger.fatal(`[scheduler] Reload failed: ${err.message}`, err);
    } finally {
      this.reloading = false;
    }

    if (this.pendingReload) {
      this.pendingReload = false;
      await this.reload();
    }
  }

  private async fireWebhook(metadataId: string): Promise<void> {
    const db = getPostgresDB();

    const webhookUrl = await db.transaction(async (txn) => {
      return tryClaimWebhookFire(txn, metadataId);
    });

    if (!webhookUrl) {
      return;
    }

    const timestamp = DateTime.utc().toISO();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ timestamp }),
        signal: controller.signal,
      });

      if (!response.ok) {
        logger.fatal(
          `[scheduler] Webhook failed: ${response.status} ${response.statusText} — ${webhookUrl}`
        );
        return;
      }

      logger.lifecycle(`[scheduler] Webhook triggered at ${timestamp}`);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));

      if (err.name === "AbortError") {
        logger.fatal(
          `[scheduler] Webhook timed out after ${WEBHOOK_TIMEOUT_MS}ms — ${webhookUrl}`
        );
        return;
      }

      logger.fatal(
        `[scheduler] Webhook error: ${err.message} — ${webhookUrl}`,
        err
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  stop(): void {
    for (const task of this.tasks) {
      task.stop();
    }
    this.tasks = [];
  }
}

let instance: OnboardingScheduler | null = null;

export function initScheduler(): OnboardingScheduler {
  instance = new OnboardingScheduler();
  return instance;
}

export async function reloadScheduler(): Promise<void> {
  if (instance) {
    await instance.reload();
  }
}
