import { CS, Heap, mapReplacer, partition } from "./util.js"
import { growPercent } from "./formulas.js"
import { getServerList } from "./servers.js"

const IGNORE = 0
const HACK = 1
const GROW = 2
const WEAKEN = 3

/**
 * @typedef {{target: Server, 
 *            hack: number,
 *            grow: number,
 *            weaken: number,
 *            time: number,
 *            money: number}} Order
 */

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("getServerMaxRam")
  ns.disableLog("getServerUsedRam")
  /** @type {Map<string, Array<Order>>} */
  const orderMap = new Map()
  const orderHeap = []

  while (true) {
    while (orderHeap.length > 0 && Heap.peek(orderHeap)[1].end <= performance.now()) {
      if (Heap.peek(orderHeap)[1].pids.some(p => ns.isRunning(p)))
        break
      let [_, active] = Heap.pop(orderHeap)
      const actives = orderMap.get(active.target)
      Heap.pop(actives)
      if (actives.length > 0) {
        const [_, active] = actives[0]
        if (active.hack > 0) {
          active.estimated.money = ns.getServerMoneyAvailable(active.target)
          active.estimated.security = ns.getServerSecurityLevel(active.target)
        } else if (active.grow > 0) {
          active.estimated.money = Math.min(
            ns.getServerMaxMoney(active.target),
            ns.getServerMoneyAvailable(active.target) * active.percent)
          active.estimated.security = ns.getServerSecurityLevel(active.target)
        } else {
          active.estimated.money = ns.getServerMoneyAvailable(active.target)
          active.estimated.security = Math.max(
            ns.getServerMinSecurityLevel(active.target),
            ns.getServerSecurityLevel(active.target) - 0.05 * active.weaken
          )
        }
      }
    }

    /** @type {Server[]} */
    const servers = getServerList(ns)
      .filter(s => s.hasAdminRights)
      .concat(ns.getPurchasedServers().map(ns.getServer))

    const workers = servers.filter(s => s.maxRam > 0)
    const supply = getAvailableThreads(ns, workers)
    let totalSupply = supply.reduce((t, { threads }) => t + threads, 0)

    const targets = servers.filter(s => s.moneyMax > 0)
    for (let target of targets) {
      let lastOrder = null
      for (let [_, order] of orderMap.get(target.hostname) ?? [])
        if (lastOrder == null || order.end > lastOrder.end)
          lastOrder = order
      if (lastOrder != null) {
        target.moneyAvailable = lastOrder.estimated.money
        target.hackDifficulty = lastOrder.estimated.security
      }
    }
    const orders = createOrders(ns, orderMap, targets, totalSupply)
    for (let order of orders) {
      totalSupply -= cost(order)
      const pids = fulfill(ns, supply, order)
      await ns.sleep(0)
      const active = {
        pids,
        target: order.target.hostname,
        estimated: order.estimated,
        hack: order.hack,
        grow: order.grow,
        weaken: order.weaken,
        percent: order.percent,
        end: performance.now() + order.time
      }
      orderMap.set(active.target, Heap.push(orderMap.get(active.target) ?? [], [active.end, active]))
      Heap.push(orderHeap, [active.end, active])
    }
    ns.writePort(CS.SCRIPTS.STATS.PORT, JSON.stringify({
      type: CS.SCRIPTS.STATS.MESSAGES.FAMILIAR_INFO,
      unused: totalSupply,
      actives: new Map(Array.from(orderMap, ([k, v]) => [k, v.map(([_, a]) => a)])),
    }, mapReplacer))
    if (orderHeap.length > 0) {
      await ns.sleep(Math.max(100, Heap.peek(orderHeap)[1].end - performance.now()))
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
  const pids = []
  for (let action of ["hack", "grow", "weaken"]) {
    let remaining = order[action]
    while (remaining > 0) {
      let worker = supply[supply.length - 1]
      let threads = Math.min(remaining, worker.threads)
      const runOptions = {
        // preventDuplicates: false,
        // ramOverride: ns.getScriptRam(CS.SCRIPTS.ZOMBIE.FILE),
        temporary: true,
        threads
      }
      const args = [
        action,
        order.target.hostname
      ]
      let pid = ns.exec(CS.SCRIPTS.ZOMBIE.FILE, worker.hostname, runOptions, ...args)
      if (pid == 0)
        ns.tprint(`Failed to execute on ${worker.hostname}`)
      else
        pids.push(pid)
      remaining -= threads
      worker.threads -= threads
      if (worker.threads == 0)
        supply.pop()
    }
  }
  return pids
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
  const homeThreads = Math.floor(15 / 16 * homeRam / ramPerThread)
  if (homeThreads > 0)
    available.push({
      hostname: CS.SERVERS.HOME,
      threads: homeThreads
    })

  return available
}

/** @param {NS} ns 
 * @param {Map<string, Array<Order>>} orderMap
 * @param {Server[]} targets 
 * @param {number} supply */
function createOrders(ns, orderMap, targets, supply) {
  /** @type {Map<number, Server[]>} */
  const targetMap = partition(s => designate(ns, orderMap, s), targets)
  /** @type {Map<string, Order>} */
  const pending = new Map()
  const hackTargets = new Set()

  const hackOrders = (targetMap.get(HACK) ?? [])
    .map(s => getHackOrder(ns, s, 1))
    .sort((a, b) => -(expectedValue(a) - expectedValue(b)))

  for (let order of hackOrders) {
    let c = cost(order)
    if (supply < c)
      break
    supply -= c
    pending.set(order.target.hostname, order)
    hackTargets.add(order.target.hostname)
  }
  if (supply == 0)
    return Array.from(pending.values())

  for (let target of targetMap.get(WEAKEN) ?? []) {
    let order = getWeakenOrder(ns, target, supply)
    supply -= cost(order)
    pending.set(target.hostname, order)
    if (supply == 0)
      return Array.from(pending.values())
  }

  for (let target of targetMap.get(GROW) ?? []) {
    let order = getGrowOrder(ns, target, supply)
    supply -= cost(order)
    pending.set(target.hostname, order)
    if (supply == 0)
      return Array.from(pending.values())
  }

  let power = 2
  while (hackTargets.size > 0) {
    for (let hostname of hackTargets) {
      let oldOrder = pending.get(hostname)
      let newOrder = getHackOrder(ns, oldOrder.target, power)
      if (newOrder == null) {
        hackTargets.delete(hostname)
        continue
      }
      let c = cost(newOrder) - cost(oldOrder)
      if (supply < c)
        return Array.from(pending.values())
      supply -= c
      pending.set(hostname, newOrder)
    }
    power++
  }
  return Array.from(pending.values())
}

/** @param {NS} ns
 * @param {Map<string, Array<Order>>} orderMap
 * @param {Server} target */
function designate(ns, orderMap, target) {
  let end = 50 + Math.max(0, ...(orderMap.get(target.hostname) ?? []).map(([_, a]) => a.end))
  const weakenTime = ns.getWeakenTime(target.hostname)
  const security = target.hackDifficulty - target.minDifficulty
  if (weakenTime < 5 * 60e3 && security < 1 && target.moneyAvailable / target.moneyMax > 0.5)
    return end < performance.now() + ns.getHackTime(target.hostname) ? HACK : IGNORE
  if (weakenTime < 15 * 60e3 && security >= 0.05)
    return WEAKEN
  if (weakenTime < 5 * 60e3
    && ns.growthAnalyze(target.hostname, target.moneyMax / Math.max(1, target.moneyAvailable)) >= 1)
    return end < performance.now() + ns.getGrowTime(target.hostname) ? GROW : IGNORE
  return IGNORE
}

/** @param {NS} ns
 * @param {Server} target
 * @param {number} hackThreads */
function getHackOrder(ns, target, hackThreads) {
  const hackPercent = hackThreads * ns.hackAnalyze(target.hostname)
  if (hackPercent >= 0.9)
    return null
  let growThreads = ns.growthAnalyze(target.hostname, 1 / (1 - hackPercent))
  if (growThreads > 1250)
    return null
  growThreads = Math.ceil(growThreads * safeGrowMult(ns, target, growThreads))
  const weakenThreads = Math.ceil(
    (ns.hackAnalyzeSecurity(hackThreads, target.hostname)
      + ns.growthAnalyzeSecurity(growThreads))
    / 0.05)
  const time = ns.getWeakenTime(target.hostname)
  const money = ns.hackAnalyzeChance(target.hostname) * hackPercent * target.moneyAvailable
  const estimated = {
    money: target.moneyAvailable,
    security: target.hackDifficulty
  }
  return {
    target,
    estimated,
    hack: hackThreads,
    grow: growThreads,
    weaken: weakenThreads,
    time,
    money,
  }
}

/** @param {NS} ns
 * @param {Server} target
 * @param {number} maxThreads */
function getWeakenOrder(ns, target, maxThreads) {
  const weakenThreads = Math.min(maxThreads, Math.floor((target.hackDifficulty - target.minDifficulty) / 0.05))
  const time = ns.getWeakenTime(target.hostname)
  const estimated = {
    money: target.moneyAvailable,
    security: target.hackDifficulty - 0.05 * weakenThreads
  }
  return {
    target,
    estimated,
    hack: 0,
    grow: 0,
    weaken: weakenThreads,
    time,
  }
}

/** @param {NS} ns
 * @param {Server} target
 * @param {number} maxThreads */
function getGrowOrder(ns, target, maxThreads) {
  let growThreads = Math.min(1250, ns.growthAnalyze(target.hostname, target.moneyMax / Math.max(1, target.moneyAvailable)))
  const percent = growPercent(target, growThreads)
  const estMoney = Math.min(target.moneyMax, target.moneyAvailable * percent)
  growThreads *= safeGrowMult(ns, target, growThreads)
  let weakenThreads = ns.growthAnalyzeSecurity(growThreads) / 0.05
  if (growThreads + weakenThreads > maxThreads) {
    let scale = maxThreads / (growThreads + weakenThreads)
    growThreads *= scale
    weakenThreads *= scale
  }
  const time = ns.getWeakenTime(target.hostname)
  const estimated = {
    money: estMoney,
    security: target.hackDifficulty
  }
  return {
    target,
    estimated,
    hack: 0,
    grow: maxThreads > 1 ? Math.floor(growThreads) : Math.ceil(growThreads),
    weaken: Math.floor(weakenThreads),
    time,
    percent
  }
}

/** @param {Order} order */
function cost(order) {
  return order.hack + order.grow + order.weaken
}

/** @param {Order} order */
function expectedValue(order) {
  return order.money / order.time / cost(order)
}

/** @param {NS} ns
 * @param {Server} target
 * @param {number} threads */
function safeGrowMult(ns, target, threads) {
  // ** M a g i c **
  return (85875 + 1e4 * Math.max(0, threads * 0.004 + target.hackDifficulty - 9 / 1.05))
    / (85875 + 1e4 * Math.max(0, target.hackDifficulty - 9 / 1.05))
}
