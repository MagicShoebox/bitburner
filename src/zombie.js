/** @param {NS} ns */
export async function main(ns) {
  const action = ns.args[0]
  const target = ns.args[1]
  const endTime = ns.args[2] ?? 0
  const stock = ns.args[3] ?? false
  let additionalMsec = endTime - performance.now()
  if (additionalMsec < 0) {
    ns.tprint(`Negative delay: ${additionalMsec}`)
    additionalMsec = 0
  }
  const options = {
    additionalMsec,
    stock
  }
  switch (action) {
    case "hack":
      await ns.hack(target, options)
      break
    case "grow":
      await ns.grow(target, options)
      break
    case "weaken":
      await ns.weaken(target, options)
      break
  }
}
