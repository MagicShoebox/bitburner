import { CS, Heap, mapReplacer, partition } from "./util.js"
import { getServerList } from "./servers.js"

const IGNORE = 0
const HACK = 1
const GROW = 2
const WEAKEN = 3
const INTERVAL = 200

/**
 * @typedef {{target: Server, 
 *            hack: number,
 *            weaken1: number,
 *            grow: number,
 *            weaken2: number,
 *            time: number,
 *            money: number}} Order
 */

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("getServerMaxRam")
  ns.disableLog("getServerUsedRam")
  ns.disableLog("sleep")
  ns.disableLog("exec")
  /** @type {Map<string, Order>} */
  const orderMap = new Map()
  const targetMap = new Map()
  while (true) {
    /** @type {Server[]} */
    const servers = getServerList(ns)
      .filter(s => s.hasAdminRights)
      .concat(ns.getPurchasedServers().map(ns.getServer))

    const workers = servers.filter(s => s.maxRam > 0)
    const supply = Heap.heapify(getAvailableThreads(ns, workers)
      .map(w => [-w.threads, w]))
    let totalSupply = supply.reduce((t, [_, {threads}]) => t + threads, 0)

    const targets = servers.filter(s => s.moneyMax > 0)
    for (let target of targets) {
      if (orderMap.has(target.hostname)) {
        let order = orderMap.get(target.hostname)
        if (performance.now() < order.end) {
          target.moneyAvailable = order.estimated.money
          target.hackDifficulty = order.estimated.security
        } else {
          orderMap.delete(target.hostname)
        }
      }
    }
    const orders = createOrders(ns, orderMap, targetMap, targets, totalSupply)
    for (let order of orders) {
      const end = fulfill(ns, supply, order)
      if (end == null)
        continue
      await ns.sleep(0)
      totalSupply -= cost(order)
      const active = {
        target: order.target.hostname,
        estimated: order.estimated,
        hack: order.hack,
        grow: order.grow,
        weaken: order.weaken1 + order.weaken2,
        end
      }
      orderMap.set(active.target, active)
      ns.print(`${active.target}: ${active.hack}/${active.grow}/${active.weaken} in ${Math.trunc(active.end - performance.now()) / 1000}s`)
    }
    ns.writePort(CS.SCRIPTS.STATS.PORT, JSON.stringify({
      type: CS.SCRIPTS.STATS.MESSAGES.FAMILIAR_INFO,
      latest: targetMap,
    }, mapReplacer))
    if (orderMap.size > 0) {
      const sleep = INTERVAL - performance.now() % INTERVAL
      ns.print(`Sleeping ${Math.trunc(sleep) / 1000}s with ${totalSupply} unused`)
      await ns.sleep(sleep)
    } else {
      ns.tprint("Familiar idle")
      await ns.sleep(CS.SCRIPTS.FAMILIAR.INTERVAL)
    }
  }
}


/** @param {NS} ns 
 * @param {Array<{hostname: string, threads: number}>} supply
 * @param {Order} order */
function fulfill(ns, supply, order) {
  const weakenTime = ns.getWeakenTime(order.target.hostname)
  const now = performance.now()
  const hackTime = now + weakenTime + INTERVAL - (now + weakenTime) % INTERVAL
  const delays = {
    "hack": hackTime + 0.2 * INTERVAL - now - ns.getHackTime(order.target.hostname),
    "weaken1": hackTime + 0.4 * INTERVAL - now - weakenTime,
    "grow": hackTime + 0.6 * INTERVAL - now - ns.getGrowTime(order.target.hostname),
    "weaken2": hackTime + 0.8 * INTERVAL - now - weakenTime
  }
  for (let stage of ["grow", "hack", "weaken1", "weaken2"]) {
    let remaining = order[stage]
    const delay = delays[stage]
    while (remaining > 0) {
      let worker
      if (stage == "grow") {
        [_, worker] = Heap.pop(supply)
        if (worker.threads < remaining) {
          // ns.tprint(`No worker for grow ${remaining}`)
          Heap.push(supply, [-worker.threads, worker])
          return null
        }
      } else {
        [_, worker] = supply.pop()
      }
      let threads = Math.min(remaining, worker.threads)
      let action = stage
      if (action == "weaken1" || action == "weaken2")
        action = "weaken"
      const runOptions = {
        // preventDuplicates: false,
        // ramOverride: ns.getScriptRam(CS.SCRIPTS.ZOMBIE.FILE),
        temporary: true,
        threads
      }
      const args = [
        action,
        order.target.hostname,
        delay
      ]
      if (ns.exec(CS.SCRIPTS.ZOMBIE.FILE, worker.hostname, runOptions, ...args) == 0)
        ns.tprint(`Failed to execute on ${worker.hostname}`)
      remaining -= threads
      worker.threads -= threads
      if (worker.threads != 0)
        Heap.push(supply, [-worker.threads, worker])
    }
  }
  return hackTime + 750
}

