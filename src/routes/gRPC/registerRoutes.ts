import type { ConnectRouter } from "@connectrpc/connect";
import { EventService } from "../../gen/event/v1/event_pb.ts";
import { AuthService } from "../../gen/auth/v1/auth_pb.ts";
import { PaymentService } from "../../gen/payment/v1/payment_pb.ts";
import { registerEvent } from "./events/registerEvent.ts";
import { streamEvents } from "./events/streamEvents.ts";
import { createAPIKey } from "./auth/createAPIKey.ts";
import { createCheckoutLink } from "./payment/createCheckoutLink.ts";

export function registerGrpcRoutes(router: ConnectRouter): void {
  router.service(AuthService, {
    createAPIKey,
  });
  
  router.service(EventService, {
    registerEvent,
    streamEvents,
  });

  router.service(PaymentService, {
    createCheckoutLink,
  });
}
