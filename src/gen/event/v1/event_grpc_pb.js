// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('grpc');
var event_v1_event_pb = require('../../event/v1/event_pb.js');

function serialize_event_v1_RegisterEventRequest(arg) {
  if (!(arg instanceof event_v1_event_pb.RegisterEventRequest)) {
    throw new Error('Expected argument of type event.v1.RegisterEventRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_event_v1_RegisterEventRequest(buffer_arg) {
  return event_v1_event_pb.RegisterEventRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_event_v1_RegisterEventResponse(arg) {
  if (!(arg instanceof event_v1_event_pb.RegisterEventResponse)) {
    throw new Error('Expected argument of type event.v1.RegisterEventResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_event_v1_RegisterEventResponse(buffer_arg) {
  return event_v1_event_pb.RegisterEventResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_event_v1_StreamEventRequest(arg) {
  if (!(arg instanceof event_v1_event_pb.StreamEventRequest)) {
    throw new Error('Expected argument of type event.v1.StreamEventRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_event_v1_StreamEventRequest(buffer_arg) {
  return event_v1_event_pb.StreamEventRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_event_v1_StreamEventResponse(arg) {
  if (!(arg instanceof event_v1_event_pb.StreamEventResponse)) {
    throw new Error('Expected argument of type event.v1.StreamEventResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_event_v1_StreamEventResponse(buffer_arg) {
  return event_v1_event_pb.StreamEventResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


var EventServiceService = exports.EventServiceService = {
  // RegisterEvent registers an event as being done by a user
registerEvent: {
    path: '/event.v1.EventService/RegisterEvent',
    requestStream: false,
    responseStream: false,
    requestType: event_v1_event_pb.RegisterEventRequest,
    responseType: event_v1_event_pb.RegisterEventResponse,
    requestSerialize: serialize_event_v1_RegisterEventRequest,
    requestDeserialize: deserialize_event_v1_RegisterEventRequest,
    responseSerialize: serialize_event_v1_RegisterEventResponse,
    responseDeserialize: deserialize_event_v1_RegisterEventResponse,
  },
  // StreamEvents streams events from client to server (e.g., AI token usage)
streamEvents: {
    path: '/event.v1.EventService/StreamEvents',
    requestStream: true,
    responseStream: false,
    requestType: event_v1_event_pb.StreamEventRequest,
    responseType: event_v1_event_pb.StreamEventResponse,
    requestSerialize: serialize_event_v1_StreamEventRequest,
    requestDeserialize: deserialize_event_v1_StreamEventRequest,
    responseSerialize: serialize_event_v1_StreamEventResponse,
    responseDeserialize: deserialize_event_v1_StreamEventResponse,
  },
};

exports.EventServiceClient = grpc.makeGenericClientConstructor(EventServiceService, 'EventService');
