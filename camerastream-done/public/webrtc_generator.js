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

'use strict'

const createOffer = document.querySelector('button#localOfferSet');
const answerButton = document.querySelector('button#remoteOfferGot');
const answerTextBox = document.querySelector('input#remoteOffer');
const offerTextBox = document.querySelector('input#localOffer');
const tokenTextBox = document.querySelector('input#tokenValue');
const submitButton = document.querySelector('button#submit');
const terminateButton = document.querySelector('button#terminateStream');
const vgaButton = document.querySelector('button#vga');
const hdButton = document.querySelector('button#hd');
const fullHDButton = document.querySelector('button#fullhd');
const notificationButton = document.querySelector('button#notification');


var userIdVal;
var wasDisconnected = false;

vgaButton.onclick = () =>{
  establishUserMedia(vgaConstraints);
  hdButton.disabled = true;
  fullHDButton.disabled = true;
  tokenTextBox.disabled = false;
  submit.disabled = false;
}

hdButton.onclick = () =>{
  establishUserMedia(hdConstraints);
  vgaButton.disabled = true;
  fullHDButton.disabled = true;
  tokenTextBox.disabled = false;
  submit.disabled = false;
}

fullHDButton.onclick = () =>{
  establishUserMedia(fullHDConstraints);
  vgaButton.disabled = true;
  hdButton.disabled = true;
  tokenTextBox.disabled = false;
  submit.disabled = false;
}

const vgaConstraints = {
  video: {width: 640, height: 480}  
}

const hdConstraints = {
  video: {width: 1280, height: 720}  
}

const fullHDConstraints = {
  video: {width: 1980, height: 1080} 
}

const firebaseConfig = {
};

firebase.initializeApp(firebaseConfig);
var database = firebase.database();

var localStream,context,source = {};
var peerConnection;

function establishUserMedia(video_constraints){
  navigator.mediaDevices.getUserMedia({
    audio: {echoCancellation: true},
    audio: true, 
    video: video_constraints.video
    
  })
.then(stream =>{
    establishPeerConnection();
    localStream = stream;
    peerConnection.addStream(stream);
    localVideo.srcObject = stream;
    console.log('Local media acquired');
  })
.catch((error) =>{
    console.log('ERROR: ', error);
  })
}

function establishPeerConnection(){
  const config =  {iceServers: [{urls: 'stun:stun.l.google.com:19302'}]};
  peerConnection = new RTCPeerConnection(config);
  
  peerConnection.addEventListener('icecandidate', e => onIceCandidate(peerConnection,e));
  peerConnection.addEventListener('iceconnectionstatechange', e => onIceStateChange(peerConnection,e)); 
  peerConnection.addEventListener('onconnectionstatechange', e => onConnectionStateChange(peerConnection,e));
  peerConnection.addEventListener('track', e => onaddRemoteTrack(e));
}
function onIceCandidate(pc,event){
  var cand = event.candidate;
  if(!cand){
      console.log('local sdp: ', peerConnection.localDescription.sdp);
  }
  console.log(`ICE candidate:\n${cand ? cand.candidate : '(null)'}`);
}

function onConnectionStateChange(pc,event){
  console.log('onConnectionStateChangeEvent',event);
}

function onaddRemoteTrack(e){
    if(remoteVideo.srcObject !== e.streams[0]){
      remoteVideo.srcObject = e.streams[0];
      console.log('received remote stream');
    } 
}

function onIceStateChange(pc,e){
  if(pc){
    console.log('ICE state: ',pc.iceConnectionState);
    console.log('ICE state change event: ', e);
  }
  if(pc.iceConnectionState === 'disconnect'){
    this.wasDisconnected = true;
    var disconnectTimeout = setTimeout(()=>{
      this.closePeerConnection();
    },15000);

  }
  if(pc.iceConnectionState === 'connected'){
    if(wasDisconnected){
      clearTimeout(disconnectTimeout);
      console.log('Disconnect -> Connected');
    }
  }
}

function onSetLocalSuccess() {
  console.log('setLocalDescription complete');
}

function errHandler(err){
  console.log(err);
}

function closePeerConnection(){
  this.peerConnection.close();
  this.peerConnection = null;
  console.log('peerConnection closed');
}

function filterOfferSdp(offer){
  let newSdp = offer.sdp;
  return new RTCSessionDescription({type:'offer',sdp:newSdp});
}

function filterAnswerSdp(answer){
  let newSdp = answer.sdp;
  newSdp = filterSdpVideoCodec(answer.sdp);
  return new RTCSessionDescription({type:'answer',sdp:newSdp});
}


submit.onclick = function(){

  terminateButton.disabled = false;
  submitButton.disabled = true;
  userIdVal = tokenTextBox.value;

  database.ref('/userId/'+ tokenTextBox.value).update({
    type: 'remote'
  })
  var updateOffer = firebase.database().ref('/userId/'+ userIdVal+'/offer');
  updateOffer.on('value', snapshot => {
    if(snapshot != null){
      submitOffer(snapshot);
    }
  })
}

async function submitOffer(snapshot){
  try{
    if(snapshot.val()!= null){
      var _remoteOffer = {
          type:"offer",
          sdp:snapshot.val()
      }
      console.log('remote offer: ', _remoteOffer.sdp);
      document.getElementById("localOffer").value = JSON.stringify(_remoteOffer);
      peerConnection.setRemoteDescription(new RTCSessionDescription(_remoteOffer));
      await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(await peerConnection.createAnswer());


      setTimeout(async () =>{
        database.ref('/userId/'+ userIdVal).update({
          answer: peerConnection.localDescription.sdp
        })
  
        const answer = await database.ref('/userId/'+ userIdVal+ '/answer').once('value');
        document.getElementById("remoteOffer").value = JSON.stringify({
          type:"answer",
          sdp: answer
        });
      },2000);
    }
  }
  catch(error){
      console.log(error.name + ': '+ error.message);
  }
}

function submitAnswer(snapshot){
  if(snapshot.val()!= null && snapshot.val().hasOwnProperty('answer')){
    var _remoteAnswer = {
      type: "answer",
      sdp: snapshot.val()['answer']
    }
    document.getElementById("remoteOffer").value = JSON.stringify(_remoteAnswer);
    console.log('Remote answer: ',_remoteAnswer.sdp);
    peerConnection.setRemoteDescription(_remoteAnswer).then(function() {
      console.log('setRemoteDescription ok');
    }).catch(errHandler); 
  }
}

terminateButton.onclick = function(){
  console.log('Terminating Stream!!')
  var signalingURL = ''; 
  var http = new XMLHttpRequest();

  if(peerConnection.iceConnectionState === 'connected'){
    http.open('POST',signalingURL, true);
    http.setRequestHeader('Content-type', 'application/json');

    http.onreadystatechange = function(){
      if(http.readyState === XMLHttpRequest.DONE && http.status === 200){
        console.log('Closing PeerConnection');
        peerConnection.close();
        terminateButton.disabled = true;
      }
    }
    http.send(JSON.stringify({"action":"end","deviceId":"camera"}));
  
    if(http.status === 200){
      console.log(http.responseText);
    }
  } else{
    location.reload();
  }
}
