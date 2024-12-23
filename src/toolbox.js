import { CS } from "./util.js"
import { connect } from "./connect.js"
import { getServerList } from "./servers.js"

/** @param {NS} ns */
export async function main(ns) {
  switch (ns.args[0]) {
    case "analyze":
      analyze(ns, ns.args[1])
      break
    case "backdoor":
      if (!connect(ns, ns.args[1])) {
        ns.tprint("Not found")
        return
      }
      await ns.singularity.installBackdoor()
      ns.singularity.connect(CS.SERVERS.HOME)
      break
    case "contract":
      contract(ns, ns.args[1])
      break
    case "connect":
      if (!connect(ns, ns.args[1]))
        ns.tprint("Not found")
      break
    case "list":
      list(ns)
      break
    case "player":
      player(ns)
      break
    case "port":
      port(ns, ns.args[1])
      break
    case "gang":
      gang(ns, ns.args[1])
      break
    case "hack":
      await ns.hack(ns.args[1])
      break
    case "grow":
      await ns.grow(ns.args[1])
      break
    case "weaken":
      await ns.weaken(ns.args[1])
      break
  }
}

/** @param {NS} ns */
function analyze(ns, hostname) {
  let server = ns.getServer(hostname)
  ns.tprint(`${server.hostname}:`)
  const ports = server.sshPortOpen + server.ftpPortOpen + server.smtpPortOpen + server.httpPortOpen + server.sqlPortOpen
  ns.tprint(`Ports: ${ports} open of ${server.numOpenPortsRequired} required`)
  ns.tprint(`Money: \$${ns.formatNumber(server.moneyAvailable)} of \$${ns.formatNumber(server.moneyMax)}`)
  const hackPercent = ns.hackAnalyze(server.hostname)
  const hackChance = ns.hackAnalyzeChance(server.hostname)
  const hackEV = server.moneyAvailable * hackPercent * hackChance / ns.getHackTime(server.hostname)
  ns.tprint(`Expected Value: \$${ns.formatNumber(hackEV)}`)
  ns.tprint(`Security: ${server.hackDifficulty} current, ${server.minDifficulty} min, ${server.baseDifficulty} base`)
  ns.tprint(`Growth Rate: ${server.serverGrowth}`)
  ns.tprint(`Hack Percent: ${hackPercent}`)
  ns.tprint(`Hack Chance: ${hackChance}`)
  ns.tprint(`Hack Time: ${ns.getHackTime(server.hostname)}`)
  ns.tprint(`Hack Security Increase: ${ns.hackAnalyzeSecurity(1, server.hostname)}`)
  ns.tprint(`Grow Time: ${ns.getGrowTime(server.hostname)}`)
  const regrowRatio = ns.growthAnalyze(server.hostname, 1 / (1 - hackPercent))
  ns.tprint(`Regrow Ratio: ${regrowRatio}`)
  ns.tprint(`Regrow Security Increase: ${ns.growthAnalyzeSecurity(regrowRatio, server.hostname)}`)
  ns.tprint(`Weaken Time: ${ns.getWeakenTime(server.hostname)}`)
}

/** @param {NS} ns */
function contract(ns, contractType) {
  const existing = new Set(ns.ls(CS.SERVERS.HOME, ".cct"))
  ns.codingcontract.createDummyContract(contractType)
  const dummy = ns.ls(CS.SERVERS.HOME, ".cct").filter(f => !existing.has(f))[0]
  ns.tprint(`Created ${dummy}`)
}

/** @param {NS} ns */
function list(ns) {
  for (let server of getServerList(ns))
    ns.tprint(server.hostname)
}

/** @param {NS} ns */
function player(ns) {
  ns.tprint(ns.getPlayer())
  ns.tprint(`Karma: ${ns.heart.break()}`)
}

/** @param {NS} ns */
function port(ns, portNum) {
  let m = ns.readPort(portNum)
  while (m != CS.PORTS.EMPTY_TOKEN) {
    ns.tprint(m)
    m = ns.readPort(portNum)
  }
}

/** @param {NS} ns */
function gang(ns, order) {
  ns.gang.getMemberNames().forEach(m =>
    ns.gang.setMemberTask(m, order))
}
