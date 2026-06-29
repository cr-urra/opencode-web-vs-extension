import * as path from "path"

type PathModule = Pick<typeof path, "join" | "parse" | "resolve" | "sep">

export function getCommonParentPath(paths: string[], pathModule: PathModule = path) {
  const [firstPath, ...otherPaths] = paths.map((folderPath) => pathModule.resolve(folderPath))
  if (!firstPath) {
    return
  }

  const firstRoot = pathModule.parse(firstPath).root
  const firstRootKey = normalizePathSegment(firstRoot, pathModule)
  let commonParts = getPathParts(firstPath, firstRoot, pathModule)

  for (const folderPath of otherPaths) {
    const root = pathModule.parse(folderPath).root
    if (normalizePathSegment(root, pathModule) !== firstRootKey) {
      return
    }

    const parts = getPathParts(folderPath, root, pathModule)
    let index = 0
    while (index < commonParts.length && index < parts.length && pathSegmentsEqual(commonParts[index], parts[index], pathModule)) {
      index++
    }
    commonParts = commonParts.slice(0, index)
  }

  return commonParts.length ? pathModule.join(firstRoot, ...commonParts) : firstRoot
}

function getPathParts(resolvedPath: string, root: string, pathModule: PathModule) {
  return resolvedPath.slice(root.length).split(pathModule.sep).filter(Boolean)
}

function pathSegmentsEqual(left: string, right: string, pathModule: PathModule) {
  return normalizePathSegment(left, pathModule) === normalizePathSegment(right, pathModule)
}

function normalizePathSegment(segment: string, pathModule: PathModule) {
  return pathModule.sep === "\\" ? segment.toLowerCase() : segment
}
