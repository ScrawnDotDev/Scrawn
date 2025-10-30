import { type UserPayload as UserPayloadBuf } from "../gen/auth/v1/auth_pb";
import { type Message } from "@bufbuild/protobuf";

export type UserPayload = Omit<
  UserPayloadBuf,
  keyof Message<"auth.v1.UserPayload">
> & {
  iat: number;
};
