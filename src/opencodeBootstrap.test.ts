import * as assert from "assert/strict"
import { runInNewContext } from "node:vm"
import { test } from "node:test"
import { TextEncoder } from "node:util"
import { getOpenCodeWorkspaceStateScript, sanitizeOpenCodeWorkspaceState, type OpenCodePersistedWorkspaceState } from "./opencodeBootstrap"

function runBootstrap(generation: "legacy" | "v2", initial: Record<string, string> = {}, persistedState?: OpenCodePersistedWorkspaceState) {
  const storage = new Map(Object.entries(initial))
  const historyCalls: string[] = []
  const messages: unknown[] = []
  const context = {
    URL,
    TextEncoder,
    btoa: (value: string) => Buffer.from(value, "binary").toString("base64"),
    Date,
    Math,
    globalThis: { crypto: { randomUUID: () => "draft-123" } },
    history: {
      state: null,
      replaceState: (_state: unknown, _title: string, url: string) => historyCalls.push(url),
    },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    location: {
      href: "http://127.0.0.1:4567/?auth_token=encoded",
      origin: "http://127.0.0.1:4567",
      pathname: "/",
    },
    window: {
      parent: { postMessage: (message: unknown) => messages.push(message) },
      addEventListener: () => undefined,
    },
  }

  const script = getOpenCodeWorkspaceStateScript("/workspace/root", generation, persistedState)
  runInNewContext(script, context)
  return { storage, historyCalls, messages, script }
}

test("keeps the legacy project registry behavior", () => {
  const result = runBootstrap("legacy")
  const server = JSON.parse(result.storage.get("opencode.global.dat:server") ?? "{}")

  assert.equal(server.projects.local[0].worktree, "/workspace/root")
  assert.equal(server.lastProject.local, "/workspace/root")
  assert.equal(result.storage.has("opencode.global.dat:layout"), false)
  assert.deepEqual(result.historyCalls, [])
})

test("selects and opens the workspace draft in OpenCode v2", () => {
  const result = runBootstrap("v2")
  const layout = JSON.parse(result.storage.get("opencode.global.dat:layout") ?? "{}")
  const tabs = JSON.parse(result.storage.get("opencode.window.browser.dat:tabs") ?? "[]")
  const recent = JSON.parse(result.storage.get("opencode.window.browser.dat:tabs.recent") ?? "{}")

  assert.deepEqual(layout.home.selection, {
    server: "http://127.0.0.1:4567",
    directory: "/workspace/root",
  })
  assert.deepEqual(tabs, [{
    type: "draft",
    draftID: "draft-123",
    server: "http://127.0.0.1:4567",
    directory: "/workspace/root",
  }])
  assert.equal(recent.key, "draft:draft-123")
  assert.deepEqual(result.historyCalls, ["/new-session?auth_token=encoded&draftId=draft-123"])
})

test("restores the recent v2 session without creating a new draft", () => {
  const server = "http://127.0.0.1:4567"
  const sessionTab = {
    type: "session",
    server,
    sessionId: "ses-123",
  }
  const result = runBootstrap("v2", {
    "opencode.window.browser.dat:tabs": JSON.stringify([sessionTab]),
    "opencode.window.browser.dat:tabs.recent": JSON.stringify({ key: server + "\n" + sessionTab.sessionId }),
  })
  const tabs = JSON.parse(result.storage.get("opencode.window.browser.dat:tabs") ?? "[]")
  const recent = JSON.parse(result.storage.get("opencode.window.browser.dat:tabs.recent") ?? "{}")

  assert.deepEqual(tabs, [sessionTab])
  assert.equal(recent.key, server + "\n" + sessionTab.sessionId)
  assert.deepEqual(result.historyCalls, ["/L3dvcmtzcGFjZS9yb290/session/ses-123?auth_token=encoded"])
})

test("is idempotent for an existing v2 workspace draft", () => {
  const initialTabs = JSON.stringify([{
    type: "draft",
    draftID: "existing-draft",
    server: "http://127.0.0.1:4567",
    directory: "/workspace/root",
  }])
  const result = runBootstrap("v2", { "opencode.window.browser.dat:tabs": initialTabs })
  const tabs = JSON.parse(result.storage.get("opencode.window.browser.dat:tabs") ?? "[]")

  assert.equal(tabs.length, 1)
  assert.equal(tabs[0].draftID, "existing-draft")
})


test("restores every persisted v2 tab and remaps the previous server origin", () => {
  const previousServer = "http://127.0.0.1:3001"
  const persistedState: OpenCodePersistedWorkspaceState = {
    tabs: [
      { type: "draft", draftID: "draft-old", server: previousServer, directory: "/workspace/root" },
      { type: "session", sessionId: "ses-first", server: previousServer },
      { type: "session", sessionId: "ses-active", server: previousServer },
    ],
    recent: { key: previousServer + "\n" + "ses-active" },
  }
  const result = runBootstrap("v2", {}, persistedState)
  const tabs = JSON.parse(result.storage.get("opencode.window.browser.dat:tabs") ?? "[]")
  const recent = JSON.parse(result.storage.get("opencode.window.browser.dat:tabs.recent") ?? "{}")

  assert.equal(tabs.length, 3)
  assert.deepEqual(tabs.map((tab: { server: string }) => tab.server), [
    "http://127.0.0.1:4567",
    "http://127.0.0.1:4567",
    "http://127.0.0.1:4567",
  ])
  assert.equal(tabs[0].directory, "/workspace/root")
  assert.equal(recent.key, "http://127.0.0.1:4567\nses-active")
  assert.deepEqual(result.historyCalls, ["/L3dvcmtzcGFjZS9yb290/session/ses-active?auth_token=encoded"])
  assert.deepEqual(JSON.parse(JSON.stringify(result.messages.at(-1))), {
    source: "opencode-workspace-state",
    state: { tabs, recent },
  })
})

test("keeps live browser tabs instead of replacing them with stale persisted state", () => {
  const server = "http://127.0.0.1:4567"
  const liveTab = { type: "session", sessionId: "ses-live", server }
  const result = runBootstrap("v2", {
    "opencode.window.browser.dat:tabs": JSON.stringify([liveTab]),
    "opencode.window.browser.dat:tabs.recent": JSON.stringify({ key: server + "\nses-live" }),
  }, {
    tabs: [{ type: "session", sessionId: "ses-stale", server: "http://127.0.0.1:3001" }],
  })
  const tabs = JSON.parse(result.storage.get("opencode.window.browser.dat:tabs") ?? "[]")

  assert.deepEqual(tabs, [liveTab])
})

test("validates persisted workspace tab state", () => {
  assert.deepEqual(sanitizeOpenCodeWorkspaceState({
    tabs: [{ type: "session", sessionId: "ses-123", server: "http://localhost" }],
    recent: { key: "http://localhost\nses-123", ignored: true },
  }), {
    tabs: [{ type: "session", sessionId: "ses-123", server: "http://localhost" }],
    recent: { key: "http://localhost\nses-123" },
  })
  assert.equal(sanitizeOpenCodeWorkspaceState({ tabs: [{ type: "session" }] }), undefined)
  assert.equal(sanitizeOpenCodeWorkspaceState({ tabs: "invalid" }), undefined)
})
