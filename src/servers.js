import { CS } from "./util.js"

let __SERVERS = null

/** @param {NS} ns
  * @return {Server[]} */
export function getServerList(ns) {
  if (__SERVERS == null) {
    ns.disableLog("disableLog")
    ns.disableLog("scan")
    const stack = [CS.SERVERS.HOME]
    __SERVERS = new Set(stack)
    while (stack.length > 0) {
      ns.scan(stack.pop())
        .filter(s => !__SERVERS.has(s))
        .forEach(s => {
          stack.push(s)
          __SERVERS.add(s)
        })
    }
    for (let server of ns.getPurchasedServers())
      __SERVERS.delete(server)
    __SERVERS.delete(CS.SERVERS.HOME)
    ns.disableLog("enableLog")
    ns.enableLog("scan")
    ns.enableLog("disableLog")
  }
  return Array.from(__SERVERS).map(ns.getServer)
}

export function onReset() {
  __SERVERS = null
}
