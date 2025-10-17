import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { ElizaService } from "./gen/eliza_pb.js";

const client = createClient(
  ElizaService,
  createConnectTransport({
    httpVersion: "2",
    baseUrl: "http://localhost:8000",
  })
);

try {
  const res = await client.say({sentence: "Hello, world!"})
  console.log(res.sentence)
} catch (err) {
  console.error(err);
}