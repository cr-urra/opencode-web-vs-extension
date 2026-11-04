import * as assert from "assert/strict";
import { test } from "node:test";
import { createContext, runInContext } from "node:vm";
import { getOpenCodeClipboardScript } from "./opencodeClipboard";

// DOM mínimo para probar el protocolo asíncrono y el contenido resultante.
// No representa el renderizado ni el historial de undo de Chromium.
class TestEvent {
  clipboardData?: TestTransfer;
  inputType?: string;
  data?: string;
  key?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  defaultPrevented = false;
  constructor(public type: string, options: object = {}) { Object.assign(this, options); }
  preventDefault() { this.defaultPrevented = true; }
  stopImmediatePropagation() {}
}

class TestTransfer {
  values = new Map<string, string>();
  setData(type: string, value: string) { this.values.set(type, value); }
  getData(type: string) { return this.values.get(type) ?? ""; }
}

interface TextNode {
  textContent: string
  end?: number
}

interface Target {
  value?: string
  textContent: string
  selectionStart: number
  selectionEnd: number
  isContentEditable: boolean
  isConnected: boolean
  readOnly: boolean
  disabled: boolean
  focus(): void
  contains(node: unknown): boolean
  setSelectionRange(start: number, end: number): void
  dispatchEvent(event: TestEvent): boolean
}

class TestRange {
  startContainer: Target;
  endContainer: Target;
  constructor(public target: Target, public start: number, public end: number) {
    this.startContainer = this.endContainer = target;
  }
  cloneRange() { return new TestRange(this.target, this.start, this.end); }
  deleteContents() {
    this.target.textContent = this.target.textContent.slice(0, this.start) + this.target.textContent.slice(this.end);
    this.end = this.start;
  }
  insertNode(node: TextNode) {
    this.target.textContent = this.target.textContent.slice(0, this.start) + node.textContent + this.target.textContent.slice(this.start);
    node.end = this.start + node.textContent.length;
  }
  setStartAfter(node: TextNode) { this.start = node.end ?? this.start; }
  setEndAfter(node: TextNode) { this.end = node.end ?? this.end; }
  selectNodeContents(target: Target) {
    this.target = this.startContainer = this.endContainer = target;
    this.start = 0;
    this.end = target.textContent.length;
  }
  collapse(toStart: boolean) {
    if (toStart) { this.end = this.start; } else { this.start = this.end; }
  }
}

