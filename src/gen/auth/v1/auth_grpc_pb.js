// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('grpc');
var auth_v1_auth_pb = require('../../auth/v1/auth_pb.js');

function serialize_auth_v1_CreateAPIKeyRequest(arg) {
  if (!(arg instanceof auth_v1_auth_pb.CreateAPIKeyRequest)) {
    throw new Error('Expected argument of type auth.v1.CreateAPIKeyRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_auth_v1_CreateAPIKeyRequest(buffer_arg) {
  return auth_v1_auth_pb.CreateAPIKeyRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_auth_v1_CreateAPIKeyResponse(arg) {
  if (!(arg instanceof auth_v1_auth_pb.CreateAPIKeyResponse)) {
    throw new Error('Expected argument of type auth.v1.CreateAPIKeyResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_auth_v1_CreateAPIKeyResponse(buffer_arg) {
  return auth_v1_auth_pb.CreateAPIKeyResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


var AuthServiceService = exports.AuthServiceService = {
  // CreateAPIKey creates a new API key for the authenticated user
createAPIKey: {
    path: '/auth.v1.AuthService/CreateAPIKey',
    requestStream: false,
    responseStream: false,
    requestType: auth_v1_auth_pb.CreateAPIKeyRequest,
    responseType: auth_v1_auth_pb.CreateAPIKeyResponse,
    requestSerialize: serialize_auth_v1_CreateAPIKeyRequest,
    requestDeserialize: deserialize_auth_v1_CreateAPIKeyRequest,
    responseSerialize: serialize_auth_v1_CreateAPIKeyResponse,
    responseDeserialize: deserialize_auth_v1_CreateAPIKeyResponse,
  },
};

exports.AuthServiceClient = grpc.makeGenericClientConstructor(AuthServiceService, 'AuthService');
