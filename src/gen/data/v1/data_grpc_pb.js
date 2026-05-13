// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('@grpc/grpc-js');
var data_v1_data_pb = require('../../data/v1/data_pb.js');

function serialize_data_v1_QueryRequest(arg) {
  if (!(arg instanceof data_v1_data_pb.QueryRequest)) {
    throw new Error('Expected argument of type data.v1.QueryRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_data_v1_QueryRequest(buffer_arg) {
  return data_v1_data_pb.QueryRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_data_v1_QueryResponse(arg) {
  if (!(arg instanceof data_v1_data_pb.QueryResponse)) {
    throw new Error('Expected argument of type data.v1.QueryResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_data_v1_QueryResponse(buffer_arg) {
  return data_v1_data_pb.QueryResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


var DataQueryServiceService = exports.DataQueryServiceService = {
  query: {
    path: '/data.v1.DataQueryService/Query',
    requestStream: false,
    responseStream: false,
    requestType: data_v1_data_pb.QueryRequest,
    responseType: data_v1_data_pb.QueryResponse,
    requestSerialize: serialize_data_v1_QueryRequest,
    requestDeserialize: deserialize_data_v1_QueryRequest,
    responseSerialize: serialize_data_v1_QueryResponse,
    responseDeserialize: deserialize_data_v1_QueryResponse,
  },
};

exports.DataQueryServiceClient = grpc.makeGenericClientConstructor(DataQueryServiceService, 'DataQueryService');