function createBridge(options: { mac?: boolean; pasteHandled?: boolean; execHandled?: boolean; pasteFails?: boolean; execFails?: boolean; postMessageFails?: boolean } = {}) {
  const messages: Array<{ source: string; id: string }> = [];
  const inputEvents: Array<{ target: Target; event: TestEvent }> = [];
  const logs: string[] = [];
  const listeners: Record<string, Array<(event: { data: unknown }) => void>> = {};
  const keyListeners: Array<(event: TestEvent) => void> = [];
  const timers = new Map<number, () => void>();
  let timerId = 0;
  let range: TestRange | null = null;
  let execCount = 0;
  const document = {
    activeElement: null as Target | null,
    body: null as Target | null,
    createRange: () => new TestRange(document.activeElement!, 0, 0),
    createTextNode: (textContent: string) => ({ textContent }),
    addEventListener: (type: string, callback: (event: TestEvent) => void) => {
      if (type === "keydown") { keyListeners.push(callback); }
    },
    execCommand: (_command: string, _show: boolean, text: string) => {
      execCount++;
      if (options.execFails) { throw new Error("insertText unavailable"); }
      if (!options.execHandled) { return false; }
      replaceSelection(document.activeElement!, text);
      return true;
    },
  };
  const selection = {
    get rangeCount() { return range ? 1 : 0; },
    getRangeAt: (_index: number) => { if (!range) { throw new Error("No range"); } return range; },
    removeAllRanges: () => { range = null; },
    addRange: (next: TestRange) => { range = next; },
  };
  function replaceSelection(target: Target, text: string) {
    if (typeof target.value === "string") {
      const start = target.selectionStart;
      target.value = target.value.slice(0, start) + text + target.value.slice(target.selectionEnd);
      target.selectionStart = target.selectionEnd = start + text.length;
    } else if (range) {
      range.deleteContents();
      const node = { textContent: text };
      range.insertNode(node);
      range.setStartAfter(node);
      range.setEndAfter(node);
    }
  }
  function makeTarget(text: string, editable = false): Target {
    const target: Target = {
      ...(editable ? {} : { value: text }), textContent: text,
      selectionStart: text.length, selectionEnd: text.length,
      isContentEditable: editable, isConnected: true, readOnly: false, disabled: false,
      focus() {
        document.activeElement = target;
        if (editable) { range = new TestRange(target, target.textContent.length, target.textContent.length); }
      },
      contains: node => node === target,
      setSelectionRange(start, end) { target.selectionStart = start; target.selectionEnd = end; },
      dispatchEvent(event) {
        if (event.type === "paste" && options.pasteFails) { throw new Error("paste unavailable"); }
        if (event.type === "paste" && options.pasteHandled !== false) {
          replaceSelection(target, event.clipboardData?.getData("text/plain") ?? "");
          return false;
        }
        if (event.type === "input") { inputEvents.push({ target, event }); }
        return true;
      },
    };
    return target;
  }
  document.body = makeTarget("");
  document.activeElement = document.body;
  const context = createContext({
    document, macPasteFallback: options.mac ?? true,
    report: (message: string) => logs.push(message),
    textTarget: () => document.activeElement ?? document.body,
    window: {
      parent: { postMessage: (message: { source: string; id: string }) => {
        if (options.postMessageFails) { throw new Error("disposed bridge"); }
        messages.push(message);
      } },
      addEventListener: (type: string, callback: (event: { data: unknown }) => void) => {
        (listeners[type] ??= []).push(callback);
      },
      getSelection: () => selection,
    },
    DataTransfer: TestTransfer, ClipboardEvent: TestEvent, InputEvent: TestEvent,
    setTimeout: (callback: () => void) => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  runInContext(getOpenCodeClipboardScript() + "\ninstallPasteBridge();", context);
  return {
    makeInput: (text = "") => makeTarget(text),
    makeEditable: (text: string, start: number, end = start) => {
      const target = makeTarget(text, true);
      target.focus();
      range = new TestRange(target, start, end);
      return target;
    },
    request: () => runInContext("requestClipboardText()", context) as string,
    respond(id: string, text: string, error?: string) {
      for (const callback of listeners.message ?? []) {
        callback({ data: { source: "opencode-clipboard-read-result", id, text, error } });
      }
    },
    pressPaste() {
      const event = new TestEvent("keydown", { key: "v", metaKey: true });
      for (const callback of keyListeners) { callback(event); }
      return event;
    },
    expire() {
      for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
    },
    clearSelection() { range = null; },
    messages, inputEvents, logs, timers,
    get range() { return range; },
    get execCount() { return execCount; },
  };
}

test("pastes into the original input and selection after focus and caret change", () => {
  const bridge = createBridge();
  const first = bridge.makeInput("ANTESQUITARDESPUES");
  const other = bridge.makeInput("otro");
  first.focus();
  first.setSelectionRange(5, 11);
  const id = bridge.request();
  first.setSelectionRange(0, 0);
  other.focus();
  bridge.respond(id, "ñ\nlínea");
  assert.equal(first.value, "ANTESñ\nlíneaDESPUES");
  assert.equal(other.value, "otro");
  assert.equal(first.selectionStart, 12);
});

test("restores the original contenteditable range before the frontend handles plain text paste", () => {
  const bridge = createBridge();
  const target = bridge.makeEditable("ANTESQUITARDESPUES", 5, 11);
  const id = bridge.request();
  bridge.makeInput("otro").focus();
  bridge.respond(id, "<b>ñ</b>\nlínea");
  assert.equal(target.textContent, "ANTES<b>ñ</b>\nlíneaDESPUES");
  assert.equal(bridge.range?.start, 19);
  assert.equal(bridge.range?.end, 19);
  assert.equal(bridge.inputEvents.length, 0);
  assert.equal(bridge.execCount, 0);
});

test("keeps selected input text unchanged when paste and execCommand both reject insertion", () => {
  const bridge = createBridge({ pasteHandled: false });
  const target = bridge.makeInput("ANTESQUITARDESPUES");
  target.focus();
  target.setSelectionRange(5, 11);
  const id = bridge.request();
  bridge.makeInput("otro").focus();
  bridge.respond(id, "ñ\nlínea");
  assert.equal(target.value, "ANTESQUITARDESPUES");
  assert.equal(target.selectionStart, 5);
  assert.equal(target.selectionEnd, 11);
  assert.equal(bridge.inputEvents.length, 0);
  assert.equal(bridge.execCount, 1);
  assert.equal(bridge.logs.at(-1), "clipboard text could not be inserted");
  assert.equal(bridge.timers.size, 0);
});

test("keeps contenteditable text and range unchanged when both insertion paths reject", () => {
  const bridge = createBridge({ pasteHandled: false });
  const target = bridge.makeEditable("ANTESQUITARDESPUES", 5, 11);
  const id = bridge.request();
  bridge.makeInput("otro").focus();
  bridge.respond(id, "<b>ñ</b>\nlínea");
  assert.equal(target.textContent, "ANTESQUITARDESPUES");
  assert.equal(bridge.range?.start, 5);
  assert.equal(bridge.range?.end, 11);
  assert.equal(bridge.inputEvents.length, 0);
  assert.equal(bridge.execCount, 1);
  assert.equal(bridge.logs.at(-1), "clipboard text could not be inserted");
});

test("uses execCommand with the restored contenteditable selection if paste is not handled", () => {
  const bridge = createBridge({ pasteHandled: false, execHandled: true });
  const target = bridge.makeEditable("ANTESQUITARDESPUES", 5, 11);
  const id = bridge.request();
  bridge.makeInput("otro").focus();
  bridge.respond(id, "<b>ñ</b>\nlínea");
  assert.equal(target.textContent, "ANTES<b>ñ</b>\nlíneaDESPUES");
  assert.equal(bridge.range?.start, 19);
  assert.equal(bridge.range?.end, 19);
  assert.equal(bridge.inputEvents.length, 0);
  assert.equal(bridge.execCount, 1);
});

test("can use execCommand after dispatching paste throws", () => {
  const bridge = createBridge({ pasteFails: true, execHandled: true });
  const target = bridge.makeInput("AB");
  target.focus();
  target.setSelectionRange(1, 1);
  bridge.respond(bridge.request(), "X");
  assert.equal(target.value, "AXB");
  assert.equal(bridge.execCount, 1);
  assert.equal(bridge.inputEvents.length, 0);
  assert.ok(bridge.logs.some(log => log.includes("clipboard paste event failed:")));
});

test("does not directly change an input if both paste and execCommand throw", () => {
  const bridge = createBridge({ pasteFails: true, execFails: true });
  const target = bridge.makeInput("AB");
  target.focus();
  target.setSelectionRange(0, 2);
  const id = bridge.request();
  bridge.respond(id, "X");
  bridge.respond(id, "duplicate");
  assert.equal(target.value, "AB");
  assert.equal(target.selectionStart, 0);
  assert.equal(target.selectionEnd, 2);
  assert.equal(bridge.execCount, 1);
  assert.equal(bridge.inputEvents.length, 0);
  assert.equal(bridge.timers.size, 0);
  assert.equal(bridge.logs.at(-1), "clipboard text could not be inserted");
});

test("does not directly change contenteditable if execCommand throws after unhandled paste", () => {
  const bridge = createBridge({ pasteHandled: false, execFails: true });
  const target = bridge.makeEditable("AB", 0, 2);
  bridge.respond(bridge.request(), "X");
  assert.equal(target.textContent, "AB");
  assert.equal(bridge.range?.start, 0);
  assert.equal(bridge.range?.end, 2);
  assert.equal(bridge.inputEvents.length, 0);
  assert.equal(bridge.logs.at(-1), "clipboard text could not be inserted");
});

test("does not apply an already consumed clipboard response twice", () => {
  const bridge = createBridge();
  const target = bridge.makeInput();
  target.focus();
  const id = bridge.request();
  bridge.respond(id, "una vez");
  bridge.respond(id, "una vez");
  assert.equal(target.value, "una vez");
});

test("ignores unsolicited clipboard responses", () => {
  const bridge = createBridge();
  const target = bridge.makeInput("original");
  target.focus();
  bridge.respond("unknown", "no");
  assert.equal(target.value, "original");
});

test("keeps two rapid independent pastes without a time based suppression window", () => {
  const bridge = createBridge();
  const target = bridge.makeInput();
  target.focus();
  const first = bridge.request();
  bridge.respond(first, "uno");
  const second = bridge.request();
  bridge.respond(second, "dos");
  assert.notEqual(first, second);
  assert.equal(target.value, "unodos");
});

test("handles two rapid native paste shortcuts as independent requests", () => {
  const bridge = createBridge();
  const target = bridge.makeInput("AB");
  target.focus();
  target.setSelectionRange(1, 1);
  assert.equal(bridge.pressPaste().defaultPrevented, true);
  assert.equal(bridge.pressPaste().defaultPrevented, true);
  assert.equal(bridge.messages.length, 2);
  assert.notEqual(bridge.messages[0].id, bridge.messages[1].id);
  bridge.respond(bridge.messages[0].id, "X");
  bridge.respond(bridge.messages[1].id, "X");
  assert.equal(target.value, "AXXB");
  assert.equal(bridge.timers.size, 0);
});

test("correlates out of order clipboard replies to their respective inputs", () => {
  const bridge = createBridge();
  const first = bridge.makeInput("A");
  const second = bridge.makeInput("B");
  first.focus();
  const a = bridge.request();
  second.focus();
  const b = bridge.request();
  bridge.respond(b, "2");
  bridge.respond(a, "1");
  assert.equal(first.value, "A1");
  assert.equal(second.value, "B2");
});

test("does not fall back after the frontend handles the paste event", () => {
  const bridge = createBridge({ pasteHandled: true });
  const target = bridge.makeInput("AB");
  target.focus();
  target.setSelectionRange(1, 1);
  const id = bridge.request();
  bridge.respond(id, "X");
  assert.equal(target.value, "AXB");
  assert.equal(bridge.execCount, 0);
});

test("does not manually insert twice when execCommand handles insertion", () => {
  const bridge = createBridge({ pasteHandled: false, execHandled: true });
  const target = bridge.makeInput("AB");
  target.focus();
  target.setSelectionRange(1, 1);
  bridge.respond(bridge.request(), "X");
  assert.equal(target.value, "AXB");
  assert.equal(bridge.inputEvents.length, 0);
});

test("does not redirect a paste when the captured target has been detached", () => {
  const bridge = createBridge();
  const target = bridge.makeInput("original");
  const other = bridge.makeInput("otro");
  target.focus();
  const id = bridge.request();
  target.isConnected = false;
  other.focus();
  bridge.respond(id, "no");
  assert.equal(target.value, "original");
  assert.equal(other.value, "otro");
});

test("does not manually modify a read only input", () => {
  const bridge = createBridge();
  const target = bridge.makeInput("original");
  target.focus();
  const id = bridge.request();
  target.readOnly = true;
  bridge.respond(id, "no");
  assert.equal(target.value, "original");
});

test("does not modify an input that became disabled while awaiting the clipboard", () => {
  const bridge = createBridge();
  const target = bridge.makeInput("original");
  target.focus();
  const id = bridge.request();
  target.disabled = true;
  bridge.respond(id, "no");
  assert.equal(target.value, "original");
});

test("does not insert into a contenteditable target after editing has been disabled", () => {
  const bridge = createBridge({ execHandled: true });
  const target = bridge.makeEditable("original", 3);
  const id = bridge.request();
  target.isContentEditable = false;
  bridge.respond(id, "no");
  assert.equal(target.textContent, "original");
  assert.equal(bridge.execCount, 0);
});

test("keeps selected input text when the clipboard is empty", () => {
  const bridge = createBridge();
  const target = bridge.makeInput("original");
  target.focus();
  target.setSelectionRange(0, 8);
  bridge.respond(bridge.request(), "");
  assert.equal(target.value, "original");
  assert.equal(bridge.inputEvents.length, 0);
});

test("keeps selected contenteditable text when the clipboard is empty", () => {
  const bridge = createBridge();
  const target = bridge.makeEditable("original", 0, 8);
  bridge.respond(bridge.request(), "");
  assert.equal(target.textContent, "original");
  assert.equal(bridge.inputEvents.length, 0);
});

test("lets the frontend paste into the focused original editable when no selection was captured", () => {
  const bridge = createBridge();
  const target = bridge.makeEditable("original", 0);
  bridge.clearSelection();
  const id = bridge.request();
  bridge.makeInput("otro").focus();
  bridge.clearSelection();
  bridge.respond(id, "ñ");
  assert.equal(target.textContent, "originalñ");
});

test("releases clipboard requests when the parent bridge cannot receive messages", () => {
  const bridge = createBridge({ postMessageFails: true });
  const target = bridge.makeInput("original");
  target.focus();
  const id = bridge.request();
  bridge.respond(id, "no");
  assert.equal(target.value, "original");
  assert.equal(bridge.timers.size, 0);
});

test("releases expired clipboard requests and ignores late responses", () => {
  const bridge = createBridge();
  const target = bridge.makeInput();
  target.focus();
  const id = bridge.request();
  bridge.expire();
  bridge.respond(id, "tarde");
  assert.equal(target.value, "");
  assert.equal(bridge.timers.size, 0);
});

test("cleans up failed clipboard requests without mutating the prompt", () => {
  const bridge = createBridge();
  const target = bridge.makeInput("original");
  target.focus();
  bridge.respond(bridge.request(), "", "clipboard unavailable");
  assert.equal(target.value, "original");
  assert.equal(bridge.timers.size, 0);
});

test("keeps native keyboard handling on non macOS platforms", () => {
  const bridge = createBridge({ mac: false });
  const event = bridge.pressPaste();
  assert.equal(event.defaultPrevented, false);
  assert.equal(bridge.messages.length, 0);
});

test("does not use the legacy append endpoint as a paste fallback", () => {
  const bridge = createBridge();
  bridge.makeEditable("AB", 1);
  bridge.respond(bridge.request(), "X");
  assert.equal(bridge.messages.some(m => m.source === "opencode-paste-clipboard"), false);
});
