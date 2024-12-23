/** @param {NS} ns */
export async function main(ns) {
  const server = ns.singularity.getCurrentServer()
  ns.tprint(`Installing backdoor on ${server}...`)
  await ns.singularity.installBackdoor()
  ns.tprint(`Installed backdoor on ${server}.`)
}
