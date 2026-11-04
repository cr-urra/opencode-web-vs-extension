// Commands can arrive before the frontend mounts its editable prompt.
export function getOpenCodePromptQueueScript() {
  return String.raw`
  var pendingPromptActions=[];
  var promptActionTimer;
  function schedulePromptActions(delay){if(promptActionTimer!==undefined)return;promptActionTimer=setTimeout(flushPromptActions,delay)}
  function queueOpenCodePromptAction(action){pendingPromptActions.push({action:action,deadline:Date.now()+10000});schedulePromptActions(0)}
  function flushPromptActions(){
    promptActionTimer=undefined;
    while(pendingPromptActions.length&&pendingPromptActions[0].deadline<=Date.now()){pendingPromptActions.shift();report("prompt command expired before editor became ready")}
    if(!pendingPromptActions.length)return;
    var target=document.querySelector('[contenteditable="true"][aria-label="Prompt"],textarea[aria-label="Prompt"]')||document.querySelector('[contenteditable="true"],textarea');
    if(!target||target.isConnected===false||(!target.isContentEditable&&target.tagName!=="TEXTAREA")){schedulePromptActions(50);return}
    var entry=pendingPromptActions.shift();
    try{entry.action(target)}catch(error){report("prompt command failed: "+(error&&error.message?error.message:String(error)))}
    if(pendingPromptActions.length)schedulePromptActions(0);
  }`;
}
