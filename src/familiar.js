import { CS, mapReplacer, partition } from "./util.js"
import { getServerList } from "./servers.js"

const IGNORE = 0
const HACK = 1
const GROW = 2
const WEAKEN = 3
const INTERVAL = 1000

const ACTION_DISPLAY = new Map([
  [IGNORE, "Ignore 💤"],
  [HACK, "Hack ✖"],
  [GROW, "Grow ✖"],
  [WEAKEN, "Weaken ✖"]
])

/** @typedef {{hostname: string,
 *             threads: number}} Worker */

/**
 * @typedef {{money: number, 
 *            security: number }} Estimated
 */

/**
 * @typedef {{estimated: Estimated, 
 *            end: number }} Active
 */

/**
 * @typedef {{target: Server,
 *            estimated: Estimated,
 *            hack: number,
 *            weaken1: number,
 *            grow: number,
 *            weaken2: number }} Order
 */

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("getServerMaxRam")
  ns.disableLog("getServerUsedRam")
  ns.disableLog("sleep")
  ns.disableLog("exec")
  /** @type {Map<string, Active>} */
  const activeMap = new Map()
  /** @type {Map<string, string>} */
  const targetMap = new Map()
  let lastCycle = Math.trunc(performance.now()) //% (10 * INTERVAL)
  let failsafe = 0
  while (failsafe < 5) {
    const startCycle = Math.trunc(performance.now()) //% (10 * INTERVAL)

    /** @type {Server[]} */
    const servers = getServerList(ns)
      .filter(s => s.hasAdminRights)
      .concat(ns.getPurchasedServers().map(ns.getServer))

    const targets = servers.filter(s => s.moneyMax > 0)
    updateTargets(targets, activeMap)

    /** @type {Map<number, Server[]>} */
    const actionMap = partition(s => designate(ns, activeMap, s), targets)
    actionMap.forEach((v, k) => v.forEach(s => {
      targetMap.set(s.hostname, ACTION_DISPLAY.get(k))
    }))

    const workers = getWorkers(ns, servers).sort(({ threads: a }, { threads: b }) => b - a)
    let supply = workers.reduce((t, { threads }) => t + threads, 0)

    while (supply > 0 && actionMap.get(WEAKEN)?.length > 0) {
      const target = actionMap.get(WEAKEN).pop()
      targetMap.set(target.hostname, "Weaken ✔")
      const order = getWeakenOrder(ns, target, supply)
      supply -= cost(order)
      fulfill(ns, activeMap, workers, order)
      // await ns.sleep(0)
    }

    while (supply > 0 && actionMap.get(GROW)?.length > 0) {
      const target = actionMap.get(GROW).pop()
      targetMap.set(target.hostname, "Grow ✔")
      const order = getGrowOrder(ns, target, supply, workers[0].threads)
      supply -= cost(order)
      fulfill(ns, activeMap, workers, order)
      // await ns.sleep(0)
    }

    const hackTargets = new Map((actionMap.get(HACK) ?? []).map(s => [s.hostname, s]))
    while (supply > 0 && hackTargets.size > 0) {
      let maxOrder = null
      for (let target of hackTargets.values()) {
        const order = getHackOrder(ns, target, supply, workers[0].threads)
        if (order?.value ?? 0 > maxOrder?.value ?? 0)
          maxOrder = order
      }
      if (maxOrder == null)
        break
      hackTargets.delete(maxOrder.target.hostname)
      targetMap.set(maxOrder.target.hostname, `Hack ${maxOrder.hack} ✔`)
      supply -= cost(maxOrder)
      fulfill(ns, activeMap, workers, maxOrder)
      // await ns.sleep(0)
    }

    ns.writePort(CS.SCRIPTS.STATS.PORT, JSON.stringify({
      type: CS.SCRIPTS.STATS.MESSAGES.FAMILIAR_INFO,
      latest: targetMap,
    }, mapReplacer))
    const endCycle = Math.trunc(performance.now()) //% (10 * INTERVAL)
    if (endCycle - startCycle > INTERVAL)
      failsafe++
    ns.print(`Interval: ${startCycle - lastCycle} Start: ${startCycle} End: ${endCycle} Length: ${endCycle - startCycle}`)
    lastCycle = startCycle
    if (activeMap.size > 0) {
      const sleep = INTERVAL - performance.now() % INTERVAL
      ns.print(`Sleeping ${Math.trunc(sleep) / 1000}s with ${supply} unused`)
      await ns.sleep(sleep)
    } else {
      ns.tprint("Familiar idle")
      await ns.sleep(CS.SCRIPTS.FAMILIAR.INTERVAL)
    }
  }
  ns.tprint("Failsafe triggered")
}

