import type { FastifyRequest, FastifyReply } from "fastify";
import { ZodError } from "zod";
import {
  onboardingCronSchema,
  type OnboardingCronSchemaType,
} from "../../../zod/internals.ts";
import { addOnboardingCronJob } from "../../../queues/onboarding.ts";
import {
  createWideEventBuilder,
  generateRequestId,
} from "../../../context/requestContext.ts";
import { logger } from "../../../errors/logger.ts";
import { StorageAdapterFactory } from "../../../factory/index.ts";
import { Metadata } from "../../../events/RawEvents/Metadata.ts";

export async function handleOnboarding(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<{ crons: string[] }> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const body = await request.body;
    const validated = onboardingCronSchema.parse(body);

    const crons: string[] = [];

    for (const cronExpression of validated.crons) {
      await addOnboardingCronJob(cronExpression);
      crons.push(cronExpression);
    }

    const webhookUrl = validated.webhookUrl && validated.webhookUrl !== ""
      ? validated.webhookUrl
      : null;

    const metadataEvent = new Metadata({
      payment_cron: crons.join(","),
      payment_webhook: webhookUrl,
    });

    const adapter = await StorageAdapterFactory.getEventStorageAdapter(
      metadataEvent.type
    );
    await adapter.add(metadataEvent.serialize());

    builder.setSuccess(200).addContext({
      cronCount: crons.length,
    });

    reply.code(201);
    return { crons };
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      builder.setError(400, {
        type: "ValidationError",
        message: issues,
      });
      reply.code(400);
      return { crons: [] };
    }

    const err = error instanceof Error ? error : new Error(String(error));
    builder.setError(500, {
      type: "InternalError",
      message: err.message,
    });
    reply.code(500);
    return { crons: [] };
  } finally {
    logger.emit(builder.build());
  }
}