/** @param {NS} ns 
 * @param {Array<Server>} workers */
function getAvailableThreads(ns, workers) {
  const ramPerThread = ns.getScriptRam(CS.SCRIPTS.ZOMBIE.FILE)
  const available = workers
    .map(s => ({
      hostname: s.hostname,
      threads: Math.floor((s.maxRam - s.ramUsed) / ramPerThread)
    }))
    .filter(({ threads }) => threads > 0)
  let homeRam = ns.getServerMaxRam(CS.SERVERS.HOME) - ns.getServerUsedRam(CS.SERVERS.HOME)
  homeRam -= 32 // Buffer for manually run scripts
  const homeThreads = Math.floor(homeRam / ramPerThread)
  if (homeThreads > 0)
    available.push({
      hostname: CS.SERVERS.HOME,
      threads: homeThreads
    })

  return available
}

/** @param {NS} ns 
 * @param {Map<string, Order>} orderMap
 * @param {Map<string, string>} targetMap
 * @param {Server[]} targets
 * @param {number} supply */
function createOrders(ns, orderMap, targetMap, targets, supply) {
  const verbs = new Map([
    [IGNORE, "Ignore 💤"],
    [HACK, "Hack ✖"],
    [GROW, "Grow ✖"],
    [WEAKEN, "Weaken ✖"]
  ])
  /** @type {Map<number, Server[]>} */
  const actionMap = partition(s => designate(ns, orderMap, s), targets)
  actionMap.forEach((v, k) => v.forEach(s => {
    targetMap.set(s.hostname, verbs.get(k))
  }))
  /** @type {Map<string, Order>} */
  const pending = new Map()

  for (let target of actionMap.get(WEAKEN) ?? []) {
    let order = getWeakenOrder(ns, target, supply)
    supply -= cost(order)
    pending.set(target.hostname, order)
    targetMap.set(target.hostname, "Weaken ✔")
    if (supply == 0)
      return Array.from(pending.values())
  }

  for (let target of actionMap.get(GROW) ?? []) {
    let order = getGrowOrder(ns, target, supply)
    supply -= cost(order)
    pending.set(target.hostname, order)
    targetMap.set(target.hostname, "Grow ✔")
    if (supply == 0)
      return Array.from(pending.values())
  }

  const hackTargets = new Map((actionMap.get(HACK) ?? []).map(s => [s.hostname, s]))

  let power = 1
  while (hackTargets.size > 0) {
    for (let [hostname, target] of hackTargets) {
      const newOrder = getHackOrder(ns, target, power)
      if (newOrder == null) {
        hackTargets.delete(hostname)
        continue
      }
      let c = cost(newOrder)
      const oldOrder = pending.get(hostname)
      if (oldOrder != undefined)
        c -= cost(oldOrder)
      if (supply < c)
        return Array.from(pending.values())
      supply -= c
      pending.set(hostname, newOrder)
      targetMap.set(hostname, `Hack ${power} ✔`)
    }
    power++
  }
  return Array.from(pending.values())
}

/** @param {NS} ns
 * @param {Map<string, Order>} orderMap
 * @param {Server} target */
function designate(ns, orderMap, target) {
  const weakenTime = ns.getWeakenTime(target.hostname)
  if (weakenTime < 2e3
    || weakenTime > 10 * 60e3
    || orderMap.get(target.hostname)?.end > 3 * INTERVAL + performance.now() + weakenTime)
    return IGNORE
  const security = target.hackDifficulty - target.minDifficulty
  const money = target.moneyAvailable / target.moneyMax
  if (security < 1 && money > 0.5)
    return HACK
  if (security >= 0.05)
    return WEAKEN
  if (money <= 0.95)
    return GROW
  return IGNORE
}

/** @param {NS} ns
 * @param {Server} target
 * @param {number} hackThreads */
