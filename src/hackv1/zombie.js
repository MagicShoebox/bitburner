import { CS, getRandomInt } from "./util.js"

/** @param {NS} ns */
export async function main(ns) {
  const hostname = ns.args[0]
  const threads = ns.args[1]
  ns.setTitle(`${CS.SCRIPTS.ZOMBIE.NAME}: ${hostname}`)
  const port = ns.getPortHandle(CS.SCRIPTS.ZOMBIE.PORT)
  while (true) {
    let message = port.read()
    while (message == CS.PORTS.EMPTY_TOKEN) {
      ns.setTitle(`${CS.SCRIPTS.ZOMBIE.NAME}: ${hostname} awaiting orders`)
      await port.nextWrite()
      message = port.read()
    }
    let { target, action, threads: max_threads } = JSON.parse(message)
    if (threads < max_threads) {
      message = JSON.stringify({ target, action, threads: max_threads - threads })
      while (!port.tryWrite(message)) {
        ns.tprint("Zombie stuck")
        await ns.sleep(getRandomInt(1000, 1100))
      }
    }
    switch (action) {
      case CS.SCRIPTS.ZOMBIE.MESSAGES.HACK:
        ns.setTitle(`${CS.SCRIPTS.ZOMBIE.NAME}: ${hostname} hacking ${target}`)
        await ns.hack(target, { threads })
        break
      case CS.SCRIPTS.ZOMBIE.MESSAGES.GROW:
        ns.setTitle(`${CS.SCRIPTS.ZOMBIE.NAME}: ${hostname} growing ${target}`)
        await ns.grow(target)
        break
      case CS.SCRIPTS.ZOMBIE.MESSAGES.WEAKEN:
        ns.setTitle(`${CS.SCRIPTS.ZOMBIE.NAME}: ${hostname} weakening ${target}`)
        await ns.weaken(target)
        break
      default:
        ns.tprint(`Unrecognized message read by ${hostname}: ${action}`)
    }
  }
}
