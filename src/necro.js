import { CS } from "./util.js"
import { connect } from "./connect.js"
import { getServerList } from "./servers.js"

/** @param {NS} ns */
export async function main(ns) {
  const backdooring = new Set()
  while (true) {
    /** @type {Server[]} */
    const servers = getServerList(ns)
    pwn(ns, servers.filter(s => !s.hasAdminRights))
    for (let server of servers.filter(s =>
      s.hasAdminRights
      && !s.backdoorInstalled
      && !backdooring.has(s.hostname))) {
      if (server.hostname == "w0r1d_d43m0n") {
        ns.tprint("Bitnode complete!")
        continue
      }
      if (!connect(ns, server.hostname))
        break
      const pid = ns.exec("backdoor.js", "home", 1)
      if (pid != 0) {
        backdooring.add(server.hostname)
        await ns.sleep(0)
      }
      connect(ns, CS.SERVERS.HOME)
      if (pid == 0)
        break
    }
    await ns.sleep(CS.SCRIPTS.NECRO.INTERVAL)
  }
}

/** @param {NS} ns
 * @param {Array<Server>} servers */
function pwn(ns, servers) {
  const programs = [
    { file: "BruteSSH.exe", prop: "sshPortOpen", crack: ns.brutessh },
    { file: "FTPCrack.exe", prop: "ftpPortOpen", crack: ns.ftpcrack },
    { file: "HTTPWorm.exe", prop: "httpPortOpen", crack: ns.httpworm },
    { file: "relaySMTP.exe", prop: "smtpPortOpen", crack: ns.relaysmtp },
    { file: "SQLInject.exe", prop: "sqlPortOpen", crack: ns.sqlinject },
  ]

  programs
    .filter(({ file }) => ns.fileExists(file, CS.SERVERS.HOME))
    .forEach(({ prop, crack }) => {
      servers
        .filter(s => !s[prop])
        .forEach(s => {
          crack(s.hostname)
          s[prop] = true
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
