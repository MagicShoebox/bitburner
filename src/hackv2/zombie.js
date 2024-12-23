/** @param {NS} ns */
export async function main(ns) {
  const action = ns.args[0]
  const target = ns.args[1]
  switch (action) {
    case "hack":
      await ns.hack(target)
      break
    case "grow":
      await ns.grow(target)
      break
    case "weaken":
      await ns.weaken(target)
      break
  }
}
