(function(){
  "use strict";
  var recorder=null, chunks=[], startedAt=0, stream=null;
  function pickMime(){
    var list=["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus"];
    for(var i=0;i<list.length;i++) if(window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(list[i])) return list[i];
    return "";
  }
  function stopTracks(){ if(stream){stream.getTracks().forEach(function(t){try{t.stop()}catch(e){}});stream=null;} }
  function toggle(button,onStart,onStop,onError){
    if(recorder && recorder.state==="recording"){
      try{recorder.stop()}catch(e){}
      return;
    }
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ onError("This browser does not support microphone recording."); return; }
    navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}}).then(function(s){
      stream=s;chunks=[];startedAt=Date.now();
      var mime=pickMime();
      recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
      recorder.ondataavailable=function(e){if(e.data&&e.data.size)chunks.push(e.data)};
      recorder.onerror=function(){stopTracks();recorder=null;onError("The microphone recorder failed.");};
      recorder.onstop=function(){
        var r=recorder;recorder=null;stopTracks();
        var blob=new Blob(chunks,{type:(r&&r.mimeType)||mime||"audio/webm"});
        var seconds=Math.max(1,Math.round((Date.now()-startedAt)/1000));
        chunks=[]; if(blob.size)onStop(blob,seconds); else onError("No audio was captured.");
      };
      recorder.start(250); onStart();
    }).catch(function(err){
      var msg=(err&&err.name==="NotAllowedError")?"Microphone permission was denied. Allow microphone access and try again.":"Could not access the microphone.";
      onError(msg);
    });
  }
  window.ZevioRTC={toggle:toggle,isRecording:function(){return !!(recorder&&recorder.state==="recording");}};
})();
