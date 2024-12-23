export function growThreads(server, mult) {
  return Math.ceil(
    (85875 * Math.log(mult) + 1e4 * Math.log(mult) * Math.max(0, server.hackDifficulty - 9 / 1.05))
    / (3 * server.serverGrowth)
  )
}

export function growPercent(server, threads) {
  return Math.exp(3 * threads * server.serverGrowth / (85864.19836707058 + 10000.00234309814 * Math.max(0, server.hackDifficulty - 9 / 1.05)))
}

export function calculateExp(level) {
  return Math.exp((200 + level) / 32) - 534.6
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
