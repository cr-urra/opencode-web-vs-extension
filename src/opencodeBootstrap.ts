import type { OpenCodeUiGeneration } from "./opencodeCompatibility"

export interface OpenCodePersistedWorkspaceState {
  tabs: Array<Record<string, unknown>>
  recent?: { key: string }
}

const MAX_PERSISTED_WORKSPACE_STATE_BYTES = 1_000_000
const MAX_PERSISTED_TABS = 100

export function sanitizeOpenCodeWorkspaceState(value: unknown): OpenCodePersistedWorkspaceState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return
  }

  let cloned: { tabs?: unknown; recent?: unknown }
  try {
    const serialized = JSON.stringify(value)
    if (serialized.length > MAX_PERSISTED_WORKSPACE_STATE_BYTES) {
      return
    }
    cloned = JSON.parse(serialized) as { tabs?: unknown; recent?: unknown }
  } catch {
    return
  }

  if (!Array.isArray(cloned.tabs) || cloned.tabs.length > MAX_PERSISTED_TABS) {
    return
  }

  const tabs = cloned.tabs.filter((tab): tab is Record<string, unknown> => {
    if (!tab || typeof tab !== "object" || Array.isArray(tab)) {
      return false
    }
    const candidate = tab as Record<string, unknown>
    return (candidate.type === "draft" && typeof candidate.draftID === "string")
      || (candidate.type === "session" && typeof candidate.sessionId === "string")
  })
  if (tabs.length !== cloned.tabs.length) {
    return
  }

  const recentCandidate = cloned.recent as { key?: unknown } | undefined
  const recent = typeof recentCandidate?.key === "string" ? { key: recentCandidate.key } : undefined
  return { tabs, ...(recent ? { recent } : {}) }
}

