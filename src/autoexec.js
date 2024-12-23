import { CS } from "./util.js"

/** @param {NS} ns */
export async function main(ns) {
    ns.atExit(() => stopDaemons(ns))
    startDaemons(ns)
    while (true)
      await ns.sleep(600e3)
}

/** @param {NS} ns */
function startDaemons(ns) {
  runSingleIfAble(ns, CS.SCRIPTS.NECRO.FILE, 1)
  runSingleIfAble(ns, CS.SCRIPTS.FAMILIAR.FILE, 1)
  runSingleIfAble(ns, CS.SCRIPTS.TREASURER.FILE, 1)
  runSingleIfAble(ns, CS.SCRIPTS.GANG.FILE, 1)
  let availRam = ns.getServerMaxRam(CS.SERVERS.HOME) - ns.getServerUsedRam(CS.SERVERS.HOME)
  availRam -= 64 // Buffer for manually run scripts
  let shareThreads = Math.min(64, Math.max(1, Math.floor(1 / 64 * availRam)))
  runSingleIfAble(ns, CS.SCRIPTS.SHARE.FILE, shareThreads)
}

/** @param {NS} ns */
function stopDaemons(ns) {
  ns.scriptKill(CS.SCRIPTS.NECRO.FILE, CS.SERVERS.HOME)
  ns.scriptKill(CS.SCRIPTS.FAMILIAR.FILE, CS.SERVERS.HOME)
  ns.scriptKill(CS.SCRIPTS.TREASURER.FILE, CS.SERVERS.HOME)
  ns.scriptKill(CS.SCRIPTS.GANG.FILE, CS.SERVERS.HOME)
  ns.scriptKill(CS.SCRIPTS.SHARE.FILE, CS.SERVERS.HOME)
}

/** @param {NS} ns */
function runSingleIfAble(ns, file, threads) {
  if (ns.isRunning(file))
    return
  let avail = ns.getServerMaxRam(CS.SERVERS.HOME) - ns.getServerUsedRam(CS.SERVERS.HOME)
  if (avail >= threads * ns.getScriptRam(file))
    ns.run(file, {temporary: true, threads})
  else
    ns.tprint(`Not enough memory to run ${file}`)
}
