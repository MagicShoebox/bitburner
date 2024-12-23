import { CS } from "./util.js"
import { getServerList } from "./servers.js"

/** @param {NS} ns */
export async function main(ns) {
  ns.atExit(() => stopDaemons(ns))
  startDaemons(ns)
  while (true) {
    purchaseServers(ns)
    /** @type {Server[]} */
    const servers = getServerList(ns)
    pwn(ns, servers.filter(s => !s.hasAdminRights))
    await ns.sleep(CS.SCRIPTS.NECRO.INTERVAL)
  }
}

/** @param {NS} ns */
function startDaemons(ns) {
  runSingleIfAble(ns, CS.SCRIPTS.FAMILIAR.FILE, 1)
  runSingleIfAble(ns, CS.SCRIPTS.GANG.FILE, 1)
  let availRam = ns.getServerMaxRam(CS.SERVERS.HOME) - ns.getServerUsedRam(CS.SERVERS.HOME)
  availRam -= 32 // Buffer for manually run scripts
  let shareThreads = Math.min(64, Math.max(1, Math.floor(1 / 64 * availRam)))
  runSingleIfAble(ns, CS.SCRIPTS.SHARE.FILE, shareThreads)
}

/** @param {NS} ns */
function stopDaemons(ns) {
  ns.scriptKill(CS.SCRIPTS.FAMILIAR.FILE, CS.SERVERS.HOME)
  ns.scriptKill(CS.SCRIPTS.GANG.FILE, CS.SERVERS.HOME)
  ns.scriptKill(CS.SCRIPTS.SHARE.FILE, CS.SERVERS.HOME)
}

/** @param {NS} ns */
function runSingleIfAble(ns, file, threads) {
  if (ns.isRunning(file))
    return
  let avail = ns.getServerMaxRam(CS.SERVERS.HOME) - ns.getServerUsedRam(CS.SERVERS.HOME)
  if (avail >= threads * ns.getScriptRam(file))
    ns.run(file, threads)
  else
    ns.tprint(`Not enough memory to run ${file}`)
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
    return servers
  let ram = 2 * ns.getServerMaxRam(servers[servers.length - 1])
  while (
    ram <= ns.getServerMaxRam(CS.SERVERS.HOME) / 2
    && ram <= 2 ** 13
    && ram <= ns.getPurchasedServerMaxRam()) {
    for (const server of servers) {
      if (ns.getServerMaxRam(server) < ram && !ns.upgradePurchasedServer(server, ram))
        return servers
    }
    ram = 2 * ns.getServerMaxRam(servers[servers.length - 1])
  }
  return servers
}

/** @param {NS} ns
 * @param {Array<Server>} servers */
function pwn(ns, servers) {
  const programs = [
    { file: "BruteSSH.exe", test: s => s.sshPortOpen, crack: ns.brutessh, save: s => s.sshPortOpen = true },
    { file: "FTPCrack.exe", test: s => s.ftpPortOpen, crack: ns.ftpcrack, save: s => s.ftpPortOpen = true },
    { file: "HTTPWorm.exe", test: s => s.httpPortOpen, crack: ns.httpworm, save: s => s.httpPortOpen = true },
    { file: "relaySMTP.exe", test: s => s.smtpPortOpen, crack: ns.relaysmtp, save: s => s.smtpPortOpen = true },
    { file: "SQLInject.exe", test: s => s.sqlPortOpen, crack: ns.sqlinject, save: s => s.sqlPortOpen = true },
  ]

  programs
    .filter(({ file }) => ns.fileExists(file, CS.SERVERS.HOME))
    .forEach(({ test, crack, save }) => {
      servers
        .filter(s => !test(s))
        .forEach(s => {
          crack(s.hostname)
          save(s)
          s.openPortCount += 1
        })
    })
  const hackingLevel = ns.getHackingLevel()
  servers
    .filter(s => s.openPortCount >= s.numOpenPortsRequired
      && s.requiredHackingSkill <= hackingLevel)
    .forEach(s => {
      ns.nuke(s.hostname)
      ns.tprint(`Pwned ${s.hostname}`)
      s.hasAdminRights = true
      if (s.maxRam > 0)
        ns.scp([CS.SCRIPTS.ZOMBIE.FILE], s.hostname)
    })
}
