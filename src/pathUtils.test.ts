import * as assert from "assert/strict"
import * as path from "path"
import { test } from "node:test"
import { getCommonParentPath } from "./pathUtils"

test("returns a Windows workspace path without duplicating the drive", () => {
  assert.equal(getCommonParentPath(["C:\\Users\\crist\\repo"], path.win32), "C:\\Users\\crist\\repo")
})

test("returns a Windows common parent on the same drive", () => {
  assert.equal(getCommonParentPath(["C:\\repo\\app", "C:\\repo\\docs"], path.win32), "C:\\repo")
})

test("returns the Windows drive root when it is the only common parent", () => {
  assert.equal(getCommonParentPath(["C:\\", "C:\\Users\\crist"], path.win32), "C:\\")
})

test("returns undefined for Windows paths on different drives", () => {
  assert.equal(getCommonParentPath(["C:\\repo", "D:\\repo"], path.win32), undefined)
})

test("handles Windows UNC workspace paths", () => {
  assert.equal(getCommonParentPath(["\\\\server\\share\\repo", "\\\\server\\share\\repo\\src"], path.win32), "\\\\server\\share\\repo")
})

test("compares Windows paths case-insensitively", () => {
  assert.equal(getCommonParentPath(["C:\\Repo", "c:\\repo\\src"], path.win32), "C:\\Repo")
})

test("returns a POSIX common parent", () => {
  assert.equal(getCommonParentPath(["/home/user/repo/src", "/home/user/repo/docs"], path.posix), "/home/user/repo")
})

test("keeps POSIX path comparison case-sensitive", () => {
  assert.equal(getCommonParentPath(["/home/user/Repo", "/home/user/repo/src"], path.posix), "/home/user")
})