/** @param {Server[]} targets
 *  @param {Map<string, Active>} activeMap */
function updateTargets(targets, activeMap) {
  for (let target of targets) {
    if (activeMap.has(target.hostname)) {
      let active = activeMap.get(target.hostname)
      if (performance.now() < active.end) {
        target.moneyAvailable = active.estimated.money
        target.hackDifficulty = active.estimated.security
      } else {
        activeMap.delete(target.hostname)
      }
    }
  }
}

/** @param {NS} ns 
 * @param {Map<string, Active>} activeMap
 * @param {Worker[]} workers
 * @param {Order} order */
function fulfill(ns, activeMap, workers, order) {
  const hackTime = ns.getHackTime(order.target.hostname)
  const growTime = ns.getGrowTime(order.target.hostname)
  const weakenTime = ns.getWeakenTime(order.target.hostname)
  const now = performance.now()
  let landTime = now + weakenTime + INTERVAL - (now + weakenTime) % INTERVAL
  if (landTime < (activeMap.get(order.target.hostname)?.end ?? 0)) {
    // ns.print(`Danger: ${order.target.hostname}: ${landTime} ${landTime - activeMap.get(order.target.hostname).end}`)
    landTime += INTERVAL
  }
  const endTimes = {
    "hack": landTime + 0.2 * INTERVAL - hackTime,
    "weaken1": landTime + 0.4 * INTERVAL - weakenTime,
    "grow": landTime + 0.6 * INTERVAL - growTime,
    "weaken2": landTime + 0.8 * INTERVAL - weakenTime
  }
  const end = landTime + INTERVAL
  for (let stage of ["grow", "hack", "weaken1", "weaken2"]) {
    let remaining = order[stage]
    const endTime = endTimes[stage]
    while (remaining > 0) {
      const worker = stage == "grow" ? workers.shift() : workers.pop()
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
        endTime
      ]
      if (ns.exec(CS.SCRIPTS.ZOMBIE.FILE, worker.hostname, runOptions, ...args) == 0)
        ns.tprint(`Failed to execute on ${worker.hostname}`)
      remaining -= threads
      worker.threads -= threads
      if (worker.threads != 0) {
        workers.push(worker)
        workers.sort(({ threads: a }, { threads: b }) => b - a)
      }
    }
  }

  const active = {
    estimated: order.estimated,
    end
  }
  activeMap.set(order.target.hostname, active)
}

/** @param {NS} ns 
 * @param {Server[]} workers
 * @return Worker[] */
function getWorkers(ns, servers) {
  const ramPerThread = ns.getScriptRam(CS.SCRIPTS.ZOMBIE.FILE)
  const workers = servers
    .filter(s => s.maxRam > 0)
    .map(s => ({
      hostname: s.hostname,
      threads: Math.floor((s.maxRam - s.ramUsed) / ramPerThread)
    }))
    .filter(({ threads }) => threads > 0)
  let homeRam = ns.getServerMaxRam(CS.SERVERS.HOME) - ns.getServerUsedRam(CS.SERVERS.HOME)
  homeRam -= 64 // Buffer for manually run scripts
  const homeThreads = Math.floor(homeRam / ramPerThread)
  if (homeThreads > 0)
    workers.push({
      hostname: CS.SERVERS.HOME,
      threads: homeThreads
    })

  return workers
}

