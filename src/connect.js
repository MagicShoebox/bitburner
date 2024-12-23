import { CS } from "./util.js"

/** @param {NS} ns */
export function connect(ns, hostname) {
  ns.disableLog("scan")
  const start = ns.singularity.getCurrentServer()
  const stack = [start]
  const prev = new Map([[start, null]])
  while (!prev.has(hostname) && stack.length > 0) {
    const root = stack.shift()
    for (const node of ns.scan(root)) {
      if (!prev.has(node)) {
        prev.set(node, root)
        stack.push(node)
      }
    }
  }
  if (!prev.has(hostname))
    return false

  const path = [hostname]
  while (path[0] != start) {
    path.unshift(prev.get(path[0]))
  }
  for (let host of path.slice(1)) {
    ns.singularity.connect(host)
  }
  return true
}
