import { CS } from "./util.js"

/** @param {NS} ns */
export async function main(ns) {
  while (true) {
    upgradeHomeRam(ns)
    purchasePrograms(ns)
    purchaseServers(ns)
    await ns.sleep(CS.SCRIPTS.TREASURER.INTERVAL)
  }
}

/** @param {NS} ns */
function upgradeHomeRam(ns) {
  while (ns.getServerMaxRam(CS.SERVERS.HOME) < 2**25 && ns.singularity.upgradeHomeRam());
}

/** @param {NS} ns */
function purchasePrograms(ns) {
  if (!ns.singularity.purchaseTor())
    return
  const programs = [
    "BruteSSH.exe",
    "FTPCrack.exe",
    "HTTPWorm.exe",
    "relaySMTP.exe",
    "SQLInject.exe",
  ]
  for (let program of programs) {
    if (!ns.singularity.purchaseProgram(program))
      break
  }
}

/** @param {NS} ns */
function purchaseServers(ns) {
  const servers = ns.getPurchasedServers()
  if (servers.length < ns.getPurchasedServerLimit()) {
    let name = ns.purchaseServer("Zombie", 2 ** 3)
    while (name != "") {
      servers.push(name)
      ns.scp([CS.SCRIPTS.ZOMBIE.FILE], name)
      name = ns.purchaseServer("Zombie", 2 ** 3)
    }
  }
  if (servers.length == 0)
    return
  let ram = 2 * ns.getServerMaxRam(servers[servers.length - 1])
  while (ram <= ns.getServerMaxRam(CS.SERVERS.HOME) && ram <= ns.getPurchasedServerMaxRam()) {
    for (const server of servers) {
      if (ns.getServerMaxRam(server) < ram && !ns.upgradePurchasedServer(server, ram))
        return servers
    }
    ram = 2 * ns.getServerMaxRam(servers[servers.length - 1])
  }
}