export function getOpenCodeWorkspaceStateScript(directory: string | undefined, generation: OpenCodeUiGeneration, persistedState?: OpenCodePersistedWorkspaceState) {
  return String.raw`(function(){
  var dir=${JSON.stringify(directory)};
  var generation=${JSON.stringify(generation)};
  var persistedState=${JSON.stringify(persistedState ?? null)};
  function stateReport(message){try{if(typeof report==="function")report(message)}catch(error){}}
  function readState(key,fallback){try{var value=JSON.parse(localStorage.getItem(key)||"null");return value===null?fallback:value}catch(error){return fallback}}
  function writeState(key,value){localStorage.setItem(key,JSON.stringify(value))}
  function pathKey(value){var normalized=String(value||"").replace(/\\/g,"/");if(normalized.length>1)normalized=normalized.replace(/\/+$/g,"");return /^[A-Za-z]:\//.test(normalized)?normalized.toLowerCase():normalized}
  function samePath(left,right){return pathKey(left)===pathKey(right)}
  function newDraftID(){try{if(globalThis.crypto&&typeof globalThis.crypto.randomUUID==="function")return globalThis.crypto.randomUUID()}catch(error){}return String(Date.now())+"-"+Math.random().toString(16).slice(2)}
  if(!dir)return;
  try{
    var serverStorageKey="opencode.global.dat:server";
    var serverState=readState(serverStorageKey,{});
    if(!serverState||typeof serverState!=="object"||Array.isArray(serverState))serverState={};
    var projects=serverState.projects&&typeof serverState.projects==="object"&&!Array.isArray(serverState.projects)?serverState.projects:{};
    var local=Array.isArray(projects.local)?projects.local.filter(function(project){return project&&typeof project.worktree==="string"&&!samePath(project.worktree,dir)}):[];
    projects.local=[{worktree:dir,expanded:true}].concat(local);
    serverState.list=Array.isArray(serverState.list)?serverState.list:[];
    serverState.projects=projects;
    serverState.lastProject=Object.assign({},serverState.lastProject,{local:dir});
    writeState(serverStorageKey,serverState);
    stateReport("seeded "+serverStorageKey+" local="+projects.local.map(function(project){return project.worktree}).join(","));

    if(generation!=="v2")return;
    var server=location.origin;
    var layoutStorageKey="opencode.global.dat:layout";
    var layout=readState(layoutStorageKey,{});
    if(!layout||typeof layout!=="object"||Array.isArray(layout))layout={};
    var home=layout.home&&typeof layout.home==="object"&&!Array.isArray(layout.home)?layout.home:{};
    home.selection={server:server,directory:dir};
    layout.home=home;
    writeState(layoutStorageKey,layout);

    function encodeRouteValue(value){var bytes=new TextEncoder().encode(String(value));var binary=Array.from(bytes,function(byte){return String.fromCharCode(byte)}).join("");return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"")}
    function tabKey(tab){if(tab.type==="draft")return "draft:"+tab.draftID;if(tab.type==="session")return tab.server+"\n"+tab.sessionId}
    function belongsToWorkspace(tab){return !!tab&&tab.server===server&&((tab.type==="draft"&&typeof tab.draftID==="string"&&samePath(tab.directory,dir))||(tab.type==="session"&&typeof tab.sessionId==="string"))}
    function restoreTab(tab){if(!tab||typeof tab!=="object")return;if(tab.type==="draft"&&typeof tab.draftID==="string")return Object.assign({},tab,{server:server,directory:dir});if(tab.type==="session"&&typeof tab.sessionId==="string")return Object.assign({},tab,{server:server})}
    function restoreRecentKey(key,tabs){if(typeof key!=="string")return;if(key.indexOf("draft:")===0&&tabs.some(function(tab){return tabKey(tab)===key}))return key;var separator=key.lastIndexOf("\n");var sessionId=separator>=0?key.slice(separator+1):"";var restoredKey=server+"\n"+sessionId;return sessionId&&tabs.some(function(tab){return tabKey(tab)===restoredKey})?restoredKey:undefined}
    var tabsStorageKey="opencode.window.browser.dat:tabs";
    var recentStorageKey="opencode.window.browser.dat:tabs.recent";
    var storedTabs=readState(tabsStorageKey,[]);
    if(!Array.isArray(storedTabs))storedTabs=[];
    if(!storedTabs.length&&persistedState&&Array.isArray(persistedState.tabs)){
      var restoredTabs=persistedState.tabs.map(restoreTab).filter(Boolean);
      if(restoredTabs.length){
        writeState(tabsStorageKey,restoredTabs);
        var restoredRecent=restoreRecentKey(persistedState.recent&&persistedState.recent.key,restoredTabs);
        if(restoredRecent)writeState(recentStorageKey,{key:restoredRecent});
        stateReport("restored "+restoredTabs.length+" workspace tabs");
      }
    }

    if(location.pathname==="/"||location.pathname==="/app"){
      var tabs=readState(tabsStorageKey,[]);
      if(!Array.isArray(tabs))tabs=[];
      var recent=readState(recentStorageKey,{});
      if(!recent||typeof recent!=="object"||Array.isArray(recent))recent={};
      var selected=typeof recent.key==="string"?tabs.find(function(tab){return belongsToWorkspace(tab)&&tabKey(tab)===recent.key}):undefined;
      if(!selected){for(var index=tabs.length-1;index>=0;index--){if(belongsToWorkspace(tabs[index])){selected=tabs[index];break}}}
      if(!selected){selected={type:"draft",draftID:newDraftID(),server:server,directory:dir};tabs.push(selected);writeState(tabsStorageKey,tabs)}
      var selectedKey=tabKey(selected);
      writeState(recentStorageKey,{key:selectedKey});

      var next=new URL(location.href);
      next.searchParams.delete("draftId");
      if(selected.type==="draft"){next.pathname="/new-session";next.searchParams.set("draftId",selected.draftID)}
      else{next.pathname="/"+encodeRouteValue(dir)+"/session/"+encodeURIComponent(selected.sessionId)}
      next.hash="";
      history.replaceState(history.state,"",next.pathname+next.search);
      stateReport("selected workspace "+dir+" and tab "+selectedKey);
    }

    var lastSavedState="";
    function saveWorkspaceState(){
      try{
        var savedTabs=readState(tabsStorageKey,[]);if(!Array.isArray(savedTabs))savedTabs=[];savedTabs=savedTabs.filter(belongsToWorkspace);
        var savedRecent=readState(recentStorageKey,{});if(!savedRecent||typeof savedRecent!=="object"||Array.isArray(savedRecent))savedRecent={};
        var savedKey=typeof savedRecent.key==="string"&&savedTabs.some(function(tab){return tabKey(tab)===savedRecent.key})?savedRecent.key:undefined;
        var state={tabs:savedTabs,recent:savedKey?{key:savedKey}:{}};var serialized=JSON.stringify(state);if(serialized===lastSavedState)return;lastSavedState=serialized;
        if(typeof window!=="undefined"&&window.parent)window.parent.postMessage({source:"opencode-workspace-state",state:state},"*");
      }catch(error){stateReport("workspace state save failed: "+(error&&error.message?error.message:String(error)))}
    }
    saveWorkspaceState();
    if(typeof setInterval==="function")setInterval(saveWorkspaceState,250);
    if(typeof window!=="undefined"&&typeof window.addEventListener==="function"){window.addEventListener("pagehide",saveWorkspaceState);window.addEventListener("beforeunload",saveWorkspaceState)}
  }catch(error){stateReport("workspace state seed failed: "+(error&&error.message?error.message:String(error)))}
})();`
}