/** @param {NS} ns
 * @param {Map<string, Order>} activeMap
 * @param {Server} target */
function designate(ns, activeMap, target) {
  const weakenTime = ns.getWeakenTime(target.hostname)
  if (weakenTime < INTERVAL
    || weakenTime > 10 * 60e3
    || activeMap.get(target.hostname)?.end > performance.now() + weakenTime + INTERVAL * 2)
    return IGNORE
  const security = target.hackDifficulty - target.minDifficulty
  const money = target.moneyAvailable / target.moneyMax
  if (security < 0.05 && money > 0.95)
    return HACK
  if (security >= 0.05)
    return WEAKEN
  if (money <= 0.95)
    return GROW
  return IGNORE
}

/** @param {NS} ns
 * @param {Server} target
 * @param {number} maxThreads
 * @return {Order} */
function getWeakenOrder(ns, target, maxThreads) {
  const weakenThreads = Math.min(
    10,
    maxThreads,
    Math.ceil((target.hackDifficulty - target.minDifficulty) / 0.05)
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
 * @param {number} maxThreads
 * @param {number} maxGrowThreads */
function getGrowOrder(ns, target, maxThreads, maxGrowThreads) {
  const goal = Math.min(
    target.moneyAvailable + 0.02 * target.moneyMax,
    target.moneyMax
  )
  let growThreads = Math.min(
    maxGrowThreads,
    ns.growthAnalyze(target.hostname, goal / Math.max(1, target.moneyAvailable))
  )
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
    money: Math.min(target.moneyMax, (target.moneyAvailable + growThreads) * growth),
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

/** @param {NS} ns
 * @param {Server} target
 * @param {number} maxThreads
 * @param {number} maxGrowThreads
 * @return {Order | null} */
function getHackOrder(ns, target, maxThreads, maxGrowThreads) {
  if (maxGrowThreads == 0)
    return null
  const growth = ns.formulas.hacking.growPercent(target, maxGrowThreads, ns.getPlayer())
  const hackPercent = Math.min(0.9, 1 - 1 / growth)
  const hackThreads = Math.floor(hackPercent / ns.hackAnalyze(target.hostname))
  if (isNaN(hackThreads)) {
    ns.tprint(`Bad getHackOrder: ${target.hostname} ${maxThreads} ${maxGrowThreads}`)
    return null
  }
  if (hackThreads == 0)
    return null
  const hackSecurity = ns.hackAnalyzeSecurity(hackThreads)
  const weaken1Threads = Math.ceil(hackSecurity / 0.05)
  const growThreads = Math.ceil(ns.growthAnalyze(target.hostname, 1 / (1 - hackPercent)))
  const weaken2Threads = Math.ceil(ns.growthAnalyzeSecurity(growThreads) / 0.05)
  const total = hackThreads + weaken1Threads + growThreads + weaken2Threads
  if (total > maxThreads) {
    return getHackOrder(ns, target, maxThreads, Math.floor(maxGrowThreads / 2))
  }
  const value = ns.hackAnalyzeChance(target.hostname)
    * hackPercent
    * target.moneyAvailable
    / ns.getWeakenTime(target.hostname)
    / total
  const estimated = {
    money: Math.floor(0.9 * target.moneyAvailable + 0.1 * ns.getServerMoneyAvailable(target.hostname)),
    security: Math.floor(0.9 * target.hackDifficulty + 0.1 * ns.getServerSecurityLevel(target.hostname))
  }
  return {
    target,
    estimated,
    hack: hackThreads,
    weaken1: weaken1Threads,
    grow: growThreads,
    weaken2: weaken2Threads,
    value,
  }
}

/** @param {Order} order */
function cost(order) {
  return order.hack + order.grow + order.weaken1 + order.weaken2
}
