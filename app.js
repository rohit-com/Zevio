(function () {

  "use strict";

  // ================= CONFIG =================
  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyBXLyadhd4hEKZBcL_Nz2Sr7CeOj_YiFnE",
    authDomain: "jarvis-18c6c.firebaseapp.com",
    projectId: "jarvis-18c6c",
    storageBucket: "jarvis-18c6c.firebasestorage.app",
    messagingSenderId: "475289485832",
    appId: "1:475289485832:web:42101aabf995bba048c7bd"
  };
  var APP_NAME = "Zevio";
  // New accounts use a real email address so Firebase password recovery works.
  // USER_DOMAIN is kept only for legacy accounts created by older Zevio builds.
  var USER_DOMAIN = "jarvisid.app";
  var PHONE_DOMAIN = "jarvisphone.app";
  // ==========================================

  firebase.initializeApp(FIREBASE_CONFIG);
  var auth = firebase.auth();
  var db = firebase.firestore();
  var storage = firebase.storage();
  var root = document.getElementById("root");

  window.ZEVIO = window.ZEVIO || {};
  window.ZEVIO.db = db;
  window.ZEVIO.auth = auth;
  window.ZEVIO.storage = storage;
  window.ZEVIO.getMe = function(){ return me; };

  var me = null;
  var userCache = {};
  var presenceTimer = null;
  var presenceUid = null;
  var presenceBound = false;
  var suppressBoot = false;      // true while signup is still writing the profile
  var teardownFns = [];          // listeners to remove on sign out / re-render
  var TYPING_TIMEOUT = 2500;
  var PRESENCE_HEARTBEAT_MS = 60000;
  var ONLINE_STALE_MS = 90000;

  function teardown(){
    teardownFns.forEach(function(fn){ try { fn(); } catch(e){} });
    teardownFns = [];
  }

  var EMOJIS = ["😀","😁","😂","🤣","😊","😍","😘","😜","🤔","😎","😭","😢","😅","🙃","😇","🥳","😴","🤗","🙄","😏",
    "👍","👎","👏","🙏","🙌","💪","✌️","🤝","👋","🫶","❤️","🧡","💛","💚","💙","💜","🖤","🤍","💯","🔥",
    "✨","🎉","🎂","☕","🍕","🍔","🍿","🎵","⚽","🏏","📌","✅","❌","⏰","📷","🎮","🚗","🌙","☀️","🌧️"];
  var REACTION_SET = ["❤️","😂","😮","😢","👍","🙏"];
  var SOLID_THEMES = [
    {id:"lilac",name:"Lilac Pop"},{id:"bubblegum",name:"Bubblegum"},{id:"matcha",name:"Matcha"},
    {id:"sky",name:"Baby Blue"},{id:"tangerine",name:"Tangerine"},{id:"cherry",name:"Cherry Cola"}
  ];
  var ANIME_THEMES = [
    {id:"sakura",name:"Sakura Rain"},{id:"tokyo",name:"Tokyo Neon"},{id:"shrine",name:"Moon Shrine"},
    {id:"meadow",name:"Sky Meadow"},{id:"fuji",name:"Fuji Sunrise"},{id:"kawaii",name:"Kawaii Stars"}
  ];
  var THEME_NAMES = {};
  SOLID_THEMES.concat(ANIME_THEMES).forEach(function(t){ THEME_NAMES[t.id] = t.name; });
  var LEGACY_THEMES = { violet:"lilac", ocean:"sky", sunset:"tangerine", mint:"matcha", midnight:"lilac" };
  var LOGO_CHOICES = [
    {id:"nebula",name:"Nebula"},{id:"galaxy",name:"Galaxy"},{id:"planet",name:"Planet"},
    {id:"earth",name:"Earth"},{id:"moon",name:"Moon"},{id:"solar",name:"Solar"},
    {id:"aurora",name:"Aurora"},{id:"quantum",name:"Quantum"},{id:"forest",name:"Forest"},{id:"ocean",name:"Ocean"}
  ];

  // ================= app icon (HD vector mark: bubble + paper plane) =================
  function appLogoSVG(size, gid){
    gid = gid || ("lg" + Math.random().toString(36).slice(2));
    return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" class="lg-a"/><stop offset="1" class="lg-b"/>' +
      '</linearGradient><style>.lg-a{stop-color:var(--accent)}.lg-b{stop-color:var(--accent2)}</style></defs>' +
      '<rect x="6" y="6" width="88" height="76" rx="26" fill="url(#'+gid+')"/>' +
      '<path d="M22 78 Q10 90 4 94 Q12 76 20 70 Z" fill="url(#'+gid+')"/>' +
      '<path d="M30 46 L76 28 L54 78 L45 57 Z" fill="#fff"/>' +
      '<path d="M45 57 L54 78 L61 51 L45 57 Z" fill="#fff" opacity="0.55"/>' +
    '</svg>';
  }
  (function setFavicon(){
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<defs><linearGradient id="fi" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#8B5CF6"/><stop offset="1" stop-color="#EC4899"/>' +
      '</linearGradient></defs>' +
      '<rect x="6" y="6" width="88" height="76" rx="26" fill="url(#fi)"/>' +
      '<path d="M22 78 Q10 90 4 94 Q12 76 20 70 Z" fill="url(#fi)"/>' +
      '<path d="M30 46 L76 28 L54 78 L45 57 Z" fill="#fff"/>' +
      '<path d="M45 57 L54 78 L61 51 L45 57 Z" fill="#fff" opacity="0.55"/>' +
      '</svg>';
    var link = document.createElement("link");
    link.rel = "icon"; link.type = "image/svg+xml";
    link.href = "data:image/svg+xml," + encodeURIComponent(svg);
    document.head.appendChild(link);
  })();

  // ================= small helpers =================
  function esc(s){ var d=document.createElement("div"); d.textContent = s==null?"":s; return d.innerHTML; }
  function truncate(s,n){ s=s||""; return s.length>n ? s.slice(0,n)+"…" : s; }
  function initials(n){ n=(n||"?").trim(); return n.slice(0,2).toUpperCase(); }
  function displayName(p){ return (p && (p.name || p.username)) || "User"; }
  function fmtTime(ts){ return ts ? new Date(ts).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}) : ""; }
  function dayLabel(ts){
    var d=new Date(ts), now=new Date();
    if (d.toDateString()===now.toDateString()) return "Today";
    var y=new Date(now); y.setDate(now.getDate()-1);
    if (d.toDateString()===y.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], {month:"long", day:"numeric"});
  }
  function relativeTime(ts){
    var m=Math.floor(Math.max(0,Date.now()-ts)/60000);
    if (m<1) return "just now";
    if (m<60) return m+"m ago";
    var h=Math.floor(m/60); if (h<24) return h+"h ago";
    return Math.floor(h/24)+"d ago";
  }
  function safeGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function safeSet(k,v){ try { localStorage.setItem(k,v); } catch(e){} }
  function boolPref(key, def){ var v = safeGet(key); if (v===null) return def; return v==="1"; }
  function setBoolPref(key, val){ safeSet(key, val ? "1" : "0"); }
  function applyTheme(t){
    if (LEGACY_THEMES[t]) t = LEGACY_THEMES[t];
    if (!THEME_NAMES[t]) t = "lilac";
    safeSet("Zevio_chat_theme", t);
    safeSet("Zevio_theme", t); // legacy key retained for upgrades; no longer controls the whole app.
    var msgs = document.getElementById("msgsEl");
    if (!msgs) return;
    msgs.setAttribute("data-chat-theme", t);
    // Reuse the existing theme definitions (including the large anime wallpapers)
    // without ever putting the theme on <html>, so the rest of the app is untouched.
    var probe = document.createElement("div");
    probe.className = "theme-preview";
    probe.setAttribute("data-palette", t);
    probe.style.cssText = "position:absolute;left:-99999px;top:-99999px;width:1px;height:1px;pointer-events:none;";
    document.body.appendChild(probe);
    var cs = window.getComputedStyle(probe);
    ["accent","accent2","on-accent","accent-text-l","accent-text-d","chat-bg","bubble-in-bg","bubble-in-text","bubble-in-border","bubble-out-bg","bubble-out-text","bubble-out-border","chip-bg","chip-text","read-tick","wall","wall-size","wall-pos","wall-repeat"].forEach(function(k){
      var v=cs.getPropertyValue("--"+k);
      if(v) msgs.style.setProperty("--"+k,v);
    });
    document.body.removeChild(probe);
  }
  function currentTheme(){ return safeGet("Zevio_chat_theme") || safeGet("Zevio_theme") || "lilac"; }
  // mode: "auto" follows the OS, "light" / "dark" force it
  function applyMode(m){
    if (m !== "light" && m !== "dark") m = "auto";
    if (m === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", m);
    safeSet("Zevio_mode", m);
  }
  function themeCards(list, current){
    return list.map(function(t){
      return '<button type="button" class="theme-card '+(current===t.id?"active":"")+'" data-theme="'+t.id+'">' +
        '<div class="theme-preview" data-palette="'+t.id+'"><span class="pv pv-in">hey, you up? ✨</span><span class="pv pv-out">always 💜</span></div>' +
        '<div class="theme-name">'+esc(t.name)+'</div></button>';
    }).join("");
  }
  applyMode(safeGet("Zevio_mode") || "auto");
  function chatIdFor(a,b){ return [a,b].sort().join("__"); }
  // { [uid]: value } - used to build REAL nested objects for Firestore set(..., {merge:true}).
  // (Dotted keys like "unread.uid" only work in update(); in set() they become literal field names.)
  function kv(uid, val){ var o = {}; o[uid] = val; return o; }
  function normUsername(v){ return (v||"").trim().toLowerCase(); }
  function validUsername(v){ return /^[a-z0-9._]{3,20}$/.test(v) && !/^[._]/.test(v) && !/[._]$/.test(v); }
  function loginEmailFor(username){ return username + "@" + USER_DOMAIN; }
  function phoneEmailFor(digits){ return "p" + digits + "@" + PHONE_DOMAIN; }
  function onlyDigits(v){ return (v||"").replace(/[^0-9]/g,""); }
  function timeMs(v){
    if (!v) return 0;
    if (typeof v === "number") return v;
    if (typeof v.toMillis === "function") return v.toMillis();
    if (v.seconds != null) return (v.seconds * 1000) + Math.floor((v.nanoseconds||0)/1000000);
    return 0;
  }
  function isTypingFresh(v){ return !!v && (Date.now()-timeMs(v) < 6000); }
  function isOnline(p){ return !!(p && p.online && (Date.now()-timeMs(p.lastActive) < ONLINE_STALE_MS)); }
  function canSeeActivity(p){ return (me.showActivity!==false) && (p && p.showActivity!==false); }
  function presenceLabel(p){
    if (!canSeeActivity(p)) return "";
    if (isOnline(p)) return "Online";
   if (p && p.lastActive) return "Last seen " + relativeTime(timeMs(p.lastActive));
    return "Offline";
  }
  function friendlyAuthError(err){
    var c = err && err.code || "";
    if (c.indexOf("wrong-password")>-1 || c.indexOf("invalid-credential")>-1) return "Wrong password, or this account doesn't exist.";
    if (c.indexOf("user-not-found")>-1) return "No account found for that username, email or phone.";
    if (c.indexOf("email-already-in-use")>-1) return "That email or phone is already registered. Log in instead.";
    if (c.indexOf("weak-password")>-1) return "Password must be at least 6 characters.";
    if (c.indexOf("too-many-requests")>-1) return "Too many tries. Wait a minute and try again.";
    if (c.indexOf("network")>-1) return "Network problem. Check your connection.";
    return (err && err.message) || "Something went wrong.";
  }

  function logoArtHTML(id){ return '<div class="logo-art art-'+esc(id||"nebula")+'" aria-hidden="true"></div>'; }

  function avatarHTML(profile, cls, showDot, online){
    profile = profile || {};
    var c = "avatar" + (cls ? " "+cls : "");
    var inner;
    if (profile.avatarMode === "photo" && profile.photo) inner = '<div class="'+c+'"><img src="'+profile.photo+'" alt=""></div>';
    else if (profile.avatarMode === "logo") inner = '<div class="'+c+'">'+logoArtHTML(profile.logo)+'</div>';
    else inner = '<div class="'+c+'">'+esc(initials(profile.username))+'</div>';
    if (!showDot) return inner;
    return '<div class="avatar-wrap">'+inner+(online?'<div class="presence-dot"></div>':'')+'</div>';
  }

  function compressSquare(file, cb){
    var r=new FileReader();
    r.onload=function(e){ var img=new Image(); img.onload=function(){
      var size=160, cv=document.createElement("canvas"); cv.width=size; cv.height=size;
      var ctx=cv.getContext("2d"), side=Math.min(img.width,img.height);
      ctx.drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,size,size);
      cb(cv.toDataURL("image/jpeg",0.72));
    }; img.src=e.target.result; };
    r.readAsDataURL(file);
  }
  function compressChatImage(file, cb){
    var r=new FileReader();
    r.onload=function(e){ var img=new Image(); img.onload=function(){
      var max=640, s=Math.min(1,max/Math.max(img.width,img.height));
      var w=Math.round(img.width*s), h=Math.round(img.height*s);
      var cv=document.createElement("canvas"); cv.width=w; cv.height=h;
      cv.getContext("2d").drawImage(img,0,0,w,h);
      cb(cv.toDataURL("image/jpeg",0.62));
    }; img.src=e.target.result; };
    r.readAsDataURL(file);
  }

  // ================= presence =================
  var lastPresenceWrite = null;
  function beatFor(on, force){
    if (!presenceUid) return Promise.resolve();
    if (!force && lastPresenceWrite === on) return Promise.resolve();
    lastPresenceWrite = on;
    return db.collection("users").doc(presenceUid).set({ online:on, lastActive:firebase.firestore.FieldValue.serverTimestamp() }, {merge:true}).catch(function(){});
  }
  function startPresence(uid){
    presenceUid = uid;
    lastPresenceWrite = null;
    beatFor(true, true);
    if (presenceTimer) clearInterval(presenceTimer);
    presenceTimer = setInterval(function(){
      if (document.visibilityState === "visible") beatFor(true, true);
    }, PRESENCE_HEARTBEAT_MS);
    if (!presenceBound) {
      presenceBound = true;
      document.addEventListener("visibilitychange", function(){ beatFor(document.visibilityState === "visible", document.visibilityState !== "visible"); });
      window.addEventListener("beforeunload", function(){ beatFor(false, true); });
    }
  }
  function stopPresence(){
    if (presenceTimer) { clearInterval(presenceTimer); presenceTimer = null; }
    var p = beatFor(false, true);
    presenceUid = null;
    lastPresenceWrite = null;
    return p;
  }

  function getProfile(uid){
    if (userCache[uid]) return Promise.resolve(userCache[uid]);
    return db.collection("users").doc(uid).get().then(function(d){
      var p = d.exists ? d.data() : { username:"user" };
      p.uid = uid; p.name=p.name||p.username||"User"; userCache[uid]=p; return p;
    }).catch(function(){ return { uid:uid, username:"user" }; });
  }

  // tiny two-tone beep, used for the optional notification sound
  function playPing(){
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      [880, 1180].forEach(function(freq, i){
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = freq;
        o.connect(g); g.connect(ctx.destination);
        var t0 = ctx.currentTime + i*0.09;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.09, t0+0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0+0.16);
        o.start(t0); o.stop(t0+0.18);
      });
    } catch(e) {}
  }

  // ================= toasts =================
  function ensureToastStack(){
    var s = document.getElementById("toastStack");
    if (!s) { s = document.createElement("div"); s.id="toastStack"; s.className="toast-stack"; document.body.appendChild(s); }
    return s;
  }
  function showToast(profile, text, onClick){
    var stack = ensureToastStack();
    var el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = avatarHTML(profile, "small") +
      '<div style="min-width:0"><div class="toast-title">@'+esc(profile.username||"user")+'</div>' +
      '<div class="toast-body">'+esc(truncate(text,44))+'</div></div>';
    el.addEventListener("click", function(){ el.remove(); if (onClick) onClick(); });
    stack.appendChild(el);
    setTimeout(function(){ if (el.parentNode) el.remove(); }, 4500);
  }
  function showErrorToast(msg){
    var stack = ensureToastStack();
    var el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = '<div style="min-width:0"><div class="toast-title" style="color:var(--danger)">Couldn\'t save</div>' +
      '<div class="toast-body wrap">'+esc(truncate(msg||"Something went wrong.",160))+'</div></div>';
    el.addEventListener("click", function(){ el.remove(); });
    stack.appendChild(el);
    setTimeout(function(){ if (el.parentNode) el.remove(); }, 8000);
  }

  // ================= AUTH SCREENS =================
  function renderAuth(){
    var mode = "login";
    var checkTimer = null;

    function draw(){
      root.innerHTML =
        '<div class="auth-wrap"><div class="auth-layout">' +
          '<section class="auth-hero">' +
            '<div>' +
              '<div class="hero-brand"><div class="brand-mark">'+appLogoSVG(42,"lgAuthHero")+'</div><strong>'+esc(APP_NAME)+'</strong></div>' +
              '<div class="hero-kicker" style="margin-top:42px"><span class="security-dot"></span> Private by design</div>' +
              '<div class="hero-title">Your people.<br><span style="color:var(--accent-text)">Your space.</span></div>' +
              '<div class="hero-copy">A fast, focused place to talk by username — with real-time messaging, privacy controls and a clean experience that stays out of your way.</div>' +
              '<div class="hero-pills"><span class="hero-pill">Real-time chat</span><span class="hero-pill">Message requests</span><span class="hero-pill">Read receipts</span><span class="hero-pill">Private profiles</span></div>' +
            '</div>' +
            '<div class="hero-footer">Zevio • Secure sign-in powered by Firebase Authentication</div>' +
          '</section>' +
          '<section class="auth-side"><div class="auth-card">' +
            '<div class="auth-eyebrow">Welcome to Zevio</div>' +
            '<h1>'+(mode==="signup"?"Create your account":"Welcome back")+'</h1>' +
            '<p class="lead">'+(mode==="signup"?"Choose a username and connect your email for secure account recovery.":"Sign in to continue your conversations.")+'</p>' +
            (mode==="signup"
              ? '<label class="auth-form-label" for="suName">Name</label><input class="field" id="suName" type="text" placeholder="Your name" maxlength="40" autocomplete="name">' +
                '<label class="auth-form-label" for="suUser">Username</label><input class="field" id="suUser" type="text" placeholder="your_username" maxlength="20" autocapitalize="none" autocomplete="username">' +
                '<div class="hint" id="userHint">3–20 characters. Letters, numbers, dot and underscore.</div>' +
                '<label class="auth-form-label" for="suContact">Email address</label><input class="field" id="suContact" type="email" placeholder="you@example.com" autocapitalize="none" autocomplete="email">' +
                '<div class="hint">Used only for sign-in and password recovery.</div>' +
                '<label class="auth-form-label" for="suPass">Password</label><input class="field" id="suPass" type="password" placeholder="At least 6 characters" autocomplete="new-password">'
              : '<label class="auth-form-label" for="liId">Username or email</label><input class="field" id="liId" type="text" placeholder="your_username or you@example.com" autocapitalize="none" autocomplete="username">' +
                '<label class="auth-form-label" for="liPass">Password</label><input class="field" id="liPass" type="password" placeholder="Your password" autocomplete="current-password">') +
            '<div class="error-text" id="authError"></div>' +
            '<button class="btn primary" id="authGo" style="width:100%">'+(mode==="signup"?"Create account":"Sign in")+'</button>' +
            (mode==="login" ? '<a class="forgot-link" id="forgotLink">Forgot your password?</a>' : '') +
            '<div class="switch-line"><span>'+ (mode==="signup"?"Already have an account?":"New to Zevio?") +'</span> <a id="authSwitch">'+(mode==="signup"?"Sign in":"Create account")+'</a></div>' +
            '<div class="auth-security"><span class="security-dot"></span> Your password is handled by Firebase Authentication</div>' +
          '</div></section>' +
        '</div></div>';

      document.getElementById("authSwitch").addEventListener("click", function(){ mode = mode==="signup"?"login":"signup"; draw(); });
      document.getElementById("authGo").addEventListener("click", submit);
      var forgot = document.getElementById("forgotLink");
      if (forgot) forgot.addEventListener("click", openResetRequest);

      if (mode==="signup") {
        var u = document.getElementById("suUser");
        u.addEventListener("input", function(){
          var v = normUsername(u.value);
          u.value = v;
          var hint = document.getElementById("userHint");
          hint.className = "hint";
          if (!v) { hint.textContent = "3–20 characters. Letters, numbers, dot and underscore."; return; }
          if (!validUsername(v)) { hint.className="hint bad"; hint.textContent = "Only a–z, 0–9, dot and underscore. 3–20 characters."; return; }
          hint.textContent = "Checking availability…";
          clearTimeout(checkTimer);
          checkTimer = setTimeout(function(){
            db.collection("usernames").doc(v).get().then(function(d){
              if (normUsername(u.value)!==v) return;
              if (d.exists) { hint.className="hint bad"; hint.textContent = "@"+v+" is taken."; }
              else { hint.className="hint ok"; hint.textContent = "@"+v+" is available."; }
            }).catch(function(){ hint.textContent=""; });
          }, 400);
        });
        document.getElementById("suPass").addEventListener("keydown", function(e){ if(e.key==="Enter") submit(); });
      } else {
        document.getElementById("liPass").addEventListener("keydown", function(e){ if(e.key==="Enter") submit(); });
      }
    }

    function openResetRequest(){
      var old=document.getElementById("resetOverlay"); if(old) old.remove();
      var ov=document.createElement("div"); ov.id="resetOverlay"; ov.className="reset-overlay";
      ov.innerHTML='<div class="reset-modal" role="dialog" aria-modal="true" aria-labelledby="resetTitle">' +
        '<div class="reset-icon"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V8a5 5 0 0 1 10 0v3"/><circle cx="12" cy="16" r="1"/></svg></div>' +
        '<h2 id="resetTitle">Reset your password</h2>' +
        '<p>Verify your Zevio account first. You can check an email address or a username before requesting a reset.</p>' +
        '<div class="reset-mode" style="display:flex;gap:6px;padding:4px;background:var(--bg-alt);border:1px solid var(--border);border-radius:12px;margin-bottom:14px">' +
          '<button type="button" class="btn" id="resetEmailMode" style="flex:1;background:var(--card);color:var(--text-main);padding:9px 10px">Email</button>' +
          '<button type="button" class="btn" id="resetUserMode" style="flex:1;background:transparent;color:var(--muted);padding:9px 10px">Username</button>' +
        '</div>' +
        '<label class="auth-form-label" for="resetIdentity" id="resetIdentityLabel">Email address</label>' +
        '<input class="field" id="resetIdentity" type="email" placeholder="you@example.com" autocomplete="email">' +
        '<div class="reset-status" id="resetStatus" aria-live="polite"></div>' +
        '<div class="reset-actions"><button class="btn" id="resetCancel" style="background:var(--bg-alt);color:var(--text-main)">Cancel</button><button class="btn primary" id="resetVerify">Verify account</button></div>' +
        '</div>';
      document.body.appendChild(ov); requestAnimationFrame(function(){ov.classList.add("open");});
      var close=function(){ov.classList.remove("open");setTimeout(function(){if(ov.parentNode)ov.remove();},160);};
      document.getElementById("resetCancel").addEventListener("click",close);
      ov.addEventListener("click",function(e){if(e.target===ov)close();});
      var input=document.getElementById("resetIdentity");
      var verify=document.getElementById("resetVerify"); var status=document.getElementById("resetStatus");
      var emailMode=document.getElementById("resetEmailMode"); var userMode=document.getElementById("resetUserMode");
      var kind="email";
      function setMode(next){
        kind=next;
        var email=next==="email";
        emailMode.style.background=email?"var(--card)":"transparent";
        emailMode.style.color=email?"var(--text-main)":"var(--muted)";
        userMode.style.background=!email?"var(--card)":"transparent";
        userMode.style.color=!email?"var(--text-main)":"var(--muted)";
        document.getElementById("resetIdentityLabel").textContent=email?"Email address":"Username";
        input.type=email?"email":"text";
        input.placeholder=email?"you@example.com":"your_username";
        input.autocomplete=email?"email":"username";
        status.className="reset-status"; status.textContent="";
        verify.textContent=email?"Verify account":"Check username";
        input.focus();
      }
      emailMode.addEventListener("click",function(){setMode("email")});
      userMode.addEventListener("click",function(){setMode("username")});
      input.focus();
      function setStatus(cls,msg){status.className="reset-status "+cls;status.textContent=msg;}
      function verifyEmail(email){
        // Firebase Authentication performs the authoritative lookup. When email
        // enumeration protection is enabled, Firebase may intentionally return
        // an indistinguishable result; the UI therefore never exposes raw Auth errors.
        return auth.fetchSignInMethodsForEmail(email).then(function(methods){
          if(!methods || !methods.length) throw {code:"auth/user-not-found"};
          return email;
        });
      }
      function sendReset(email){
        var settings={ url: window.location.origin + window.location.pathname, handleCodeInApp:false };
        return auth.sendPasswordResetEmail(email, settings).catch(function(err){
          var c=String((err&&err.code)||"");
          if(c.indexOf("unauthorized-continue-uri")>-1 || c.indexOf("invalid-continue-uri")>-1) return auth.sendPasswordResetEmail(email);
          throw err;
        });
      }
      function doVerify(){
        var value=input.value.trim().toLowerCase();
        setStatus("","");
        if(kind==="email"){
          if(!value || value.indexOf("@")<1 || value.indexOf(".")<3){setStatus("bad","Enter a valid email address.");return;}
          verify.disabled=true; verify.textContent="Checking…";
          verifyEmail(value).then(function(){
            setStatus("ok","Account verified. You can now request a password reset link.");
            verify.textContent="Send reset link";
            verify.disabled=false;
            verify.onclick=function(){
              verify.disabled=true; verify.textContent="Sending…"; setStatus("","Sending secure reset link…");
              sendReset(value).then(function(){setStatus("ok","Reset link sent. Check your inbox and spam folder.");verify.textContent="Sent";}).catch(function(err){verify.disabled=false;verify.textContent="Send reset link";setStatus("bad",friendlyAuthError(err));});
            };
          }).catch(function(err){verify.disabled=false;verify.textContent="Verify account";setStatus("bad",String(err&&err.code)==="auth/user-not-found"?"No Zevio account was found for that email address.":"We couldn't verify that account right now. Please try again.");});
        } else {
          var uname=normUsername(value);
          if(!validUsername(uname)){setStatus("bad","Enter a valid Zevio username (3–20 characters).");return;}
          verify.disabled=true; verify.textContent="Checking…";
          db.collection("usernames").doc(uname).get().then(function(d){
            if(!d.exists) throw new Error("missing");
            setStatus("ok","Username @"+uname+" exists. For security, enter the email connected to this account to continue.");
            setMode("email");
          }).catch(function(){verify.disabled=false;verify.textContent="Check username";setStatus("bad","No Zevio account was found for @"+uname+".");});
        }
      }
      verify.addEventListener("click",doVerify);
      input.addEventListener("keydown",function(e){if(e.key==="Enter")doVerify();});
    }

    function setErr(msg){ var e=document.getElementById("authError"); if(e) e.textContent = msg||""; }
    function busy(on){ var b=document.getElementById("authGo"); if(b){ b.disabled=on; b.textContent = on ? "Please wait…" : (mode==="signup"?"Create account":"Log in"); } }

    function submit(){ setErr(""); if (mode==="signup") doSignup(); else doLogin(); }

    function doSignup(){
      var username = normUsername(document.getElementById("suUser").value);
      var name = (document.getElementById("suName").value || "").trim().slice(0,40);
      var contact = document.getElementById("suContact").value.trim();
      var pass = document.getElementById("suPass").value;
      if (!name) return setErr("Enter your name.");
      if (!validUsername(username)) return setErr("Pick a valid username: 3–20 characters, a–z, 0–9, dot or underscore.");
      if (!contact || contact.indexOf("@") === -1) return setErr("Enter a valid email address. It is required for password recovery.");
      var isEmail = true;
      if (pass.length < 6) return setErr("Password must be at least 6 characters.");

      busy(true);
      db.collection("usernames").doc(username).get().then(function(d){
        if (d.exists) throw { code:"username-taken" };
        // Hold back boot() until the profile is written, otherwise the app
        // would see "no profile yet" and flash the username-setup screen.
        suppressBoot = true;
        return auth.createUserWithEmailAndPassword(contact.toLowerCase(), pass);
      }).then(function(cred){
        var uid = cred.user.uid;
        var batch = db.batch();
        batch.set(db.collection("usernames").doc(username), { uid: uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        batch.set(db.collection("users").doc(uid), {
          name: name, username: username, avatarMode: "initials", logo: "nebula", bio: "",
          showActivity: true, readReceipts: true,
          photo: null, createdAt: firebase.firestore.FieldValue.serverTimestamp(), online: true, lastActive: firebase.firestore.FieldValue.serverTimestamp()
        }, {merge:true});
        batch.set(db.collection("users").doc(uid).collection("private").doc("contact"),
          { email: contact.toLowerCase() });
        return batch.commit();
      }).then(function(){
        var created = auth.currentUser;
        if (created && !created.emailVerified) {
          return created.sendEmailVerification().catch(function(){ /* account creation must not fail if mail is temporarily unavailable */ });
        }
      }).then(function(){
        suppressBoot = false;
        boot();
      }).catch(function(err){
        var madeAccount = suppressBoot && auth.currentUser;
        suppressBoot = false;
        if (madeAccount) { boot(); return; }   // account exists; setup screen lets them retry
        busy(false);
        if (err && err.code === "username-taken") setErr("That username is taken. Try another one.");
        else setErr(friendlyAuthError(err));
      });
    }

    function doLogin(){
      var id = document.getElementById("liId").value.trim();
      var pass = document.getElementById("liPass").value;
      if (!id || !pass) return setErr("Enter your username (or email / phone) and password.");
      busy(true);

      function signIn(email){
        auth.signInWithEmailAndPassword(email, pass).catch(function(err){ busy(false); setErr(friendlyAuthError(err)); });
      }
      if (id.indexOf("@") > -1) {
        signIn(id.toLowerCase());
      } else {
        var uname = normUsername(id);
        db.collection("usernames").doc(uname).get().then(function(d){
          if (!d.exists || !d.data().uid) throw { code:"auth/user-not-found" };
          return db.collection("users").doc(d.data().uid).collection("private").doc("contact").get();
        }).then(function(d){
          if (!d.exists || !d.data().email) throw { code:"auth/user-not-found" };
          signIn(d.data().email);
        }).catch(function(err){
          // Legacy accounts are still allowed to log in through their old synthetic address.
          auth.signInWithEmailAndPassword(loginEmailFor(uname), pass).catch(function(e){ busy(false); setErr(friendlyAuthError(e)); });
        });
      }
    }

    draw();
  }

  // ================= USERNAME SETUP (old accounts) =================
  function renderUsernameSetup(user){
    root.innerHTML =
      '<div class="auth-wrap"><div class="auth-card">' +
        '<div class="brand-row"><div class="brand-mark">'+appLogoSVG(46,"lgSetup")+'</div>' +
        '<div><h1>Pick your username</h1><p class="lead" style="margin:2px 0 0">This is the only thing other people see.</p></div></div>' +
        '<input class="field" id="csName" type="text" placeholder="Your name" maxlength="40" autocomplete="name">'+
        '<input class="field" id="csUser" type="text" placeholder="Username" maxlength="20" autocapitalize="none">' +
        '<div class="hint" id="csHint">3–20 characters. Letters, numbers, dot and underscore.</div>' +
        '<div class="error-text" id="csErr"></div>' +
        '<button class="btn primary" id="csGo" style="width:100%">Save username</button>' +
        '<div class="switch-line"><a id="csOut">Sign out</a></div>' +
      '</div></div>';

    var nameInput = document.getElementById("csName");
    var input = document.getElementById("csUser");
    var hint = document.getElementById("csHint");
    var timer = null;

    input.addEventListener("input", function(){
      var v = normUsername(input.value); input.value = v;
      hint.className = "hint";
      if (!v) { hint.textContent = "3–20 characters. Letters, numbers, dot and underscore."; return; }
      if (!validUsername(v)) { hint.className="hint bad"; hint.textContent="Only a–z, 0–9, dot and underscore."; return; }
      hint.textContent = "Checking availability…";
      clearTimeout(timer);
      timer = setTimeout(function(){
        db.collection("usernames").doc(v).get().then(function(d){
          if (normUsername(input.value)!==v) return;
          if (d.exists) { hint.className="hint bad"; hint.textContent="@"+v+" is taken."; }
          else { hint.className="hint ok"; hint.textContent="@"+v+" is available."; }
        }).catch(function(){ hint.textContent=""; });
      }, 400);
    });
    input.addEventListener("keydown", function(e){ if(e.key==="Enter") save(); });
    document.getElementById("csOut").addEventListener("click", function(){ auth.signOut(); });
    document.getElementById("csGo").addEventListener("click", save);

    function save(){
      var name = (nameInput.value || "").trim().slice(0,40);
      var v = normUsername(input.value);
      var errEl = document.getElementById("csErr");
      errEl.textContent = "";
      if (!name) { errEl.textContent = "Enter your name first."; return; }
      if (!validUsername(v)) { errEl.textContent = "Pick a valid username first."; return; }
      var btn = document.getElementById("csGo");
      btn.disabled = true; btn.textContent = "Saving…";

      db.collection("usernames").doc(v).get().then(function(d){
        if (d.exists) throw { code:"username-taken" };
        var batch = db.batch();
        batch.set(db.collection("usernames").doc(v), { uid:user.uid, createdAt:firebase.firestore.FieldValue.serverTimestamp() });
        batch.set(db.collection("users").doc(user.uid), {
          name: name, username: v, avatarMode: "initials", logo: "nebula", bio: "",
          showActivity: true, readReceipts: true,
          photo: null, createdAt: firebase.firestore.FieldValue.serverTimestamp(), online: true, lastActive: firebase.firestore.FieldValue.serverTimestamp()
        }, {merge:true});
        if (user.email) {
          batch.set(db.collection("users").doc(user.uid).collection("private").doc("contact"),
            { email: user.email }, {merge:true});
        }
        return batch.commit();
      }).then(function(){
        boot();
      }).catch(function(err){
        btn.disabled=false; btn.textContent="Save username";
        errEl.textContent = (err && err.code==="username-taken") ? "That username is taken. Try another one." : friendlyAuthError(err);
      });
    }
  }

  function openImageViewer(url){
    if(!url)return;
    var old=document.getElementById("zevioImageViewer");if(old)old.remove();
    var ov=document.createElement("div");ov.id="zevioImageViewer";ov.className="image-viewer";
    ov.innerHTML='<button class="image-viewer-close" aria-label="Close">✕</button><img src="'+esc(url)+'" alt="photo"><button class="image-viewer-download" data-url="'+esc(url)+'">Download</button>';
    document.body.appendChild(ov);requestAnimationFrame(function(){ov.classList.add("open")});
    function close(){ov.classList.remove("open");setTimeout(function(){if(ov.parentNode)ov.remove()},120)}
    ov.addEventListener("click",function(e){if(e.target===ov)close()});ov.querySelector(".image-viewer-close").addEventListener("click",close);
    ov.querySelector(".image-viewer-download").addEventListener("click",function(){downloadMedia(url,"zevio-photo.jpg")});
  }
  function downloadMedia(url,name){
    if(!url)return;
    fetch(url).then(function(r){if(!r.ok)throw new Error("Download failed");return r.blob()}).then(function(blob){var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name||"zevio-media";document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},500)}).catch(function(){var a=document.createElement("a");a.href=url;a.target="_blank";a.rel="noopener";a.download=name||"zevio-media";document.body.appendChild(a);a.click();a.remove()});
  }
  function dataUrlToBlob(dataUrl){var parts=dataUrl.split(","),mime=(parts[0].match(/:(.*?);/)||[])[1]||"application/octet-stream",bin=atob(parts[1]),len=bin.length,arr=new Uint8Array(len);for(var i=0;i<len;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type:mime});}

  // ================= MESSAGE RENDERING =================
  function ticksHTML(read){
    var svg='<svg width="15" height="11" viewBox="0 0 16 11" fill="none"><path d="M1 5.5L4.5 9L11 1.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 5.5L9 9L15.5 1.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return '<span class="ticks '+(read?"read":"sent")+'">'+svg+'</span>';
  }

  function renderMessages(container, msgs, myUid, otherLastRead, receiptsOn, cb){
    var html="", lastDay=null;
    for (var i=0;i<msgs.length;i++){
      var m=msgs[i], mt=timeMs(m.time)||Date.now(), label=dayLabel(mt);
      if(label!==lastDay){html+='<div class="day-divider">'+esc(label)+'</div>';lastDay=label;}
      var dir=m.from===myUid?"out":"in", quote=(m.replyTo&&m.replyTo.text)?'<div class="reply-quote">'+esc(truncate(m.replyTo.text,60))+'</div>':"";
      var mediaUrl=m.mediaUrl||m.image||"", body='<span class="deleted-msg">Message unsent</span>';
      if(!m.deleted){
        if(m.type==="image"&&mediaUrl){body='<div class="media-msg"><button class="image-view-btn" data-url="'+esc(mediaUrl)+'" aria-label="Open photo"><img class="img-msg" src="'+esc(mediaUrl)+'" alt="photo"></button><button class="media-download" data-url="'+esc(mediaUrl)+'" data-name="zevio-photo.jpg">Download</button></div>';}
        else if(m.type==="audio"&&(m.audioUrl||mediaUrl)){var au=m.audioUrl||mediaUrl;body='<div class="audio-msg"><audio controls preload="metadata" src="'+esc(au)+'"></audio><button class="media-download" data-url="'+esc(au)+'" data-name="zevio-voice.webm">Download</button></div>';}
        else body=esc(m.text||"");
      }
      if(m.edited&&!m.deleted)body+='<span class="edited-label"> edited</span>';
      var read=dir==="out"&&receiptsOn&&otherLastRead&&mt&&otherLastRead>=mt, rm=m.reactions||{}, reactionHTML="";
      Object.keys(rm).forEach(function(uid){if(rm[uid])reactionHTML+='<span>'+esc(rm[uid])+'</span>';});
      var actions=dir==="out"?'<div class="msg-actions"><button class="edit-msg-btn" data-idx="'+i+'">Edit</button><button class="unsend-msg-btn" data-idx="'+i+'">Unsend</button></div>':'';
      html+='<div class="msg-block '+dir+'"><div class="msg-row-wrap"><button class="reply-btn" data-idx="'+i+'" aria-label="Reply"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg></button><div class="bubble-wrap"><div class="bubble">'+quote+body+'</div>'+(reactionHTML?'<div class="reaction-badge">'+reactionHTML+'</div>':'')+actions+'</div><button class="react-btn" data-idx="'+i+'" aria-label="React">🙂</button></div><div class="msg-time">'+fmtTime(mt)+(dir==="out"?ticksHTML(read):"")+'</div></div>';
    }
    if(!msgs.length)html='<div class="empty-chip">No messages yet — say hello 👋</div>';
    var prevCount=container._count,prevTop=container.scrollTop,nearBottom=(container.scrollHeight-container.scrollTop-container.clientHeight)<140;
    container.innerHTML=html;var lastMine=msgs.length&&msgs[msgs.length-1].from===myUid;
    if(prevCount===undefined||nearBottom||(prevCount!==msgs.length&&lastMine))container.scrollTop=container.scrollHeight;else container.scrollTop=prevTop;container._count=msgs.length;
    var nodes=container.querySelectorAll(".reply-btn");for(var j=0;j<nodes.length;j++)nodes[j].addEventListener("click",function(){cb.onReply(msgs[+this.getAttribute("data-idx")]);});
    nodes=container.querySelectorAll(".react-btn");for(var k=0;k<nodes.length;k++)nodes[k].addEventListener("click",function(){cb.onReact(msgs[+this.getAttribute("data-idx")],this);});
    nodes=container.querySelectorAll(".edit-msg-btn");for(var e=0;e<nodes.length;e++)nodes[e].addEventListener("click",function(){cb.onEdit(msgs[+this.getAttribute("data-idx")]);});
    nodes=container.querySelectorAll(".unsend-msg-btn");for(var u=0;u<nodes.length;u++)nodes[u].addEventListener("click",function(){cb.onUnsend(msgs[+this.getAttribute("data-idx")]);});
    nodes=container.querySelectorAll(".image-view-btn");for(var v=0;v<nodes.length;v++)nodes[v].addEventListener("click",function(){openImageViewer(this.getAttribute("data-url"));});
    nodes=container.querySelectorAll(".media-download");for(var d=0;d<nodes.length;d++)nodes[d].addEventListener("click",function(){downloadMedia(this.getAttribute("data-url"),this.getAttribute("data-name")||"zevio-media");});
  }

  function makeReactionPopover(){
    var pop=document.createElement("div"); pop.className="reaction-popover";
    var h=""; for (var i=0;i<REACTION_SET.length;i++) h+='<button type="button">'+REACTION_SET[i]+'</button>';
    pop.innerHTML=h; document.body.appendChild(pop);
    var onChoose=null;
    var btns=pop.querySelectorAll("button");
    for (var j=0;j<btns.length;j++) btns[j].addEventListener("click", function(){ if(onChoose) onChoose(this.textContent); pop.classList.remove("open"); });
    var onDoc = function(e){ if(!pop.contains(e.target) && !e.target.classList.contains("react-btn")) pop.classList.remove("open"); };
    document.addEventListener("click", onDoc);
    return {
      destroy:function(){ document.removeEventListener("click", onDoc); if (pop.parentNode) pop.parentNode.removeChild(pop); },
      openNear:function(el,cb){ onChoose=cb; var r=el.getBoundingClientRect();
        pop.style.left=Math.max(8, r.left-90)+"px"; pop.style.top=(r.top-46+window.scrollY)+"px"; pop.classList.add("open"); }
    };
  }

  function wireComposer(o){
    var replyTo=null, typing=false, tTimer=null;
    function upd(){ o.sendBtn.disabled = o.input.disabled || o.input.value.trim().length===0; }
    function setTyping(v){ if(v===typing) return; typing=v; o.onTypingChange(v); }
    o.input.addEventListener("input", function(){
      o.input.style.height="auto"; o.input.style.height=Math.min(o.input.scrollHeight,120)+"px"; upd();
      if (o.input.value.trim()){ setTyping(true); clearTimeout(tTimer); tTimer=setTimeout(function(){ setTyping(false); }, TYPING_TIMEOUT); }
      else { clearTimeout(tTimer); setTyping(false); }
    });
    o.input.addEventListener("keydown", function(e){ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(); } });
    o.sendBtn.addEventListener("click", send);

    if (!o.emojiPanel.dataset.filled){
      var h=""; for (var i=0;i<EMOJIS.length;i++) h+='<button type="button">'+EMOJIS[i]+'</button>';
      o.emojiPanel.innerHTML=h; o.emojiPanel.dataset.filled="1";
      var eb=o.emojiPanel.querySelectorAll("button");
      for (var k=0;k<eb.length;k++) eb[k].addEventListener("click", function(){
        var el=o.input, s=el.selectionStart||el.value.length, e2=el.selectionEnd||el.value.length;
        el.value = el.value.slice(0,s)+this.textContent+el.value.slice(e2);
        el.selectionStart=el.selectionEnd=s+this.textContent.length; el.focus(); upd();
        o.emojiPanel.classList.remove("open");
      });
    }
    o.emojiBtn.addEventListener("click", function(e){ e.stopPropagation(); o.emojiPanel.classList.toggle("open"); });
    o.addDocListener("click", function(e){ if(!o.emojiPanel.contains(e.target) && e.target!==o.emojiBtn) o.emojiPanel.classList.remove("open"); });
    o.replyBarClose.addEventListener("click", function(){ clearReply(); });

    function setReply(msg){
      replyTo = { text: msg.text || "📷 Photo", from: msg.from };
      o.replyBarText.innerHTML = '<b>Replying:</b> ' + esc(truncate(replyTo.text,70));
      o.replyBar.classList.add("active"); o.input.focus();
    }
    function clearReply(){ replyTo=null; o.replyBar.classList.remove("active"); }
    function send(){
      if (o.input.disabled) return;
      var t=o.input.value.trim(); if(!t) return;
      o.onSend(t, replyTo);
      o.input.value=""; o.input.style.height="auto"; upd(); clearReply();
      clearTimeout(tTimer); setTyping(false);
    }
    function setEnabled(on){ o.input.disabled = !on; upd(); }
    upd();
    return { setReply:setReply, setEnabled:setEnabled };
  }

  // ================= EMAIL VERIFICATION =================
  function showEmailVerificationBanner(){
    var old = document.getElementById("emailVerifyBanner");
    if (old) old.remove();
    if (!auth.currentUser || auth.currentUser.emailVerified) return;
    var bar = document.createElement("div");
    bar.id = "emailVerifyBanner";
    bar.style.cssText = "position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:10000;width:min(680px,calc(100vw - 24px));background:var(--card);color:var(--text-main);border:1px solid var(--border);border-radius:14px;box-shadow:0 12px 35px rgba(0,0,0,.16);padding:12px 14px;display:flex;gap:12px;align-items:center";
    bar.innerHTML = '<div style="flex:1;min-width:0"><div style="font-weight:800;font-size:13px">Verify your email address</div><div style="font-size:12px;color:var(--muted);margin-top:3px">A verification link was sent to '+esc(auth.currentUser.email||"your email")+'.</div></div>' +
      '<button id="verifyResend" class="mini-btn">Resend</button><button id="verifyRefresh" class="mini-btn">I verified</button>';
    document.body.appendChild(bar);
    document.getElementById("verifyResend").addEventListener("click",function(){
      var b=this; b.disabled=true; b.textContent="Sending…";
      auth.currentUser.sendEmailVerification().then(function(){ showToast(null,"Verification email sent."); })
        .catch(function(err){ showErrorToast(friendlyAuthError(err)||"Couldn’t send the verification email."); })
        .finally(function(){ b.disabled=false; b.textContent="Resend"; });
    });
    document.getElementById("verifyRefresh").addEventListener("click",function(){
      auth.currentUser.reload().then(function(){
        if (auth.currentUser.emailVerified) bar.remove();
        else showErrorToast("Your email is not verified yet. Open the link from your email first.");
      });
    });
  }

  // ================= MAIN APP =================
  function renderApp(){
    teardown();   // remove listeners from any previous render (sign out / re-boot)

    var EMPTY_MAIN = '<div class="empty-state"><div class="es-title">Pick a chat</div>' +
      '<div>Search any username above to start a new conversation.</div></div>';

    root.innerHTML =
      '<div id="appView">' +
        '<div class="sidebar">' +
          '<div class="side-head">' +
            '<div class="wordmark-row"><div class="side-logo">'+appLogoSVG(30,"lgSide")+'</div><div class="wordmark">'+esc(APP_NAME)+'</div></div>' +
            '<div id="meAvatar"></div>' +
            '<button class="icon-sq" id="settingsBtn" aria-label="Settings" title="Settings">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.82 1.82-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20h-2.58v-.08a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-1.82-1.82.06-.06A1.7 1.7 0 0 0 8.06 15a1.7 1.7 0 0 0-1.56-1.03H6.42v-2.58h.08A1.7 1.7 0 0 0 8.06 10a1.7 1.7 0 0 0-.34-1.88l-.06-.06 1.82-1.82.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.56V5h2.58v.08A1.7 1.7 0 0 0 16.14 6.64a1.7 1.7 0 0 0 1.88-.34l.06-.06 1.82 1.82-.06.06A1.7 1.7 0 0 0 19.5 10a1.7 1.7 0 0 0 1.56 1.03h.08v2.58h-.08A1.7 1.7 0 0 0 19.4 15Z"/></svg>' +
            '</button>' +
          '</div>' +
          '<div class="search-row"><input class="search-input" id="searchInput" type="text" placeholder="Search a username to start chatting" autocapitalize="none"></div>' +
          '<div class="tab-row">' +
            '<button class="tab-btn active" id="tabChats">Chats</button>' +
            '<button class="tab-btn" id="tabRequests">Requests<span class="tab-badge" id="reqBadge" style="display:none">0</span></button>' +
          '</div>' +
          '<div class="list" id="listEl"></div>' +
        '</div>' +
        '<div class="main" id="mainEl">' + EMPTY_MAIN + '</div>' +
      '</div>';

    drawMeAvatar();
    showEmailVerificationBanner();
    document.getElementById("settingsBtn").addEventListener("click", openSettings);

    var activeOther = null;
    var activeTab = "chats";
    var unsubMsgs = null, unsubChat = null, unsubOther = null;
    var chats = [];
    var chatsErr = null;
    var searchResults = null;
    var searchTimer = null;
    var knownLastTime = {};
    var firstSnapshot = true;
    var chatCleanups = [];
    var sharedPop = null;

    // document-level listeners that belong to the currently open chat
    function addDocListener(type, fn){
      document.addEventListener(type, fn);
      chatCleanups.push(function(){ document.removeEventListener(type, fn); });
    }
    function runChatCleanups(){
      chatCleanups.forEach(function(fn){ try { fn(); } catch(e){} });
      chatCleanups = [];
    }
    teardownFns.push(function(){
      runChatCleanups();
      if (unsubMsgs) unsubMsgs();
      if (unsubChat) unsubChat();
      if (unsubOther) unsubOther();
      if (sharedPop) sharedPop.destroy();
    });

    document.getElementById("tabChats").addEventListener("click", function(){ activeTab="chats"; drawList(); updateTabUI(); });
    document.getElementById("tabRequests").addEventListener("click", function(){ activeTab="requests"; drawList(); updateTabUI(); });
    function updateTabUI(){
      document.getElementById("tabChats").classList.toggle("active", activeTab==="chats");
      document.getElementById("tabRequests").classList.toggle("active", activeTab==="requests");
    }

    // ---- global chat list + incoming-message watcher ----
    var unsubChatsList = db.collection("chats").where("members","array-contains", me.uid).onSnapshot(function(snap){
      chatsErr = null;
      chats = [];
      var arrivals = [];
      snap.forEach(function(d){
        var c=d.data(); c.id=d.id; chats.push(c);
        var lm = timeMs(c.lastTime);
        var incoming = c.lastFrom && c.lastFrom!==me.uid && lm && lm !== knownLastTime[c.id];
        if (!firstSnapshot && incoming) arrivals.push(c);
        knownLastTime[c.id] = lm;
      });
      chats.sort(function(a,b){ return timeMs(b.lastTime)-timeMs(a.lastTime); });

      var need = [];
      chats.forEach(function(c){
        var other = c.members[0]===me.uid ? c.members[1] : c.members[0];
        if (!userCache[other]) need.push(getProfile(other));
      });
      (need.length ? Promise.all(need) : Promise.resolve()).then(function(){
        drawList();
        updateTitleBadge();
        if (!firstSnapshot) arrivals.forEach(handleIncoming);
        firstSnapshot = false;
      });
    }, function(err){
      chatsErr = err;
      if (window.console) console.error("Chat list error:", err);
      drawList();
    });
    teardownFns.push(unsubChatsList);

    function isVisibleAndActive(otherUid){
      return document.visibilityState === "visible" && activeOther === otherUid;
    }
    function handleIncoming(c){
      var otherUid = c.members[0]===me.uid ? c.members[1] : c.members[0];
      if (isVisibleAndActive(otherUid)) return;
      if (c.muted && c.muted[me.uid]) return;
      if (c.blockedBy && c.blockedBy[me.uid]) return;
      getProfile(otherUid).then(function(p){
        var text = c.lastMessage || "New message";
        showToast(p, text, function(){ openChat(otherUid); });
        if (boolPref("Zevio_notif_desktop", false) && window.Notification && Notification.permission==="granted") {
          try {
            var n = new Notification(displayName(p), { body: text });
            n.onclick = function(){ window.focus(); openChat(otherUid); n.close(); };
          } catch(e){}
        }
        if (boolPref("Zevio_notif_sound", true)) playPing();
      });
    }
    function updateTitleBadge(){
      var total = 0;
      chats.forEach(function(c){
        if (c.deletedFor && c.deletedFor[me.uid]) return;
        var n = (c.unread && c.unread[me.uid]) || 0;
        total += (typeof n === "number") ? n : 0;
      });
      document.title = total>0 ? "("+total+") "+APP_NAME : APP_NAME;
    }

    var searchInput = document.getElementById("searchInput");
    searchInput.addEventListener("input", function(){
      var q = normUsername(searchInput.value);
      clearTimeout(searchTimer);
      if (!q) { searchResults = null; drawList(); return; }
      searchTimer = setTimeout(function(){
        db.collection("users").orderBy("username").startAt(q).endAt(q+"\uf8ff").limit(12).get()
          .then(function(snap){
            searchResults = [];
            snap.forEach(function(d){
              if (d.id === me.uid) return;
              var p = d.data(); p.uid = d.id; userCache[d.id]=p; searchResults.push(p);
            });
            drawList();
          }).catch(function(){ searchResults=[]; drawList(); });
      }, 280);
    });

    // a chat shows up in the list once it has at least one message and isn't deleted by me
    function visibleChats(){
      return chats.filter(function(c){ return timeMs(c.lastTime) && !(c.deletedFor && c.deletedFor[me.uid]); });
    }
    function isPendingIncoming(c){ return c.status==="pending" && c.requestedBy && c.requestedBy!==me.uid; }

    function drawList(){
      var el = document.getElementById("listEl");
      if (!el) return;
      var html = "";
      var vis = visibleChats();
      var pendingIncoming = vis.filter(isPendingIncoming);
      var reqBadge = document.getElementById("reqBadge");
      if (reqBadge) {
        if (pendingIncoming.length) { reqBadge.style.display="flex"; reqBadge.textContent = pendingIncoming.length; }
        else reqBadge.style.display = "none";
      }

      if (searchResults) {
        html += '<div class="list-label">People</div>';
        if (!searchResults.length) html += '<div class="empty-note">No user found with that username.</div>';
        searchResults.forEach(function(p){
          html += '<button class="item" data-uid="'+esc(p.uid)+'">' +
            avatarHTML(p, "", true, canSeeActivity(p) && isOnline(p)) +
            '<div style="min-width:0;flex:1"><div class="item-name">@'+esc(p.username)+'</div>' +
            '<div class="item-sub">'+(canSeeActivity(p) && isOnline(p) ? "Online" : "Tap to chat")+'</div></div></button>';
        });
        el.innerHTML = html;
        var sitems = el.querySelectorAll(".item");
        for (var s=0;s<sitems.length;s++) sitems[s].addEventListener("click", function(){ openChat(this.getAttribute("data-uid")); });
        return;
      }

      var list = activeTab==="requests" ? pendingIncoming : vis.filter(function(c){ return !isPendingIncoming(c); });

      if (!list.length) {
        html = chatsErr
          ? '<div class="empty-note bad">Couldn\'t load your chats.<br>' + esc(chatsErr.message || "Unknown error") + '<br><br>Check that the Firestore rules are published.</div>'
          : activeTab==="requests"
            ? '<div class="empty-note">No message requests right now.</div>'
            : '<div class="empty-note">No chats yet.<br>Search a username above and send the first message.</div>';
      } else {
        list.forEach(function(c){
          var other = c.members[0]===me.uid ? c.members[1] : c.members[0];
          var p = userCache[other] || { username:(c.names&&c.names[other]) || "user" };
          var typing = isTypingFresh(c.typing && c.typing[other]);
          var unread = (c.unread && c.unread[me.uid]) || 0;
          var iRequested = c.status==="pending" && c.requestedBy===me.uid;
          var sub = typing ? '<i>typing…</i>' : (iRequested ? "Request sent" : esc(truncate(c.lastMessage||"",30)));
          html += '<button class="item'+(other===activeOther?" active":"")+'" data-uid="'+esc(other)+'">' +
            avatarHTML(p, "", true, canSeeActivity(p) && isOnline(p)) +
            '<div style="min-width:0;flex:1"><div class="item-name">@'+esc(p.username||"user")+'</div>' +
            '<div class="item-sub">'+sub+'</div></div>' +
            (activeTab==="requests" ? '<span class="item-badge-req">New</span>' : (unread>0 ? '<span class="unread-count">'+(unread>9?"9+":unread)+'</span>' : '')) +
            '</button>';
        });
      }
      el.innerHTML = html;
      var items = el.querySelectorAll(".item");
      for (var i=0;i<items.length;i++) items[i].addEventListener("click", function(){ openChat(this.getAttribute("data-uid")); });
    }

    // ---- thread ----
    function openChat(otherUid){
      if(window.ZevioGroups&&window.ZevioGroups.stop)window.ZevioGroups.stop();
      runChatCleanups();
      activeOther = otherUid;
      document.getElementById("appView").classList.add("chat-open");
      searchInput.value = ""; searchResults = null;
      drawList();

      getProfile(otherUid).then(function(other){
        if (activeOther !== otherUid) return;   // user already clicked another chat
        var chatId = chatIdFor(me.uid, otherUid);
        var chatRef = db.collection("chats").doc(chatId);
        var currentChatData = {};

        document.getElementById("mainEl").innerHTML =
          '<div class="thread-head">' +
            '<button class="back-btn" id="backBtn" aria-label="Back"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>' +
            '<div id="threadAvatar">'+avatarHTML(other)+'</div>' +
            '<div style="min-width:0" id="threadNameWrap"><div class="thread-name" id="threadName">@'+esc(other.username||"user")+'</div>' +
            '<div class="thread-sub" id="threadSub"></div></div>' +
            '<div class="thread-menu-wrap">' +
              '<button class="icon-sq" id="threadMenuBtn" aria-label="More"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg></button>' +
              '<div class="thread-menu" id="threadMenu">' +
                '<button id="mnuProfile">View profile</button>' +
                '<button id="mnuMute">Mute notifications</button>' +
                '<button id="mnuClear">Clear chat</button>' +
                '<button id="mnuBlock">Block user</button>' +
                '<button id="mnuDelete" class="danger">Delete chat</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div id="reqBannerWrap"></div>' +
          '<div class="messages" id="msgsEl" data-chat-theme="'+esc(currentTheme())+'"></div>' +
          '<div id="blockedNoteWrap"></div>' +
          '<div class="reply-preview" id="replyBar"><div class="rp-text" id="replyText"></div><button class="rp-close" id="replyClose">✕</button></div>' +
          '<div class="composer">' +
            '<div class="emoji-panel" id="emojiPanel"></div>' +
            '<button class="emoji-btn" id="emojiBtn" aria-label="Emoji" title="Emoji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 14.5c1.05 1.35 2.35 2 4 2s2.95-.65 4-2"/><path d="M8.5 9.5h.01M15.5 9.5h.01" stroke-width="2.8"/></svg></button>' +
            '<div class="attach-btn" aria-label="Send photo">' +
              '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 8v6M18 5v6M15 3l6 6"/></svg>' +
              '<input type="file" accept="image/*" id="imgInput"></div>' +
            '<button class="voice-btn" id="voiceBtn" type="button" aria-label="Voice message" title="Voice message"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg></button>' +
            '<textarea class="msg-input" id="msgInput" rows="1" placeholder="Message '+esc(displayName(other))+'"></textarea>' +
            '<button class="send-circle" id="sendBtn" disabled aria-label="Send">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>' +
          '</div>';

        var msgsEl = document.getElementById("msgsEl");
        var pop = sharedPop || (sharedPop = makeReactionPopover());
        var otherLastRead = 0;
        var list = [];

        // ---------- chat document helpers ----------
        function kvBoth(a, b){ var o = {}; o[me.uid] = a; o[otherUid] = b; return o; }

        // Safe merge-write on the chat doc. Always carries members + names so a
        // first-time write (doc doesn't exist yet) is a valid "create".
        function writeChat(patch){
          var full = { members:[me.uid, otherUid].sort(), names: kvBoth(me.username, other.username || "user") };
          for (var k in patch) full[k] = patch[k];
          return chatRef.set(full, {merge:true}).catch(function(err){
            if (window.console) console.error("Chat write failed:", err);
            showErrorToast((err && err.message) || "Couldn't save changes.");
          });
        }

        function pushMessage(payload, preview, suppliedRef){
          var isRequest = currentChatData.status === "pending" && currentChatData.requestedBy && currentChatData.requestedBy !== me.uid;
          if (currentChatData.blockedBy && (currentChatData.blockedBy[me.uid] || currentChatData.blockedBy[otherUid])) {
            showErrorToast("You can't send messages in this chat while it is blocked."); return;
          }
          if (isRequest && (currentChatData.requestCount || 0) >= 3) {
            showErrorToast("Message request limit reached. Wait for the other person to accept."); return;
          }
          var msgRef = suppliedRef || chatRef.collection("messages").doc();
          var isFirst = !currentChatData.lastTime;
          var newStatus = isFirst ? "pending" : (currentChatData.status === "pending" && currentChatData.requestedBy !== me.uid ? "accepted" : (currentChatData.status || "accepted"));
          var msg = payload || {};
          msg.from = me.uid;
          msg.time = firebase.firestore.FieldValue.serverTimestamp();
          msg.reactions = {};
          var patch = {
            members: [me.uid, otherUid].sort(),
            names: kvBoth(me.username, other.username || "user"),
            lastMessage: preview, lastTime: firebase.firestore.FieldValue.serverTimestamp(), lastFrom: me.uid,
            status: newStatus,
            unread: kv(otherUid, firebase.firestore.FieldValue.increment(1)),
            typing: kv(me.uid, null),
            deletedFor: kvBoth(false, false),
            requestCount: isFirst ? 1 : firebase.firestore.FieldValue.increment(1)
          };
          if (isFirst) patch.requestedBy = me.uid;
          db.runTransaction(function(tx){
            return tx.get(chatRef).then(function(snap){
              var prev = snap.exists ? snap.data() : {};
              var pending = prev.status === "pending" && prev.requestedBy && prev.requestedBy !== me.uid;
              if (prev.blockedBy && (prev.blockedBy[me.uid] || prev.blockedBy[otherUid])) throw new Error("This chat is blocked.");
              if (pending && (prev.requestCount || 0) >= 3) throw new Error("Message request limit reached.");
              var first = !prev.lastTime;
              var status = first ? "pending" : (pending ? "accepted" : (prev.status || "accepted"));
              var cp = {
                members:[me.uid,otherUid].sort(), names:kvBoth(me.username,other.username||"user"),
                lastMessage:preview, lastTime:firebase.firestore.FieldValue.serverTimestamp(), lastFrom:me.uid,
                status:status, unread:kv(otherUid,firebase.firestore.FieldValue.increment(1)),
                typing:kv(me.uid,null), deletedFor:kvBoth(false,false),
                requestCount:first ? 1 : (pending ? firebase.firestore.FieldValue.increment(1) : (prev.requestCount||0))
              };
              if (first) cp.requestedBy=me.uid;
              tx.set(chatRef, cp, {merge:true});
              tx.set(msgRef, msg);
            });
          }).catch(function(err){
            if (window.console) console.error("Send failed:", err);
            showErrorToast("Message not sent. " + ((err && err.message) || ""));
          });
        }

        // ---------- header / menu ----------
        document.getElementById("backBtn").addEventListener("click", function(){
          document.getElementById("appView").classList.remove("chat-open");
        });
        document.getElementById("threadName").addEventListener("click", function(){ openProfileModal(other, chatId, chatRef); });

        var menuBtn = document.getElementById("threadMenuBtn");
        var menuEl = document.getElementById("threadMenu");
        menuBtn.addEventListener("click", function(e){ e.stopPropagation(); menuEl.classList.toggle("open"); });
        addDocListener("click", function(e){ if(!menuEl.contains(e.target) && e.target!==menuBtn) menuEl.classList.remove("open"); });

        document.getElementById("mnuProfile").addEventListener("click", function(){ menuEl.classList.remove("open"); openProfileModal(other, chatId, chatRef); });
        document.getElementById("mnuMute").addEventListener("click", function(){
          menuEl.classList.remove("open");
          var muted = !!(currentChatData.muted && currentChatData.muted[me.uid]);
          writeChat({ muted: kv(me.uid, !muted) });
        });
        document.getElementById("mnuClear").addEventListener("click", function(){
          menuEl.classList.remove("open");
          if (!window.confirm("Clear this chat from your view? Existing messages stay available to the other person.")) return;
          writeChat({ deletedFor: kv(me.uid, true), unread: kv(me.uid, 0) }).then(function(){
            document.getElementById("appView").classList.remove("chat-open");
            document.getElementById("mainEl").innerHTML = EMPTY_MAIN;
            activeOther = null;
          });
        });
        document.getElementById("mnuBlock").addEventListener("click", function(){
          menuEl.classList.remove("open");
          var blocked = !!(currentChatData.blockedBy && currentChatData.blockedBy[me.uid]);
          writeChat({ blockedBy: kv(me.uid, !blocked) });
        });
        document.getElementById("mnuDelete").addEventListener("click", function(){
          menuEl.classList.remove("open");
          if (!window.confirm("Delete this chat from your list?")) return;
          writeChat({ deletedFor: kv(me.uid, true) }).then(function(){
            document.getElementById("appView").classList.remove("chat-open");
            document.getElementById("mainEl").innerHTML = EMPTY_MAIN;
            activeOther = null;
          });
        });

        // ---------- composer ----------
        var composer = wireComposer({
          input: document.getElementById("msgInput"),
          sendBtn: document.getElementById("sendBtn"),
          emojiBtn: document.getElementById("emojiBtn"),
          emojiPanel: document.getElementById("emojiPanel"),
          replyBar: document.getElementById("replyBar"),
          replyBarText: document.getElementById("replyText"),
          replyBarClose: document.getElementById("replyClose"),
          addDocListener: addDocListener,
          onTypingChange: function(v){
            if (!currentChatData.members) return;   // chat doc doesn't exist yet
            var field = {}; field["typing."+me.uid] = v ? firebase.firestore.FieldValue.serverTimestamp() : null;
            chatRef.update(field).catch(function(){});
          },
          onSend: function(text, replyTo){
            var p = { text:text, type:"text" };
            if (replyTo) p.replyTo = replyTo;
            pushMessage(p, text);
          }
        });

        function uploadChatBlob(blob,fileName,mediaType,previewText){
          var msgRef=chatRef.collection("messages").doc(),safe=(fileName||"media").replace(/[^a-zA-Z0-9._-]/g,"_");
          var path="chatMedia/"+chatId+"/"+me.uid+"/"+msgRef.id+"_"+safe;
          showToast(null,mediaType==="audio"?"Uploading voice message…":"Uploading photo…");
          return storage.ref(path).put(blob,{contentType:blob.type||"application/octet-stream"}).then(function(snap){return snap.ref.getDownloadURL()}).then(function(url){return pushMessage({type:mediaType,mediaUrl:url,audioUrl:mediaType==="audio"?url:null,text:""},previewText,msgRef)}).catch(function(err){showErrorToast((err&&err.message)||"Media upload failed.")});
        }
        document.getElementById("imgInput").addEventListener("change", function(e){
          var f=e.target.files[0];if(!f)return;
          compressChatImage(f,function(dataUrl){uploadChatBlob(dataUrlToBlob(dataUrl),"photo.jpg","image","📷 Photo")});e.target.value="";
        });
        var voiceBtn=document.getElementById("voiceBtn");
        if(voiceBtn&&window.ZevioRTC){voiceBtn.addEventListener("click",function(){window.ZevioRTC.toggle(voiceBtn,function(){voiceBtn.classList.add("recording")},function(blob){voiceBtn.classList.remove("recording");uploadChatBlob(blob,"voice.webm","audio","🎙️ Voice message")},function(msg){voiceBtn.classList.remove("recording");showErrorToast(msg)})});}

        // ---------- rendering ----------
        function redrawCore(){
          var op = userCache[otherUid] || other;
          var receiptsOn = (me.readReceipts!==false) && (op.readReceipts!==false);
          renderMessages(msgsEl, list, me.uid, otherLastRead, receiptsOn, {
            onReply: function(m){ composer.setReply(m); },
            onReact: function(m, btn){ pop.openNear(btn, function(emoji){
              if (!m._id) return;
              var patch = {}; patch["reactions."+me.uid] = emoji;
              chatRef.collection("messages").doc(m._id).update(patch).catch(function(err){ showErrorToast(err && err.message); });
            }); },
            onEdit: function(m){
              if (!m._id || m.from !== me.uid || m.deleted) return;
              var next = window.prompt("Edit message", m.text || "");
              if (next === null) return;
              next = next.trim(); if (!next) return;
              chatRef.collection("messages").doc(m._id).update({text:next, edited:true, editedAt:firebase.firestore.FieldValue.serverTimestamp()}).catch(function(err){ showErrorToast(err && err.message); });
            },
            onUnsend: function(m){
              if (!m._id || m.from !== me.uid || m.deleted) return;
              if (!window.confirm("Unsend this message for everyone?")) return;
              chatRef.collection("messages").doc(m._id).update({deleted:true, text:"", editedAt:firebase.firestore.FieldValue.serverTimestamp()}).catch(function(err){ showErrorToast(err && err.message); });
            }
          });
        }
        function redraw(){
          redrawCore();
          // renderMessages wipes the list, so put the typing bubble back if needed
          var typingNow = isTypingFresh(currentChatData.typing && currentChatData.typing[otherUid]);
          if (typingNow && !document.getElementById("typingRow")) {
            var row = document.createElement("div"); row.id = "typingRow";
            row.innerHTML = '<div class="typing-indicator"><div class="td"></div><div class="td"></div><div class="td"></div></div>';
            msgsEl.appendChild(row);
          }
        }

        // Mark incoming messages as read (clears unread badge + drives read receipts).
        // Only writes when there is something unread, so it can't loop.
        function markRead(){
          if (document.visibilityState !== "visible" || !currentChatData.members) return;
          var myUnread = (currentChatData.unread && currentChatData.unread[me.uid]) || 0;
          if (myUnread > 0) {
            chatRef.update({ ["lastRead."+me.uid]: firebase.firestore.FieldValue.serverTimestamp(), ["unread."+me.uid]: 0 }).catch(function(){});
          }
        }

        if (unsubMsgs) unsubMsgs();
        unsubMsgs = chatRef.collection("messages").orderBy("time").limitToLast(300).onSnapshot(function(snap){
          list = [];
          snap.forEach(function(d){ var x=d.data(); x._id=d.id; list.push(x); });
          redraw();
          markRead();
        }, function(err){ msgsEl.innerHTML = '<div class="error-text">'+esc(err.message)+'</div>'; });
        addDocListener("visibilitychange", markRead);

        function renderReqBanner(){
          var wrap = document.getElementById("reqBannerWrap");
          if (!wrap) return;
          var pendingIncoming = currentChatData.status==="pending" && currentChatData.requestedBy && currentChatData.requestedBy!==me.uid;
          if (!pendingIncoming) { wrap.innerHTML=""; return; }
          wrap.innerHTML =
            '<div class="req-banner"><p>@'+esc(other.username||"user")+' wants to message you. Accept to chat, or decline to remove this request.</p>' +
            '<div class="req-actions"><button class="accept" id="reqAccept">Accept</button><button id="reqDecline">Decline</button></div></div>';
          document.getElementById("reqAccept").addEventListener("click", function(){
            writeChat({ status:"accepted" });
          });
          document.getElementById("reqDecline").addEventListener("click", function(){
            writeChat({ deletedFor: kv(me.uid, true) }).then(function(){
              document.getElementById("appView").classList.remove("chat-open");
              document.getElementById("mainEl").innerHTML = EMPTY_MAIN;
              activeOther = null;
            });
          });
        }

        function renderBlockedNote(){
          var wrap = document.getElementById("blockedNoteWrap");
          if (!wrap) return;
          var iBlocked = currentChatData.blockedBy && currentChatData.blockedBy[me.uid];
          var theyBlocked = currentChatData.blockedBy && currentChatData.blockedBy[otherUid];
          if (iBlocked) wrap.innerHTML = '<div class="blocked-note">You blocked '+esc(displayName(other))+'. Unblock from the menu to send messages.</div>';
          else if (theyBlocked) wrap.innerHTML = '<div class="blocked-note">You can\'t reply to this conversation.</div>';
          else wrap.innerHTML = "";
          composer.setEnabled(!iBlocked && !theyBlocked);
        }

        if (unsubChat) unsubChat();
        unsubChat = chatRef.onSnapshot(function(doc){
          currentChatData = doc.data() || {};
          var sub = document.getElementById("threadSub");
          if (!sub) return;
          if (isTypingFresh(currentChatData.typing && currentChatData.typing[otherUid])) {
            sub.textContent = "Typing…";
            if (!document.getElementById("typingRow")) {
              var row=document.createElement("div"); row.id="typingRow";
              row.innerHTML='<div class="typing-indicator"><div class="td"></div><div class="td"></div><div class="td"></div></div>';
              msgsEl.appendChild(row); msgsEl.scrollTop = msgsEl.scrollHeight;
            }
          } else {
            var tr=document.getElementById("typingRow"); if(tr) tr.remove();
            sub.textContent = presenceLabel(userCache[otherUid]);
          }
          var lr = currentChatData.lastRead && currentChatData.lastRead[otherUid];
          var lrMs = timeMs(lr);
          if (lrMs && lrMs !== otherLastRead) { otherLastRead = lrMs; redraw(); }
          document.getElementById("mnuMute").textContent = (currentChatData.muted && currentChatData.muted[me.uid]) ? "Unmute notifications" : "Mute notifications";
          document.getElementById("mnuBlock").textContent = (currentChatData.blockedBy && currentChatData.blockedBy[me.uid]) ? "Unblock user" : "Block user";
          renderReqBanner();
          renderBlockedNote();
          markRead();
        }, function(err){
          if (window.console) console.error("Chat doc error:", err);
        });

        if (unsubOther) unsubOther();
        unsubOther = db.collection("users").doc(otherUid).onSnapshot(function(doc){
          if (!doc.exists) return;
          var prevRR = (userCache[otherUid] || {}).readReceipts;
          var p = doc.data(); p.uid = otherUid; userCache[otherUid] = p;
          var av = document.getElementById("threadAvatar");
          if (av) av.innerHTML = avatarHTML(p, "", true, canSeeActivity(p) && isOnline(p));
          var sub = document.getElementById("threadSub");
          if (sub && sub.textContent !== "Typing…") sub.textContent = presenceLabel(p);
          if (prevRR !== p.readReceipts) redraw();
          drawList();
        });
      });
    }

    function openProfileModal(profile, chatId, chatRef){
      var old = document.getElementById("settingsOverlay"); if (old) old.remove();
      var ov = document.createElement("div"); ov.id="settingsOverlay"; ov.className="settings-overlay";
      ov.innerHTML =
        '<div class="settings-modal" style="max-width:380px;text-align:center">' +
          '<div class="settings-head"><div class="settings-title">Profile</div><button class="settings-close" id="pClose">✕</button></div>' +
          '<div style="display:flex;justify-content:center">'+avatarHTML(profile,"big")+'</div>' +
          '<div class="profile-name" style="margin-top:10px">'+esc(displayName(profile))+'</div><div class="profile-handle">'+esc(profile.username||"user")+'</div>' +
          (profile.bio ? '<div class="profile-modal-bio">'+esc(profile.bio)+'</div>' : '') +
          '<div class="profile-actions" style="justify-content:center;margin-top:16px">' +
            '<button class="mini-btn danger" id="pBlock">Block / Unblock</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
      requestAnimationFrame(function(){ ov.classList.add("open"); });
      function close(){ ov.classList.remove("open"); setTimeout(function(){ if(ov.parentNode) ov.remove(); }, 140); }
      document.getElementById("pClose").addEventListener("click", close);
      ov.addEventListener("click", function(e){ if(e.target===ov) close(); });
      document.getElementById("pBlock").addEventListener("click", function(){
        chatRef.get().then(function(d){
          var data = d.exists ? d.data() : {};
          var blocked = !!(data.blockedBy && data.blockedBy[me.uid]);
          var names = {}; names[me.uid] = me.username; names[profile.uid] = profile.username || "user";
          return chatRef.set({
            members: [me.uid, profile.uid].sort(),
            names: names,
            blockedBy: kv(me.uid, !blocked)
          }, {merge:true});
        }).catch(function(err){ showErrorToast((err && err.message) || "Couldn't update block."); });
        close();
      });
    }

    function drawMeAvatar(){
      var el = document.getElementById("meAvatar");
      if (el) el.innerHTML = avatarHTML(me, "small");
    }

    // ---- settings ----
    function openSettings(){
      var theme = currentTheme();
      var mode = safeGet("Zevio_mode") || "auto";
      var old = document.getElementById("settingsOverlay"); if (old) old.remove();
      var ov = document.createElement("div");
      ov.id = "settingsOverlay"; ov.className = "settings-overlay";
      ov.innerHTML =
        '<div class="settings-modal">' +
          '<div class="settings-head"><div><div class="settings-title">Settings</div>' +
          '<div class="settings-sub">Only your username and picture are visible to others.</div></div>' +
          '<button class="settings-close" id="sClose">✕</button></div>' +

          '<div class="settings-section"><h3>Profile</h3>' +
            '<div class="profile-box"><div class="profile-big" id="sAvatar">' +
              (me.avatarMode==="photo" && me.photo ? '<img src="'+me.photo+'" alt="">' :
               me.avatarMode==="logo" ? logoArtHTML(me.logo) : esc(initials(me.username))) +
            '</div><div style="min-width:0;flex:1">' +
              '<div class="profile-name">'+esc(displayName(me))+'</div><div class="profile-handle">'+esc(me.username)+'</div>' +
              '<div class="profile-handle">Your email and phone stay private.</div>' +
              '<div class="profile-actions">' +
                '<label class="mini-btn">Choose photo<input id="sPhoto" type="file" accept="image/*" style="display:none"></label>' +
                '<button class="mini-btn" id="sInitials">Use initials</button>' +
                '<button class="mini-btn" id="sLogoMode">Use logo</button>' +
              '</div></div></div>' +
            '<textarea class="bio-field" id="sBio" rows="2" maxlength="80" placeholder="Add a short about / status (optional)">'+esc(me.bio||"")+'</textarea>' +
          '</div>' +

          '<div class="settings-section"><h3>Profile logos</h3><div class="logo-grid" id="logoGrid">' +
            LOGO_CHOICES.map(function(x){
              return '<button type="button" class="logo-choice '+(me.avatarMode==="logo"&&me.logo===x.id?"active":"")+'" data-logo="'+x.id+'">' +
                logoArtHTML(x.id)+'<span class="logo-label">'+esc(x.name)+'</span></button>';
            }).join("") + '</div></div>' +

          '<div class="settings-section"><h3>Privacy</h3>' +
            '<div class="toggle-row"><div class="toggle-copy"><div class="toggle-title">Activity status</div><div class="toggle-desc">Show your online status and last seen to others.</div></div>' +
              '<label class="switch"><input type="checkbox" id="tActivity" '+(me.showActivity!==false?"checked":"")+'><span class="switch-track"></span></label></div>' +
            '<div class="toggle-row"><div class="toggle-copy"><div class="toggle-title">Read receipts</div><div class="toggle-desc">Let others see when you\'ve read their messages.</div></div>' +
              '<label class="switch"><input type="checkbox" id="tReceipts" '+(me.readReceipts!==false?"checked":"")+'><span class="switch-track"></span></label></div>' +
          '</div>' +

          '<div class="settings-section"><h3>Notifications</h3>' +
            '<div class="toggle-row"><div class="toggle-copy"><div class="toggle-title">Desktop notifications</div><div class="toggle-desc">Get a system notification for new messages.</div></div>' +
              '<label class="switch"><input type="checkbox" id="tDesktop" '+(boolPref("Zevio_notif_desktop",false)?"checked":"")+'><span class="switch-track"></span></label></div>' +
            '<div class="toggle-row"><div class="toggle-copy"><div class="toggle-title">Notification sound</div><div class="toggle-desc">Play a sound for new messages.</div></div>' +
              '<label class="switch"><input type="checkbox" id="tSound" '+(boolPref("Zevio_notif_sound",true)?"checked":"")+'><span class="switch-track"></span></label></div>' +
          '</div>' +

          '<div class="settings-section"><h3>Appearance</h3>' +
            '<div class="seg" id="modeSeg">' + [["auto","Auto"],["light","Light"],["dark","Dark"]].map(function(m){
              return '<button type="button" class="seg-btn '+(mode===m[0]?"active":"")+'" data-mode="'+m[0]+'">'+m[1]+'</button>';
            }).join("") + '</div></div>' +

          '<div class="settings-section"><h3>Chat appearance</h3><div class="settings-sub">Changes the current conversation only. Your Zevio interface stays unchanged.</div>' +
            '<div class="theme-grid">' + themeCards(SOLID_THEMES, theme) + '</div></div>' +

          '<div class="settings-section"><h3>Anime scenes</h3>' +
            '<div class="theme-grid">' + themeCards(ANIME_THEMES, theme) + '</div></div>' +

          '<div class="settings-section"><button class="btn primary" id="sSignOut" style="width:100%;background:none;border:1.5px solid var(--border);color:var(--text-main)">Sign out</button></div>' +
        '</div>';
      document.body.appendChild(ov);
      requestAnimationFrame(function(){ ov.classList.add("open"); });

      function close(){ ov.classList.remove("open"); setTimeout(function(){ if(ov.parentNode) ov.remove(); }, 140); }
      document.getElementById("sClose").addEventListener("click", close);
      ov.addEventListener("click", function(e){ if(e.target===ov) close(); });
      document.getElementById("sSignOut").addEventListener("click", function(){
        close();
        stopPresence().then(function(){ auth.signOut(); });   // mark offline first, then sign out
      });

      var segs = ov.querySelectorAll(".seg-btn");
      for (var q=0;q<segs.length;q++) segs[q].addEventListener("click", function(){
        applyMode(this.getAttribute("data-mode"));
        for (var w=0;w<segs.length;w++) segs[w].classList.remove("active");
        this.classList.add("active");
      });

      var cards = ov.querySelectorAll(".theme-card");
      for (var i=0;i<cards.length;i++) cards[i].addEventListener("click", function(){
        applyTheme(this.getAttribute("data-theme"));
        for (var j=0;j<cards.length;j++) cards[j].classList.remove("active");
        this.classList.add("active");
      });

      function saveProfile(patch, previewHTML){
        for (var k in patch) me[k]=patch[k];
        userCache[me.uid] = me;
        db.collection("users").doc(me.uid).set(patch, {merge:true}).catch(function(err){
          showErrorToast((err && err.message) || "Couldn't save profile.");
        });
        if (previewHTML) document.getElementById("sAvatar").innerHTML = previewHTML;
        drawMeAvatar();
        drawList();
      }

      document.getElementById("sInitials").addEventListener("click", function(){
        saveProfile({ avatarMode:"initials" }, esc(initials(me.username)));
      });
      document.getElementById("sLogoMode").addEventListener("click", function(){
        saveProfile({ avatarMode:"logo", logo: me.logo||"nebula" }, logoArtHTML(me.logo||"nebula"));
      });
      var lbs = ov.querySelectorAll(".logo-choice");
      for (var z=0;z<lbs.length;z++) lbs[z].addEventListener("click", function(){
        var id=this.getAttribute("data-logo");
        for (var y=0;y<lbs.length;y++) lbs[y].classList.remove("active");
        this.classList.add("active");
        saveProfile({ avatarMode:"logo", logo:id }, logoArtHTML(id));
      });
      document.getElementById("sPhoto").addEventListener("change", function(e){
        var f=e.target.files[0]; if(!f) return;
        compressSquare(f, function(dataUrl){ saveProfile({ avatarMode:"photo", photo:dataUrl }, '<img src="'+dataUrl+'" alt="">'); });
      });
      document.getElementById("sName").addEventListener("change", function(){saveProfile({name:(this.value.trim().slice(0,40)||me.username)},null);});
      document.getElementById("sBio").addEventListener("change", function(){saveProfile({bio:this.value.trim().slice(0,80)},null);});
      document.getElementById("tActivity").addEventListener("change", function(){ saveProfile({ showActivity: this.checked }, null); });
      document.getElementById("tReceipts").addEventListener("change", function(){ saveProfile({ readReceipts: this.checked }, null); });
      document.getElementById("tSound").addEventListener("change", function(){ setBoolPref("Zevio_notif_sound", this.checked); });
      document.getElementById("tDesktop").addEventListener("change", function(){
        var box = this;
        if (box.checked && window.Notification && Notification.permission !== "granted") {
          Notification.requestPermission().then(function(perm){
            setBoolPref("Zevio_notif_desktop", perm==="granted");
            box.checked = perm==="granted";
          });
        } else {
          setBoolPref("Zevio_notif_desktop", box.checked);
        }
      });
    }
  }

  window.ZEVIO.esc=esc;
  window.ZEVIO.displayName=displayName;
  window.ZEVIO.initials=initials;
  window.ZEVIO.downloadMedia=downloadMedia;
  window.ZEVIO.openImageViewer=openImageViewer;

  // ================= PASSWORD RESET FLOW =================
  var resetQuery = (function(){
    try {
      var p = new URLSearchParams(window.location.search);
      return { mode:p.get("mode"), oobCode:p.get("oobCode") };
    } catch(e){ return {mode:null,oobCode:null}; }
  })();
  var resetMode = resetQuery.mode === "resetPassword" && !!resetQuery.oobCode;

  function renderPasswordReset(){
    root.innerHTML='<div class="auth-wrap"><div class="auth-layout" style="grid-template-columns:1fr;max-width:620px;min-height:auto"><section class="auth-side" style="padding:48px"><div class="auth-card">' +
      '<div class="auth-eyebrow">Zevio account security</div><h1>Choose a new password</h1><p class="lead">Set a new password for your account. This reset link is verified directly by Firebase Authentication.</p>' +
      '<label class="auth-form-label" for="newPass">New password</label><input class="field" id="newPass" type="password" placeholder="At least 6 characters" autocomplete="new-password">' +
      '<label class="auth-form-label" for="newPass2">Confirm password</label><input class="field" id="newPass2" type="password" placeholder="Repeat your password" autocomplete="new-password">' +
      '<div class="error-text" id="resetPageError"></div><button class="btn primary" id="confirmReset" style="width:100%">Update password</button>' +
      '<div class="switch-line"><a id="resetBack">Back to sign in</a></div></div></section></div></div>';
    var errEl=document.getElementById("resetPageError"), btn=document.getElementById("confirmReset");
    function fail(msg){errEl.textContent=msg;btn.disabled=false;btn.textContent="Update password";}
    auth.verifyPasswordResetCode(resetQuery.oobCode).catch(function(err){fail(friendlyAuthError(err)||"This reset link is invalid or has expired. Request a new one.");btn.disabled=true;});
    btn.addEventListener("click",function(){
      errEl.textContent=""; var a=document.getElementById("newPass").value, b=document.getElementById("newPass2").value;
      if(a.length<6)return fail("Password must be at least 6 characters.");
      if(a!==b)return fail("The passwords do not match.");
      btn.disabled=true;btn.textContent="Updating…";
      auth.confirmPasswordReset(resetQuery.oobCode,a).then(function(){
        try{window.history.replaceState({},document.title,window.location.pathname);}catch(e){}
        resetMode=false; root.innerHTML='<div class="auth-wrap"><div class="auth-layout" style="grid-template-columns:1fr;max-width:620px;min-height:auto"><section class="auth-side" style="padding:48px"><div class="auth-card"><div class="auth-eyebrow">Password updated</div><h1>You’re all set.</h1><p class="lead">Your Zevio password has been changed successfully. You can sign in with your new password now.</p><button class="btn primary" id="resetDone" style="width:100%">Return to sign in</button></div></section></div></div>';
        document.getElementById("resetDone").addEventListener("click",function(){renderAuth();});
      }).catch(function(err){fail(friendlyAuthError(err)||"Couldn’t update the password. Request a new reset link.");});
    });
    document.getElementById("resetBack").addEventListener("click",function(){try{window.history.replaceState({},document.title,window.location.pathname);}catch(e){}resetMode=false;renderAuth();});
  }

  // ================= BOOT =================
  function boot(){
    if(resetMode){ teardown(); me=null; userCache={}; renderPasswordReset(); return; }
    var user = auth.currentUser;
    if (!user) {
      teardown();
      me = null; userCache = {};
      document.title = APP_NAME;
      renderAuth();
      return;
    }
    root.innerHTML = '<div class="auth-wrap"><div class="auth-layout" style="grid-template-columns:1fr;max-width:620px;min-height:auto"><section class="auth-side"><div class="auth-card"><div class="auth-eyebrow">Zevio</div><h1>Loading your space…</h1><p class="lead">Connecting securely to your account.</p></div></section></div></div>';
    db.collection("users").doc(user.uid).get().then(function(doc){
      var data = doc.exists ? doc.data() : null;
      if (!data || !data.username) { renderUsernameSetup(user); return; }
      me = { uid:user.uid, name:data.name||data.username, username:data.username, photo:data.photo||null,
             avatarMode:data.avatarMode||"initials", logo:data.logo||"nebula",
             bio:data.bio||"", showActivity: data.showActivity!==false, readReceipts: data.readReceipts!==false };
      userCache[user.uid] = me;
      startPresence(user.uid);
      renderApp();
    }).catch(function(err){
      root.innerHTML = '<div class="auth-wrap"><div class="auth-card"><h1>Can\'t load your profile</h1>' +
        '<p class="lead">'+esc(friendlyAuthError(err))+'</p>' +
        '<button class="btn primary" id="retry" style="width:100%">Try again</button></div></div>';
      document.getElementById("retry").addEventListener("click", boot);
    });
  }

  auth.onAuthStateChanged(function(){
    if (resetMode) return;
    if (suppressBoot) return;   // signup is mid-way; it will call boot() itself
    boot();
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function(){ navigator.serviceWorker.register("sw.js").catch(function(e){ if(window.console) console.warn("PWA service worker:",e); }); });
  }
})();
