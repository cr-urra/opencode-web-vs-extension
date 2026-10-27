import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

export type OpenCodeExecutableSource = "configuration" | "path" | "standard-location"

export interface OpenCodeExecutableResolution {
  executablePath?: string
  source?: OpenCodeExecutableSource
  checkedPaths: string[]
  configuredPathInvalid: boolean
}

interface ResolveOpenCodeExecutableOptions {
  configuredPath?: string
  env?: NodeJS.ProcessEnv
  homeDirectory?: string
  platform?: NodeJS.Platform
  isExecutable?: (candidate: string) => Promise<boolean>
}

export async function resolveOpenCodeExecutable(options: ResolveOpenCodeExecutableOptions = {}): Promise<OpenCodeExecutableResolution> {
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const pathModule = platform === "win32" ? path.win32 : path.posix
  const homeDirectory = options.homeDirectory ?? os.homedir()
  const isExecutable = options.isExecutable ?? ((candidate: string) => canExecute(candidate, platform))
  const checkedPaths: string[] = []
  const seen = new Set<string>()

  const checkCandidate = async (candidate: string, source: OpenCodeExecutableSource) => {
    const normalizedCandidate = pathModule.normalize(candidate)
    const candidateKey = platform === "win32" ? normalizedCandidate.toLowerCase() : normalizedCandidate
    if (seen.has(candidateKey)) {
      return
    }

    seen.add(candidateKey)
    checkedPaths.push(normalizedCandidate)
    if (await isExecutable(normalizedCandidate)) {
      return { executablePath: normalizedCandidate, source }
    }
  }

  const configuredPath = options.configuredPath?.trim()
  if (configuredPath) {
    const expandedPath = expandHomeDirectory(configuredPath, homeDirectory, pathModule)
    const configuredResult = await checkCandidate(expandedPath, "configuration")
    return {
      ...configuredResult,
      checkedPaths,
      configuredPathInvalid: !configuredResult,
    }
  }

  const executableNames = getExecutableNames(platform, env.PATHEXT)
  const pathDirectories = splitPath(env.PATH, platform)
  for (const directory of pathDirectories) {
    for (const executableName of executableNames) {
      const result = await checkCandidate(pathModule.join(directory, executableName), "path")
      if (result) {
        return { ...result, checkedPaths, configuredPathInvalid: false }
      }
    }
  }

  const standardDirectories = getStandardDirectories(env, homeDirectory, platform, pathModule)
  for (const directory of standardDirectories) {
    for (const executableName of executableNames) {
      const result = await checkCandidate(pathModule.join(directory, executableName), "standard-location")
      if (result) {
        return { ...result, checkedPaths, configuredPathInvalid: false }
      }
    }
  }

  return { checkedPaths, configuredPathInvalid: false }
}

function expandHomeDirectory(value: string, homeDirectory: string, pathModule: typeof path.posix | typeof path.win32) {
  if (value === "~") {
    return homeDirectory
  }

  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return pathModule.join(homeDirectory, value.slice(2))
  }

  return value
}

function splitPath(pathValue: string | undefined, platform: NodeJS.Platform) {
  const delimiter = platform === "win32" ? ";" : ":"
  return (pathValue ?? "").split(delimiter).map((directory) => directory.trim()).filter(Boolean)
}

function getExecutableNames(platform: NodeJS.Platform, pathExt: string | undefined) {
  if (platform !== "win32") {
    return ["opencode"]
  }

  const extensions = (pathExt || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((extension) => extension.trim())
    .filter(Boolean)
    .map((extension) => extension.startsWith(".") ? extension : `.${extension}`)

  return extensions.map((extension) => `opencode${extension.toLowerCase()}`)
}

function getStandardDirectories(
  env: NodeJS.ProcessEnv,
  homeDirectory: string,
  platform: NodeJS.Platform,
  pathModule: typeof path.posix | typeof path.win32,
) {
  const directories: Array<string | undefined> = [
    env.OPENCODE_INSTALL_DIR,
    env.XDG_BIN_DIR,
    pathModule.join(homeDirectory, "bin"),
    pathModule.join(homeDirectory, ".local", "bin"),
    pathModule.join(homeDirectory, ".opencode", "bin"),
    pathModule.join(homeDirectory, ".bun", "bin"),
  ]

  if (platform === "darwin") {
    directories.push("/opt/homebrew/bin", "/usr/local/bin")
  } else if (platform === "linux") {
    directories.push("/usr/local/bin", "/usr/bin")
  } else if (platform === "win32") {
    directories.push(
      env.APPDATA ? pathModule.join(env.APPDATA, "npm") : undefined,
      pathModule.join(homeDirectory, "scoop", "shims"),
      env.ChocolateyInstall ? pathModule.join(env.ChocolateyInstall, "bin") : undefined,
    )
  }

  return directories.filter((directory): directory is string => Boolean(directory))
}

async function canExecute(candidate: string, platform: NodeJS.Platform) {
  try {
    const stat = await fs.stat(candidate)
    if (!stat.isFile()) {
      return false
    }

    await fs.access(candidate, platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}
