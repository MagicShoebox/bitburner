import { CS, intdiv, bifilter } from "./util.js"
import { getServerList } from "./servers.js"

/** @param {NS} ns */
export async function main(ns) {
  let choice
  if (ns.args.length == 0)
    choice = (await ns.prompt("Mode?", {
      type: "select",
      choices: ["Start", "Stop", "Stats", "Exit"]
    }))
      .toLowerCase()
  else
    choice = ns.args[0].toString().toLowerCase()
  switch (choice) {
    case "start":
      if (ns.isRunning(CS.SCRIPTS.NECRO.FILE))
        ns.exit()
      if (!ns.isRunning(CS.SCRIPTS.FAMILIAR.FILE))
        ns.run(CS.SCRIPTS.FAMILIAR.FILE)
      if (!ns.isRunning(CS.SCRIPTS.SHARE.FILE))
        ns.run(CS.SCRIPTS.SHARE.FILE, Math.max(1, Math.floor(1 / 64 * ns.getServerMaxRam(CS.SERVERS.HOME))))
      if (!ns.isRunning(CS.SCRIPTS.ZOMBIE.FILE))
        startZombie(ns, CS.SERVERS.HOME, 12 / 16 * ns.getServerMaxRam(CS.SERVERS.HOME))
      /** @type {Server[]} */
      let servers = getServerList(ns)
      while (ns.readPort(CS.SCRIPTS.NECRO.PORT) == CS.PORTS.EMPTY_TOKEN) {
        purchaseServers(ns)
        servers = servers
          .filter(s => !s.purchasedByPlayer)
          .concat(ns.getPurchasedServers().map(ns.getServer))
        pwn(ns, servers.filter(s => !s.hasAdminRights))
        startAll(ns, servers)
        await ns.sleep(CS.SCRIPTS.NECRO.INTERVAL)
      }
      await stopAll(ns, servers)
      break
    case "stop":
      ns.writePort(CS.SCRIPTS.NECRO.PORT, "stop")
      break
    default:
      break
  }
}

/** @param {NS} ns */
function purchaseServers(ns) {
  const servers = ns.getPurchasedServers()
  if (servers.length < ns.getPurchasedServerLimit()) {
    while (ns.purchaseServer("Zombie", 2 ** 3) != "");
    return
  }
  const ram = 2 * ns.getServerMaxRam(servers[servers.length - 1])
  if (
    ram > ns.getServerMaxRam(CS.SERVERS.HOME) / 2
    || ram > 2 ** 12
    || ram > ns.getPurchasedServerMaxRam())
    return
  for (const server of servers) {
    if (ns.getServerMaxRam(server) < ram && !ns.upgradePurchasedServer(server, ram))
      break
  }
}


/** @param {NS} ns
 * @param {Array<Server>} servers */
function startAll(ns, servers) {
  servers
    .filter(s =>
      s.hasAdminRights
      && s.maxRam - s.ramUsed >= ns.getScriptRam(CS.SCRIPTS.ZOMBIE.FILE)
      && (ns.scriptRunning(CS.SCRIPTS.ZOMBIE.FILE, s.hostname)
        || (!ns.scriptRunning(CS.SCRIPTS.ZOMBIE.FILE, s.hostname)
          && ns.scp([CS.SCRIPTS.UTIL.FILE, CS.SCRIPTS.ZOMBIE.FILE], s.hostname))))
    .forEach(s => s.ramUsed += startZombie(ns, s.hostname, s.maxRam - s.ramUsed))
}

/** @param {NS} ns
 * @param {string} hostname
 * @param {number} ram */
function startZombie(ns, hostname, ram) {
  const ramPerThread = ns.getScriptRam(CS.SCRIPTS.ZOMBIE.FILE)
  const totalThreads = intdiv(ram, ramPerThread)
  let instances, threadsPerInstance, remainder
  if (CS.SCRIPTS.ZOMBIE.THREADS > 0) {
    threadsPerInstance = CS.SCRIPTS.ZOMBIE.THREADS
    remainder = totalThreads % threadsPerInstance
    instances = (totalThreads - remainder) / threadsPerInstance
  } else {
    threadsPerInstance = 0
    remainder = totalThreads
    instances = 0
  }
  let ramUsed = 0
  while (instances > 0 && execZombie(ns, hostname, threadsPerInstance)) {
    instances--
    ramUsed += ramPerThread * threadsPerInstance
  }
  if (remainder > 0 && execZombie(ns, hostname, remainder)) {
    ramUsed += ramPerThread * remainder
  }
  return ramUsed
}

/** @param {NS} ns
 * @param {string} hostname
 * @param {number} ram */
function execZombie(ns, hostname, threads) {
  const runOptions = {
    // preventDuplicates: false,
    // ramOverride: ns.getScriptRam(CS.SCRIPTS.ZOMBIE.FILE),
    temporary: true,
    threads: threads
  }
  const args = [
    hostname,
    threads
  ]
  return ns.exec(CS.SCRIPTS.ZOMBIE.FILE, hostname, runOptions, ...args)
}

/** @param {NS} ns
 * @param {Array<Server>} servers */
async function stopAll(ns, servers) {
  ns.scriptKill(CS.SCRIPTS.FAMILIAR.FILE, CS.SERVERS.HOME)
  ns.scriptKill(CS.SCRIPTS.SHARE.FILE, CS.SERVERS.HOME)
  ns.scriptKill(CS.SCRIPTS.ZOMBIE.FILE, CS.SERVERS.HOME)
  const stopping = servers.filter(s => ns.scriptRunning(CS.SCRIPTS.ZOMBIE.FILE, s.hostname))
  stopping.forEach(s => ns.killall(s.hostname))
  await ns.sleep(1000)
  stopping
    .filter(s => !ns.rm(CS.SCRIPTS.UTIL.FILE, s.hostname) || !ns.rm(CS.SCRIPTS.ZOMBIE.FILE, s.hostname))
    .forEach(s => ns.tprint(`Failed to clean up on ${s.hostname}`))
  ns.clearPort(CS.SCRIPTS.NECRO.PORT)
  ns.clearPort(CS.SCRIPTS.ZOMBIE.PORT)
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
        .filter(s => s.openPortCount < s.numOpenPortsRequired && !test(s))
        .forEach(s => {
          crack(s.hostname)
          save(s)
          s.openPortCount += 1
        })
    })
  let hackingLevel = ns.getHackingLevel()
  servers
    .filter(s => s.openPortCount >= s.numOpenPortsRequired
      && s.requiredHackingSkill <= hackingLevel)
    .forEach(s => {
      ns.nuke(s.hostname)
      ns.tprint(`Pwned ${s.hostname}`)
      s.hasAdminRights = true
    })
}
