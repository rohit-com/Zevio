(function(){
  "use strict";
  var unsubGroups=null, activeGroupId=null, unsubGroup=null, unsubMessages=null;
  var EMOJIS=["😀","😁","😂","🤣","😊","😍","😘","😜","🤔","😎","😭","😢","😅","🙃","😇","🥳","😴","🤗","🙄","😏","👍","👎","👏","🙏","🙌","💪","✌️","🤝","👋","🫶","❤️","🧡","💛","💚","💙","💜","🖤","🤍","💯","🔥","✨","🎉","🎂","☕","🍕","🍔","🍿","🎵","⚽","🏏","📌","✅","❌","⏰","📷","🎮","🚗","🌙","☀️","🌧️"];
  function esc(v){return window.ZEVIO.esc?window.ZEVIO.esc(v):(v==null?"":String(v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]}));}
  function me(){return window.ZEVIO.getMe&&window.ZEVIO.getMe();}
  function db(){return window.ZEVIO.db;}
  function storage(){return window.ZEVIO.storage;}
  function dn(p){return (p&&(p.name||p.username))||"User";}
  function mount(){
    var m=me(), list=document.getElementById("listEl");
    if(!m||!list) return;
    if(unsubGroups){unsubGroups();unsubGroups=null;}
    var old=document.getElementById("groupSection"); if(old) old.remove();
    var section=document.createElement("section");section.id="groupSection";section.className="group-section";
    section.innerHTML='<div class="group-head"><span>Groups</span><button class="group-add-btn" id="newGroupBtn" title="New group">+</button></div><div class="group-list" id="groupList"><div class="group-empty">No groups yet</div></div>';
    list.parentNode.insertBefore(section,list);
    document.getElementById("newGroupBtn").addEventListener("click",openCreate);
    unsubGroups=db().collection("groups").where("members","array-contains",m.uid).onSnapshot(function(snap){
      var groups=[];snap.forEach(function(d){var g=d.data();g.id=d.id;groups.push(g);});
      groups.sort(function(a,b){var aa=a.lastTime&&a.lastTime.toMillis?a.lastTime.toMillis():(a.lastTime||0),bb=b.lastTime&&b.lastTime.toMillis?b.lastTime.toMillis():(b.lastTime||0);return bb-aa;});
      drawGroups(groups);
    },function(){drawGroups([],"Could not load groups. Check Firestore rules.");});
  }
  function drawGroups(groups,error){
    var el=document.getElementById("groupList");if(!el)return;
    if(error){el.innerHTML='<div class="group-empty bad">'+esc(error)+'</div>';return;}
    if(!groups.length){el.innerHTML='<div class="group-empty">Create a group and add people by username.</div>';return;}
    el.innerHTML=groups.map(function(g){var unread=(g.unread&&g.unread[me().uid])||0;return '<button class="group-item" data-gid="'+esc(g.id)+'"><span class="group-avatar">'+esc((g.title||"G").trim().slice(0,2).toUpperCase())+'</span><span class="group-copy"><b>'+esc(g.title||"Group")+'</b><small>'+esc(g.lastMessage||((g.members||[]).length)+" members")+'</small></span>'+(unread?'<span class="unread-count">'+(unread>9?"9+":unread)+'</span>':'')+'</button>';}).join("");
    el.querySelectorAll(".group-item").forEach(function(btn){btn.addEventListener("click",function(){openGroup(this.getAttribute("data-gid"));});});
  }
  function openCreate(){
    var old=document.getElementById("groupModal");if(old)old.remove();
    var ov=document.createElement("div");ov.id="groupModal";ov.className="settings-overlay";
    ov.innerHTML='<div class="settings-modal group-modal"><div class="settings-head"><div><div class="settings-title">Create group</div><div class="settings-sub">Add members by username. Your own account is included automatically.</div></div><button class="settings-close" id="groupClose">✕</button></div><label class="auth-form-label">Group name</label><input id="groupTitle" class="field" maxlength="50" placeholder="Weekend squad"><label class="auth-form-label">Member usernames</label><input id="groupMembers" class="field" placeholder="rahul, priya, alex"><div class="hint">Use commas or spaces. The @ symbol is optional.</div><div class="error-text" id="groupErr"></div><button class="btn primary" id="groupCreate" style="width:100%;margin-top:10px">Create group</button></div>';
    document.body.appendChild(ov);requestAnimationFrame(function(){ov.classList.add("open")});
    var close=function(){ov.classList.remove("open");setTimeout(function(){if(ov.parentNode)ov.remove()},140)};
    document.getElementById("groupClose").addEventListener("click",close);ov.addEventListener("click",function(e){if(e.target===ov)close()});
    document.getElementById("groupCreate").addEventListener("click",function(){createGroup(close)});
  }
  async function createGroup(close){
    var m=me(),title=(document.getElementById("groupTitle").value||"").trim().slice(0,50),raw=(document.getElementById("groupMembers").value||"").trim();
    var err=document.getElementById("groupErr");err.textContent="";
    if(!title)return err.textContent="Enter a group name.";
    var names=raw.split(/[\s,]+/).map(function(x){return x.replace(/^@/,"").trim().toLowerCase()}).filter(Boolean);
    var unique={};names.forEach(function(x){if(x)unique[x]=1});names=Object.keys(unique);
    if(!names.length)return err.textContent="Add at least one other username.";
    if(names.indexOf((m.username||"").toLowerCase())>=0)return err.textContent="You are already added automatically.";
    var members=[m.uid],namesByUid={};namesByUid[m.uid]=dn(m),usernamesByUid={};usernamesByUid[m.uid]=m.username;
    try{
      for(var i=0;i<names.length;i++){
        var ud=await db().collection("usernames").doc(names[i]).get();
        if(!ud.exists)throw new Error("Username @"+names[i]+" was not found.");
        var uid=ud.data().uid;
        if(members.indexOf(uid)>=0)continue;
        var pd=await db().collection("users").doc(uid).get();var p=pd.exists?pd.data():{username:names[i]};
        members.push(uid);namesByUid[uid]=dn(p);usernamesByUid[uid]=p.username||names[i];
      }
      var unread={},muted={};members.forEach(function(uid){unread[uid]=0;muted[uid]=false;});
      await db().collection("groups").add({type:"group",title:title,members:members,names:namesByUid,usernames:usernamesByUid,createdBy:m.uid,createdAt:firebase.firestore.FieldValue.serverTimestamp(),unread:unread,muted:muted,lastMessage:"",lastTime:null,lastFrom:null});
      close();
    }catch(e){err.textContent=e.message||"Could not create group.";}
  }
  function openGroup(groupId){
    activeGroupId=groupId;var main=document.getElementById("mainEl"),app=document.getElementById("appView");if(!main||!app)return;app.classList.add("chat-open");
    if(unsubGroup)unsubGroup();if(unsubMessages)unsubMessages();
    var ref=db().collection("groups").doc(groupId), data={};
    main.innerHTML='<div class="thread-head"><button class="back-btn" id="groupBack" aria-label="Back">‹</button><div class="group-thread-avatar" id="groupThreadAvatar">G</div><div style="min-width:0;flex:1"><div class="thread-name" id="groupThreadTitle">Group</div><div class="thread-sub" id="groupThreadSub"></div></div><button class="icon-sq" id="groupInfoBtn" aria-label="Group info">i</button></div><div class="messages" id="groupMsgs"></div><div class="composer"><div class="emoji-panel" id="groupEmojiPanel"></div><button class="emoji-btn" id="groupEmojiBtn" aria-label="Emoji">😊</button><div class="attach-btn" aria-label="Send photo"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M3 15l5-5 4 4 2-2 7 7"/></svg><input type="file" id="groupImgInput" accept="image/*"></div><button class="voice-btn" id="groupVoiceBtn" type="button" aria-label="Voice message"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg></button><textarea class="msg-input" id="groupInput" rows="1" placeholder="Message group"></textarea><button class="send-circle" id="groupSend" disabled aria-label="Send">➤</button></div>';
    document.getElementById("groupBack").addEventListener("click",closeGroup);document.getElementById("groupInfoBtn").addEventListener("click",function(){showInfo(data)});
    var input=document.getElementById("groupInput"),send=document.getElementById("groupSend"),emojiBtn=document.getElementById("groupEmojiBtn"),emoji=document.getElementById("groupEmojiPanel");
    emoji.innerHTML=EMOJIS.map(function(x){return '<button type="button">'+x+'</button>';}).join("");emoji.querySelectorAll("button").forEach(function(b){b.addEventListener("click",function(){var a=input.selectionStart||input.value.length,c=input.selectionEnd||input.value.length;input.value=input.value.slice(0,a)+this.textContent+input.value.slice(c);input.focus();send.disabled=!input.value.trim();emoji.classList.remove("open")})});
    emojiBtn.addEventListener("click",function(e){e.stopPropagation();emoji.classList.toggle("open")});document.addEventListener("click",function(e){if(!emoji.contains(e.target)&&e.target!==emojiBtn)emoji.classList.remove("open")},{once:false});
    input.addEventListener("input",function(){send.disabled=!input.value.trim();});input.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send.click()}});
    send.addEventListener("click",function(){var text=input.value.trim();if(!text)return;sendGroupMessage(ref,data,{type:"text",text:text},text);input.value="";send.disabled=true});
    document.getElementById("groupImgInput").addEventListener("change",function(e){var f=e.target.files[0];if(!f)return;var mid=ref.collection("messages").doc();var safe=f.name.replace(/[^a-zA-Z0-9._-]/g,"_");storage().ref("groupMedia/"+groupId+"/"+me().uid+"/"+mid.id+"_"+safe).put(f,{contentType:f.type}).then(function(s){return s.ref.getDownloadURL()}).then(function(url){return sendGroupMessage(ref,data,{type:"image",mediaUrl:url,text:""},"📷 Photo",mid)}).catch(function(e){alert(e.message)});e.target.value=""});
    var vbtn=document.getElementById("groupVoiceBtn");if(window.ZevioRTC)vbtn.addEventListener("click",function(){window.ZevioRTC.toggle(vbtn,function(){vbtn.classList.add("recording")},function(blob){vbtn.classList.remove("recording");var mid=ref.collection("messages").doc();return storage().ref("groupMedia/"+groupId+"/"+me().uid+"/"+mid.id+"_voice.webm").put(blob,{contentType:blob.type||"audio/webm"}).then(function(s){return s.ref.getDownloadURL()}).then(function(url){return sendGroupMessage(ref,data,{type:"audio",audioUrl:url,text:""},"🎙️ Voice message",mid)})},function(msg){vbtn.classList.remove("recording");alert(msg)})});
    unsubGroup=ref.onSnapshot(function(s){if(!s.exists){closeGroup();return}data=s.data();document.getElementById("groupThreadTitle").textContent=data.title||"Group";document.getElementById("groupThreadAvatar").textContent=(data.title||"G").slice(0,2).toUpperCase();document.getElementById("groupThreadSub").textContent=(data.members||[]).length+" members";var u=(data.unread&&data.unread[me().uid])||0;if(u)ref.update({unread:Object.assign({},data.unread||{},(function(){var x={};x[me().uid]=0;return x})())}).catch(function(){});showInfoBadge(data)},function(e){document.getElementById("groupMsgs").innerHTML='<div class="error-text">'+esc(e.message)+'</div>'});
    unsubMessages=ref.collection("messages").orderBy("time").limitToLast(300).onSnapshot(function(s){var arr=[];s.forEach(function(d){var x=d.data();x._id=d.id;arr.push(x)});renderGroupMessages(arr)},function(e){document.getElementById("groupMsgs").innerHTML='<div class="error-text">'+esc(e.message)+'</div>'});
    function renderGroupMessages(arr){var box=document.getElementById("groupMsgs");if(!box)return;var old=box.scrollTop,near=box.scrollHeight-box.scrollTop-box.clientHeight<140,html="",last=null;arr.forEach(function(m){var t=m.time&&m.time.toMillis?m.time.toMillis():(m.time||Date.now()),day=new Date(t).toDateString();if(day!==last){html+='<div class="day-divider">'+new Date(t).toLocaleDateString([], {month:"long",day:"numeric"})+'</div>';last=day;}var mine=m.from===me().uid, sender=(data.names&&data.names[m.from])||"Member",url=m.mediaUrl||m.image||"";var body=m.deleted?'<i>Message unsent</i>':m.type==="image"&&url?'<div class="media-msg"><button class="image-view-btn" data-url="'+esc(url)+'"><img class="img-msg" src="'+esc(url)+'" alt="photo"></button><button class="media-download" data-url="'+esc(url)+'" data-name="zevio-group-photo.jpg">Download</button></div>':m.type==="audio"&&m.audioUrl?'<div class="audio-msg"><audio controls preload="metadata" src="'+esc(m.audioUrl)+'"></audio><button class="media-download" data-url="'+esc(m.audioUrl)+'" data-name="zevio-group-voice.webm">Download</button></div>':esc(m.text||"");html+='<div class="msg-block '+(mine?'out':'in')+'">'+(!mine?'<div class="group-sender">'+esc(sender)+'</div>':'')+'<div class="msg-row-wrap"><div class="bubble-wrap"><div class="bubble">'+body+'</div></div></div><div class="msg-time">'+new Date(t).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})+'</div></div>'});if(!arr.length)html='<div class="empty-chip">No messages yet — say hello 👋</div>';box.innerHTML=html;if(near)box.scrollTop=box.scrollHeight;else box.scrollTop=old;box.querySelectorAll(".image-view-btn").forEach(function(b){b.addEventListener("click",function(){window.ZEVIO.openImageViewer(this.getAttribute("data-url"))})});box.querySelectorAll(".media-download").forEach(function(b){b.addEventListener("click",function(){window.ZEVIO.downloadMedia(this.getAttribute("data-url"),this.getAttribute("data-name"))})});}
  }
  function sendGroupMessage(ref,data,payload,preview,suppliedRef){
    var m=me(),messageRef=suppliedRef||ref.collection("messages").doc();payload=payload||{};payload.from=m.uid;payload.time=firebase.firestore.FieldValue.serverTimestamp();payload.reactions={};
    return ref.get().then(function(s){var g=s.data()||data||{},unread=Object.assign({},g.unread||{});(g.members||[]).forEach(function(uid){if(uid!==m.uid)unread[uid]=(unread[uid]||0)+1});return ref.set({lastMessage:preview,lastTime:firebase.firestore.FieldValue.serverTimestamp(),lastFrom:m.uid,unread:unread},{merge:true}).then(function(){return messageRef.set(payload)})});
  }
  function closeGroup(){activeGroupId=null;if(unsubGroup){unsubGroup();unsubGroup=null}if(unsubMessages){unsubMessages();unsubMessages=null}var app=document.getElementById("appView"),main=document.getElementById("mainEl");if(app)app.classList.remove("chat-open");if(main)main.innerHTML='<div class="empty-state"><div class="es-title">Pick a chat</div><div>Search a username above to start a new conversation.</div></div>';}
  function stopOnly(){activeGroupId=null;if(unsubGroup){unsubGroup();unsubGroup=null}if(unsubMessages){unsubMessages();unsubMessages=null}}
  function showInfo(data){if(!data)return;var list=(data.members||[]).map(function(uid){return '<li>'+esc((data.names&&data.names[uid])||"Member")+' <span>'+esc((data.usernames&&data.usernames[uid])||"")+'</span></li>'}).join("");var old=document.getElementById("groupInfo");if(old)old.remove();var ov=document.createElement("div");ov.id="groupInfo";ov.className="settings-overlay";ov.innerHTML='<div class="settings-modal group-modal"><div class="settings-head"><div class="settings-title">'+esc(data.title||"Group")+'</div><button class="settings-close" id="groupInfoClose">✕</button></div><div class="settings-section"><h3>Members</h3><ul class="group-members">'+list+'</ul></div></div>';document.body.appendChild(ov);requestAnimationFrame(function(){ov.classList.add("open")});document.getElementById("groupInfoClose").addEventListener("click",function(){ov.remove()});}
  function showInfoBadge(){/* intentionally lightweight; members are in info */}
  window.ZevioGroups={mount:mount,close:closeGroup,stop:stopOnly};
})();
