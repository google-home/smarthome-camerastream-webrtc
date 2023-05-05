/**
 * Copyright 2023 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const functions = require('firebase-functions');
const {smarthome} = require('actions-on-google');
const util = require('util');
const admin = require('firebase-admin');
const _ = require ('underscore');

var allowList = ['https://www.gstatic.com'];
const cors = require('cors')({origin: allowList, credentials:true});
const REDIRECT_PAGE = "<!DOCTYPE html><html lang='en'><head></head><body><h1><%- token %></h1><button onClick='window.location = \"<%- redirect_uri %>?code=<%- token %>&state=<%- state %>\"'>Take me back</button><h2>Please make a note of this token</h2></body></html>";

admin.initializeApp();
const firebaseRef = admin.database();

exports.faketoken = functions.https.onRequest((request, response) => {
  response.set('Access-Control-Allow-Origin', '*');
  console.log('faketoken request header',request.headers);
  console.log('faketoken request body',request.body);
  const grantType = request.query.grant_type
    ? request.query.grant_type : request.body.grant_type;
  const secondsInDay = 86400;
  const HTTP_STATUS_OK = 200;
  console.log(`Grant type ${grantType}`);
  let obj;
  if (grantType === 'authorization_code') {
    obj = {
      token_type: 'bearer',
      access_token: request.body.code,
      refresh_token: '123refresh',
      expires_in: secondsInDay,
    };
  } else if (grantType === 'refresh_token') {
    obj = {
      token_type: 'bearer',
      access_token: request.body.code,
      expires_in: secondsInDay,
    };
  }
  response.status(HTTP_STATUS_OK)
    .json(obj);
});

const app = smarthome();

function randomString(length, chars) {
  var result = '';
  for (var i = length; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

exports.fakeauth = functions.https.onRequest((request, response) => {
  response.set('Access-Control-Allow-Origin', '*');

  var token = randomString(5,'0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');
  
  console.log('fakeAuth request header:',request.headers);
  console.log('fakeAuth request body :',request.body);
  console.log('redirect uri:' + request.query.redirect_uri);
  
  var template = _.template(REDIRECT_PAGE);
  
  return response.send(template({
    token: token,
    redirect_uri: decodeURIComponent(request.query.redirect_uri),
    state: request.query.state
  }));
});

exports.signaling = functions.https.onRequest(async (request, response) => {
  cors(request, response,  () => {
    response.set('Access-Control-Allow-Credentials', true);
    console.log('request headers',request.headers);
    console.log('request body',request.body);
    console.log('request body action',request.body.action);
    var databasePath = '/userId/'+ request.query.token;
  try{
    if(request.body.action === 'offer'){
      console.log('databasePath: ', databasePath);
      firebaseRef.ref().child(databasePath).update({
        offer: request.body.sdp,
      })
      var answerObject;
      var answerSdp = firebaseRef.ref(databasePath + '/answer');
      answerSdp.on('value', function(snapshot) {
        if(snapshot.val() != null){
          answerObject = {
            action:'answer',
            sdp: snapshot.val()
          }
          console.log('Answer object: ',answerObject);
          response.set('Access-Control-Allow-Credentials', true);
          response.send(answerObject);
          console.log('response header', response.getHeaders());
        }
      });
  } 
  if(request.body.action === 'answer'){
    console.log('databasePath ',databasePath);
    firebaseRef.ref().child(databasePath).update({
      answer: request.body.sdp,
    })
    response.set('Access-Control-Allow-Credentials', true);
    response.send({});
    console.log('response header',response.getHeaders());
  }
  if(request.body.action === 'end'){
      response.set('Access-Control-Allow-Credentials', true);
      response.send({});
      console.log('response header',response.getHeaders());
    }
  }
  catch(error){
    console.log(error);
  }
  })
})

app.onSync((body) => {
  return {
    requestId: body.requestId,
    payload: {
      agentUserId: '123',
      devices: [{
        id: 'camera',
        type: 'action.devices.types.CAMERA',
        traits: [
          'action.devices.traits.OnOff',
          'action.devices.traits.CameraStream'
        ],
        name: {
          defaultNames: ['WebRTC Camera'],
          name: 'WebRTC Camera',
          nicknames: ['WebRTC Camera'],
        },
        deviceInfo: {
          manufacturer: 'Acme Co',
          model: 'acme-camera',
          hwVersion: '0.1',
          swVersion: '0.1',
        },
        willReportState: false,
        roomHint: 'living room',
        attributes: {
          cameraStreamSupportedProtocols: ['webrtc'],
          cameraStreamNeedAuthToken: true
        },
      }],
    },
  };
});

app.onQuery(async (body) => {
  return {
    requestId: body.requestId,
    payload: {
      devices: {
        '123':{
          on: true,
          online: true, 
        }
      }
      
    },
  };
});

app.onExecute(async (body,headers) => {
  var array = headers.authorization.split(' ');
  var snapshot = await firebaseRef.ref('/userId/'+ array[1]).once('value');
  var offerGenLocation = snapshot.val().type;
  const {requestId} = body;

  var result = {
    status: 'SUCCESS',
    states: {
      cameraStreamProtocol: 'webrtc',
      cameraStreamSignalingUrl:'/signaling?token='+array[1],
      cameraStreamIceServers: '',
      cameraStreamOffer:'',
      cameraStreamAuthToken:'',
    },
    ids: [ 
      'camera'
    ],
  };
  
  return {
    requestId: requestId,
    payload: {
      commands: [result],
    },
  };
});

app.onDisconnect((body, headers) =>{
  functions.logger.log('User account unlinked form Google Assistant');
  return{};
});

exports.smarthome = functions.https.onRequest(app);