// GENERATED CODE -- DO NOT EDIT!

"use strict";
var grpc = require("@grpc/grpc-js");
var query_v1_query_pb = require("../../query/v1/query_pb.js");

function serialize_query_v1_QueryEventsRequest(arg) {
  if (!(arg instanceof query_v1_query_pb.QueryEventsRequest)) {
    throw new Error("Expected argument of type query.v1.QueryEventsRequest");
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_query_v1_QueryEventsRequest(buffer_arg) {
  return query_v1_query_pb.QueryEventsRequest.deserializeBinary(
    new Uint8Array(buffer_arg)
  );
}

function serialize_query_v1_QueryEventsResponse(arg) {
  if (!(arg instanceof query_v1_query_pb.QueryEventsResponse)) {
    throw new Error("Expected argument of type query.v1.QueryEventsResponse");
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_query_v1_QueryEventsResponse(buffer_arg) {
  return query_v1_query_pb.QueryEventsResponse.deserializeBinary(
    new Uint8Array(buffer_arg)
  );
}

var QueryServiceService = (exports.QueryServiceService = {
  queryEvents: {
    path: "/query.v1.QueryService/QueryEvents",
    requestStream: false,
    responseStream: false,
    requestType: query_v1_query_pb.QueryEventsRequest,
    responseType: query_v1_query_pb.QueryEventsResponse,
    requestSerialize: serialize_query_v1_QueryEventsRequest,
    requestDeserialize: deserialize_query_v1_QueryEventsRequest,
    responseSerialize: serialize_query_v1_QueryEventsResponse,
    responseDeserialize: deserialize_query_v1_QueryEventsResponse,
  },
});

exports.QueryServiceClient = grpc.makeGenericClientConstructor(
  QueryServiceService,
  "QueryService"
);
