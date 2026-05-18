import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { getCheckoutUrl } from "../../storage/db/postgres/helpers/sessions";
import { formatZodError } from "../../utils/formatZodError";

const checkoutParamsSchema = z.object({
  sessionId: z.uuid({ message: "Invalid session ID format" }),
});

export async function handleCheckoutRedirect(
  request: FastifyRequest<{ Params: { sessionId: string } }>,
  reply: FastifyReply
): Promise<void> {
  let sessionId: string;
  try {
    const parsed = checkoutParamsSchema.parse(request.params);
    sessionId = parsed.sessionId;
  } catch (error) {
    const formatted = formatZodError(error, (msg) => ({
      type: "ValidationError",
      message: msg,
      name: "ValidationError",
    }));
    reply.code(400);
    return reply.send({ error: formatted.message });
  }

  const checkoutUrl = await getCheckoutUrl(sessionId);

  if (!checkoutUrl) {
    reply.code(404);
    return reply.send({ error: "Checkout session not found" });
  }

  reply.code(302).redirect(checkoutUrl);
}
