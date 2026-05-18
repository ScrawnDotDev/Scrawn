// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('grpc');
var payment_v1_payment_pb = require('../../payment/v1/payment_pb.js');

function serialize_payment_v1_CreateCheckoutLinkRequest(arg) {
  if (!(arg instanceof payment_v1_payment_pb.CreateCheckoutLinkRequest)) {
    throw new Error('Expected argument of type payment.v1.CreateCheckoutLinkRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_payment_v1_CreateCheckoutLinkRequest(buffer_arg) {
  return payment_v1_payment_pb.CreateCheckoutLinkRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_payment_v1_CreateCheckoutLinkResponse(arg) {
  if (!(arg instanceof payment_v1_payment_pb.CreateCheckoutLinkResponse)) {
    throw new Error('Expected argument of type payment.v1.CreateCheckoutLinkResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_payment_v1_CreateCheckoutLinkResponse(buffer_arg) {
  return payment_v1_payment_pb.CreateCheckoutLinkResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


var PaymentServiceService = exports.PaymentServiceService = {
  // CreateCheckoutLink creates a checkout link for the given user
createCheckoutLink: {
    path: '/payment.v1.PaymentService/CreateCheckoutLink',
    requestStream: false,
    responseStream: false,
    requestType: payment_v1_payment_pb.CreateCheckoutLinkRequest,
    responseType: payment_v1_payment_pb.CreateCheckoutLinkResponse,
    requestSerialize: serialize_payment_v1_CreateCheckoutLinkRequest,
    requestDeserialize: deserialize_payment_v1_CreateCheckoutLinkRequest,
    responseSerialize: serialize_payment_v1_CreateCheckoutLinkResponse,
    responseDeserialize: deserialize_payment_v1_CreateCheckoutLinkResponse,
  },
};

exports.PaymentServiceClient = grpc.makeGenericClientConstructor(PaymentServiceService, 'PaymentService');