function getHackOrder(ns, target, hackThreads) {
  const hackPercent = hackThreads * ns.hackAnalyze(target.hostname)
  if (hackPercent > 0.9)
    return null
  const regrow = 1 / (1 - hackPercent)
  const hackSecurity = ns.hackAnalyzeSecurity(hackThreads, target.hostname)
  const weaken1Threads = Math.ceil(hackSecurity / 0.05)
  const growThreads = Math.ceil(ns.growthAnalyze(target.hostname, regrow))
  // if (safeGrowPercent(ns, target, growThreads) < regrow)
  //   return null
  const weaken2Threads = Math.ceil(ns.growthAnalyzeSecurity(growThreads) / 0.05)
  // const value = ns.hackAnalyzeChance(target.hostname)
  //   * hackPercent
  //   * target.moneyAvailable
  //   / ns.getWeakenTime(target.hostname)
  //   / (hackThreads + growThreads + weaken2Threads)
  const estimated = {
    money: target.moneyAvailable,
    security: target.hackDifficulty
  }
  return {
    target,
    estimated,
    hack: hackThreads,
    weaken1: weaken1Threads,
    grow: growThreads,
    weaken2: weaken2Threads,
    // value,
  }
}

/** @param {NS} ns
 * @param {Server} target
 * @param {number} maxThreads */
function getWeakenOrder(ns, target, maxThreads) {
  const weakenThreads = Math.min(
    5,
    maxThreads,
    Math.floor((target.hackDifficulty - target.minDifficulty) / 0.05)
  )
  const estimated = {
    money: target.moneyAvailable,
    security: target.hackDifficulty - 0.05 * weakenThreads
  }
  return {
    target,
    estimated,
    hack: 0,
    weaken1: 0,
    grow: 0,
    weaken2: weakenThreads,
  }
}

/** @param {NS} ns
 * @param {Server} target
 * @param {number} maxThreads */
function getGrowOrder(ns, target, maxThreads) {
  const goal = Math.min(
    target.moneyAvailable + 0.01 * target.moneyMax,
    target.moneyMax
  )
  let growThreads = ns.growthAnalyze(target.hostname, goal / Math.max(1, target.moneyAvailable))
  let weakenThreads = ns.growthAnalyzeSecurity(growThreads) / 0.05
  if (growThreads + weakenThreads > maxThreads) {
    let scale = maxThreads / (growThreads + weakenThreads)
    growThreads *= scale
    weakenThreads *= scale
  }
  growThreads = Math.max(1, Math.floor(growThreads))
  weakenThreads = Math.ceil(weakenThreads)
  while (growThreads + weakenThreads > maxThreads) {
    weakenThreads--
  }
  const growth = ns.formulas.hacking.growPercent(target, growThreads, ns.getPlayer())
  const estimated = {
    money: Math.min(target.moneyMax, target.moneyAvailable * growth),
    security: Math.max(target.minDifficulty, target.hackDifficulty + ns.growthAnalyzeSecurity(growThreads) - 0.05 * weakenThreads)
  }
  return {
    target,
    estimated,
    hack: 0,
    weaken1: 0,
    grow: growThreads,
    weaken2: weakenThreads
  }
}

/** @param {Order} order */
function cost(order) {
  return order.hack + order.grow + order.weaken1 + order.weaken2
}

// /** @param {NS} ns
//  * @param {Server} target
//  * @param {number} mult 
//  * @param {boolean} override */
// function optimalGrowThreads(ns, target, mult) {
//   if (optimalGrowThreads.cache === undefined) {
//     optimalGrowThreads.cache = new Map()
//   }
//   if (optimalGrowThreads.cache.has(target.hostname)) {
//     const { s, m, t } = optimalGrowThreads.cache.get(target.hostname)
//     if (target.hackDifficulty == s && Math.abs(mult - m) < 1e5) {
//       return t
//     }
//   }
//   const f = (x) => safeGrowPercent(ns, target, x)
//   let t = 0
//   let m = 0
//   for (let i = 15; i >= 0; i--) {
//     if (f(t + (1 << i + 1)) - 2 * f(t + (1 << i)) + f(Math.max(1, t)) >= 0)
//       t += 1 << i
//     if (f(m + (1 << i)) <= mult)
//       m += 1 << i
//   }
//   const result = f(t) < mult ? t : m + 1
//   optimalGrowThreads.cache.set(target.hostname, {
//     s: target.hackDifficulty,
//     m: mult,
//     t: result
//   })
//   return result
// }

// /** @param {NS} ns
//  * @param {Server} target
//  * @param {number} threads */
// function safeGrowPercent(ns, target, threads) {
//   const player = ns.getPlayer()
//   return ns.formulas.hacking.growPercent(
//     { ...target, hackDifficulty: target.hackDifficulty + 0.004 * threads },
//     threads,
//     player
//   )
// }
