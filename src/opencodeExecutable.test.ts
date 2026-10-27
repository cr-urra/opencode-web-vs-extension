import * as assert from "assert/strict"
import { test } from "node:test"
import { resolveOpenCodeExecutable } from "./opencodeExecutable"

function executableChecker(executablePaths: string[]) {
  const executableSet = new Set(executablePaths)
  return async (candidate: string) => executableSet.has(candidate)
}

test("uses the configured executable before PATH", async () => {
  const result = await resolveOpenCodeExecutable({
    configuredPath: "/custom/opencode",
    env: { PATH: "/usr/bin" },
    homeDirectory: "/home/user",
    platform: "linux",
    isExecutable: executableChecker(["/custom/opencode", "/usr/bin/opencode"]),
  })

  assert.equal(result.executablePath, "/custom/opencode")
  assert.equal(result.source, "configuration")
  assert.deepEqual(result.checkedPaths, ["/custom/opencode"])
})

test("reports an invalid configured executable without silently falling back", async () => {
  const result = await resolveOpenCodeExecutable({
    configuredPath: "~/.missing/opencode",
    env: { PATH: "/usr/bin" },
    homeDirectory: "/home/user",
    platform: "linux",
    isExecutable: executableChecker(["/usr/bin/opencode"]),
  })

  assert.equal(result.executablePath, undefined)
  assert.equal(result.configuredPathInvalid, true)
  assert.deepEqual(result.checkedPaths, ["/home/user/.missing/opencode"])
})

test("finds OpenCode on PATH", async () => {
  const result = await resolveOpenCodeExecutable({
    env: { PATH: "/usr/local/bin:/usr/bin" },
    homeDirectory: "/home/user",
    platform: "linux",
    isExecutable: executableChecker(["/usr/bin/opencode"]),
  })

  assert.equal(result.executablePath, "/usr/bin/opencode")
  assert.equal(result.source, "path")
})

test("finds the default OpenCode installation outside PATH", async () => {
  const result = await resolveOpenCodeExecutable({
    env: { PATH: "/usr/bin" },
    homeDirectory: "/home/user",
    platform: "linux",
    isExecutable: executableChecker(["/home/user/.opencode/bin/opencode"]),
  })

  assert.equal(result.executablePath, "/home/user/.opencode/bin/opencode")
  assert.equal(result.source, "standard-location")
})

test("honors OPENCODE_INSTALL_DIR and XDG_BIN_DIR", async () => {
  const result = await resolveOpenCodeExecutable({
    env: { PATH: "", OPENCODE_INSTALL_DIR: "/opt/opencode", XDG_BIN_DIR: "/xdg/bin" },
    homeDirectory: "/home/user",
    platform: "linux",
    isExecutable: executableChecker(["/opt/opencode/opencode", "/xdg/bin/opencode"]),
  })

  assert.equal(result.executablePath, "/opt/opencode/opencode")
})

test("uses PATHEXT when resolving OpenCode on Windows", async () => {
  const result = await resolveOpenCodeExecutable({
    env: { PATH: "C:\\Tools;C:\\Windows", PATHEXT: ".EXE;.CMD" },
    homeDirectory: "C:\\Users\\user",
    platform: "win32",
    isExecutable: executableChecker(["C:\\Tools\\opencode.cmd"]),
  })

  assert.equal(result.executablePath, "C:\\Tools\\opencode.cmd")
  assert.equal(result.source, "path")
})
