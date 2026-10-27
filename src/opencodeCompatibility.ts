import { spawn } from "child_process"

export type OpenCodeUiGeneration = "legacy" | "v2"

export function parseOpenCodeMajorVersion(output: string) {
  const match = output.match(/(?:^|[^0-9])v?(\d+)\.\d+(?:\.\d+)?(?:[^0-9]|$)/i)
  if (!match) {
    return
  }

  const major = Number(match[1])
  return Number.isSafeInteger(major) ? major : undefined
}

export function getOpenCodeUiGeneration(appHtml: string | undefined, majorVersion?: number): OpenCodeUiGeneration {
  if (appHtml && (appHtml.includes("--v2-background-") || appHtml.includes("bg-v2-background-"))) {
    return "v2"
  }

  return majorVersion !== undefined && majorVersion >= 2 ? "v2" : "legacy"
}

export function createOpenCodeBasicAuth(password: string) {
  return `Basic ${Buffer.from(`opencode:${password}`, "utf8").toString("base64")}`
}

export function createOpenCodeAuthToken(password: string) {
  return Buffer.from(`opencode:${password}`, "utf8").toString("base64")
}

export async function detectOpenCodeMajorVersion(executablePath: string, platform: NodeJS.Platform = process.platform) {
  return new Promise<number | undefined>((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(executablePath, ["--version"], {
        env: process.env,
        shell: platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
      })
    } catch {
      resolve(undefined)
      return
    }

    let settled = false
    let output = ""
    const finish = (majorVersion?: number) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeout)
      resolve(majorVersion)
    }
    const collect = (chunk: Buffer) => {
      if (output.length < 4096) {
        output += chunk.toString("utf8")
      }
    }
    const timeout = setTimeout(() => {
      child.kill()
      finish(parseOpenCodeMajorVersion(output))
    }, 3000)

    child.stdout?.on("data", collect)
    child.stderr?.on("data", collect)
    child.once("error", () => finish(parseOpenCodeMajorVersion(output)))
    child.once("close", () => finish(parseOpenCodeMajorVersion(output)))
  })
}
