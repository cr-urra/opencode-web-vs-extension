import * as assert from "assert/strict"
import { test } from "node:test"
import {
  createOpenCodeAuthToken,
  createOpenCodeBasicAuth,
  getOpenCodeUiGeneration,
  parseOpenCodeMajorVersion,
} from "./opencodeCompatibility"

test("parses current and legacy OpenCode versions", () => {
  assert.equal(parseOpenCodeMajorVersion("2.0.26\n"), 2)
  assert.equal(parseOpenCodeMajorVersion("opencode version v1.2.3"), 1)
  assert.equal(parseOpenCodeMajorVersion("unknown"), undefined)
})

test("detects the v2 UI independently from the CLI major version", () => {
  assert.equal(getOpenCodeUiGeneration('<html style="background: var(--v2-background-bg-deep)">', 1), "v2")
  assert.equal(getOpenCodeUiGeneration('<body class="bg-v2-background-bg-deep">', 1), "v2")
  assert.equal(getOpenCodeUiGeneration("<html><body>legacy</body></html>", 1), "legacy")
  assert.equal(getOpenCodeUiGeneration(undefined, 2), "v2")
  assert.equal(getOpenCodeUiGeneration(undefined, 3), "v2")
  assert.equal(getOpenCodeUiGeneration(undefined, 1), "legacy")
  assert.equal(getOpenCodeUiGeneration(undefined), "legacy")
})

test("creates the credentials expected by OpenCode", () => {
  const encoded = Buffer.from("opencode:secret", "utf8").toString("base64")
  assert.equal(createOpenCodeAuthToken("secret"), encoded)
  assert.equal(createOpenCodeBasicAuth("secret"), `Basic ${encoded}`)
})
