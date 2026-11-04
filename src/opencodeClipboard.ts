export function getOpenCodeClipboardScript() {
  return String.raw`
  var pendingClipboardReads=Object.create(null);
  var clipboardReadSequence=0;
  function captureClipboardTarget(){
    var target=textTarget();
    var snapshot={target:target,start:null,end:null,range:null};
    if(target&&typeof target.value==="string"){
      if(typeof target.selectionStart==="number")snapshot.start=target.selectionStart;
      if(typeof target.selectionEnd==="number")snapshot.end=target.selectionEnd;
    }else if(target&&target.isContentEditable&&window.getSelection){
      try{
        var selection=window.getSelection();
        var range=selection&&selection.rangeCount?selection.getRangeAt(0):null;
        if(range&&target.contains(range.startContainer)&&target.contains(range.endContainer))snapshot.range=range.cloneRange();
      }catch(error){report("clipboard selection capture failed: "+(error&&error.message?error.message:String(error)))}
    }
    return snapshot
  }
  function requestClipboardText(){
    var id=String(Date.now())+"-"+String(++clipboardReadSequence);
    var snapshot=captureClipboardTarget();
    pendingClipboardReads[id]=snapshot;
    snapshot.timer=setTimeout(function(){
      delete pendingClipboardReads[id];
      report("clipboard read request expired: "+id)
    },10000);
    try{
      window.parent.postMessage({source:"opencode-clipboard-read",id:id},"*");
      report("requested clipboard text: "+id)
    }catch(error){
      clearTimeout(snapshot.timer);
      delete pendingClipboardReads[id];
      report("clipboard text request failed: "+(error&&error.message?error.message:String(error)))
    }
    return id
  }
  function restoreClipboardTarget(snapshot){
    var target=snapshot.target;
    if(!target||target.isConnected===false||target.readOnly||target.disabled)return false;
    if(typeof target.value!=="string"&&!target.isContentEditable)return false;
    try{
      if(typeof target.focus==="function")target.focus();
      if(typeof snapshot.start==="number"&&typeof snapshot.end==="number"){
        if(typeof target.setSelectionRange==="function")target.setSelectionRange(snapshot.start,snapshot.end);
        else{target.selectionStart=snapshot.start;target.selectionEnd=snapshot.end}
      }else if(snapshot.range&&window.getSelection){
        var range=snapshot.range;
        if(target.contains(range.startContainer)&&target.contains(range.endContainer)){
          var selection=window.getSelection();
          if(selection){selection.removeAllRanges();selection.addRange(range)}
        }
      }
      return true
    }catch(error){
      report("clipboard selection restore failed: "+(error&&error.message?error.message:String(error)));
      return false
    }
  }
  function insertClipboardText(text,snapshot){
    if(!text)return;
    snapshot=snapshot||captureClipboardTarget();
    var target=snapshot.target;
    if(!restoreClipboardTarget(snapshot)){report("clipboard target is no longer editable");return}
    try{
      var dataTransfer=new DataTransfer();
      dataTransfer.setData("text/plain",text);
      var pasteEvent=new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData:dataTransfer});
      if(!target.dispatchEvent(pasteEvent)){report("clipboard paste event handled: "+String(text).length+" chars");return}
    }catch(error){report("clipboard paste event failed: "+(error&&error.message?error.message:String(error)))}
    try{
      if(document.execCommand&&document.execCommand("insertText",false,text)){report("clipboard inserted with execCommand: "+String(text).length+" chars");return}
    }catch(error){report("clipboard execCommand failed: "+(error&&error.message?error.message:String(error)))}
    report("clipboard text could not be inserted")
  }
  function installPasteBridge(){
    if(!macPasteFallback){report("paste bridge skipped on non-macOS");return}
    window.addEventListener("message",function(event){
      var data=event.data;
      if(!data||data.source!=="opencode-clipboard-read-result"||typeof data.id!=="string")return;
      var snapshot=pendingClipboardReads[data.id];
      if(!snapshot)return;
      delete pendingClipboardReads[data.id];
      clearTimeout(snapshot.timer);
      if(data.error){report("clipboard read result failed: "+data.error);return}
      insertClipboardText(String(data.text||""),snapshot)
    });
    document.addEventListener("keydown",function(event){
      var key=String(event.key||"").toLowerCase();
      if(key!=="v"||(!event.metaKey&&!event.ctrlKey)||event.altKey)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      requestClipboardText()
    },true);
    report("paste bridge installed")
  }
`;
}
