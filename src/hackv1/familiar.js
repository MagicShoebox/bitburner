import { CS, getRandomInt } from "./util.js"
import { getServerList } from "./servers.js"

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("sleep")
  const zPort = ns.getPortHandle(CS.SCRIPTS.ZOMBIE.PORT)
  while (true) {
    /** @type {Array<Server>} */
    const targets = getTargets(ns)
    if (targets.length == 0) {
      ns.tprint("No targets")
      break
    }
    const hackOrders = getHackOrders(ns, targets)
    const growOrders = getGrowOrders(ns, targets, hackOrders)
    const weakenOrders = getWeakenOrders(ns, targets, hackOrders, growOrders)
    const orders = hackOrders.concat(growOrders, weakenOrders)
    if (orders.length == 0) {
      ns.tprint("No targets")
      break
    }
    for (const order of orders) {
      const { target, action, threads, initial } = order
      const message = JSON.stringify({ target: target.hostname, action, threads })
      ns.print(`${action.padEnd(6)} -t ${threads.toString().padStart(4)} ${initial.padStart(13)} ${target.hostname}`)
      while (!zPort.tryWrite(message)) {
        await ns.sleep(getRandomInt(5000, 5100))
      }
      await ns.sleep(0)
    }
    await ns.sleep(CS.SCRIPTS.FAMILIAR.INTERVAL)
  }
}

/** @param {NS} ns */
function getTargets(ns) {
  return getServerList(ns).filter(s =>
    s.hasAdminRights
    && s.moneyMax > 0
    && ns.getWeakenTime(s.hostname) < 5 * 60e3
  )
}

/** @param {NS} ns 
 * @param {Array<Server>} targets */
function getHackOrders(ns, targets) {
  const formatInitial = x => `\$ ${ns.formatNumber(x)}`.padStart(9)
  targets = targets
      .filter(s => s.moneyAvailable / s.moneyMax >= 0.1)
      .sort((s, t) => expectedHackValue(ns, s) - expectedHackValue(ns, t))
  return targets
    .slice(-Math.ceil(targets.length / 2))
    .map(s => ({
      target: s,
      action: CS.SCRIPTS.ZOMBIE.MESSAGES.HACK,
      threads: Math.max(1, Math.min(CS.SCRIPTS.ZOMBIE.THREADS, Math.floor(0.25 / ns.hackAnalyze(s.hostname)))),
      initial: formatInitial(s.moneyAvailable)
    }))
}

/** @param {NS} ns
 * @param {Server} target */
function expectedHackValue(ns, target) {
  const hackPercent = ns.hackAnalyze(target.hostname)
  const regrowRatio = ns.growthAnalyze(target.hostname, 1 / (1 - hackPercent))
  return target.moneyAvailable
    * hackPercent
    * ns.hackAnalyzeChance(target.hostname)
    / ns.getHackTime(target.hostname)
    / (1 + regrowRatio)
}

/** @param {NS} ns 
 * @param {Array<Server>} targets */
function getGrowOrders(ns, targets, hackOrders) {
  const formatInitial = x => ns.formatPercent(x).padStart(7)
  const grow = hackOrders.map(order => ({
    target: order.target,
    action: CS.SCRIPTS.ZOMBIE.MESSAGES.GROW,
    threads: Math.ceil(expectedHackGrowThreads(ns, order)),
    initial: formatInitial(order.target.moneyAvailable / order.target.moneyMax)
  }))
  const all = targets
    .filter(s => ns.growthAnalyze(s.hostname, s.moneyMax / Math.max(1, s.moneyAvailable)) >= 1)
    .map(s => ({
      target: s,
      action: CS.SCRIPTS.ZOMBIE.MESSAGES.GROW,
      threads: 1,
      initial: formatInitial(s.moneyAvailable / s.moneyMax)
    }))
  return grow.concat(all)
}

/** @param {NS} ns
 * @param {Server} target */
function expectedHackGrowThreads(ns, order) {
  const hostname = order.target.hostname
  const hackPercent = ns.hackAnalyze(order.target.hostname)
  return ns.growthAnalyze(hostname, 1 / (1 - order.threads * hackPercent))
    * ns.getGrowTime(hostname)
    / ns.getHackTime(hostname)
}

/** @param {NS} ns
 * @param {Array<Server>} targets */
function getWeakenOrders(ns, targets, hackOrders, growOrders) {
  const formatInitial = (cur, min) => `${ns.formatNumber(cur, 2).padStart(5)} / ${ns.formatNumber(min, 2).padEnd(5)}`
  const hack = hackOrders.map(order => ({
    target: order.target,
    action: CS.SCRIPTS.ZOMBIE.MESSAGES.WEAKEN,
    threads: Math.ceil(expectedHackWeakenThreads(ns, order)),
    initial: formatInitial(order.target.hackDifficulty, order.target.minDifficulty)
  }))
  .filter(x => x.threads > 0)
  const grow = growOrders
    .map(order => ({
      target: order.target,
      action: CS.SCRIPTS.ZOMBIE.MESSAGES.WEAKEN,
      threads: Math.ceil(expectedGrowWeakenThreads(ns, order)),
      initial: formatInitial(order.target.hackDifficulty, order.target.minDifficulty)
    }))
  .filter(x => x.threads > 0)
  const all = targets
    .filter(s => s.hackDifficulty >= s.minDifficulty + 0.05)
    .map(s => ({
      target: s,
      action: CS.SCRIPTS.ZOMBIE.MESSAGES.WEAKEN,
      threads: 1,
      initial: formatInitial(s.hackDifficulty, s.minDifficulty)
    }))
  return hack.concat(grow, all)
}

/** @param {NS} ns */
function expectedHackWeakenThreads(ns, order) {
  const hostname = order.target.hostname
  return ns.getWeakenTime(hostname)
    * ns.hackAnalyzeSecurity(order.threads, hostname)
    / ns.getHackTime(hostname)
    / 0.05
}

/** @param {NS} ns */
function expectedGrowWeakenThreads(ns, order) {
  const hostname = order.target.hostname
  return ns.getWeakenTime(hostname)
    * ns.growthAnalyzeSecurity(order.threads, hostname)
    / ns.getGrowTime(hostname)
    / 0.05
}
