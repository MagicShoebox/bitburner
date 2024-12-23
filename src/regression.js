/** @param {NS} ns */
export async function main(ns) {
  let clip = []
  // let ys = []
  let zs = []
  let server = ns.formulas.mockServer()
  server.serverGrowth = 50
  server.moneyAvailable = 1e10
  server.moneyMax = 500e10
  server.hackDifficulty = 20
  let player = ns.formulas.mockPlayer()
  let threads = 1
  let mult = 10
  for (let x = 0.01; x <= 0.9; x += 0.01) {
    const hackThreads = x * 1e3
    const regrow = 1 / (1 - x)
    const hackSecurity = 0.002 * hackThreads
    const weaken1Threads = Math.ceil(hackSecurity / 0.05)
    const growThreads = ns.formulas.hacking.growThreads(server, player, regrow * server.moneyAvailable)
    const weaken2Threads = Math.ceil(growThreads * 0.004 / 0.05)
    const y = x * 1e4 / (hackThreads + growThreads + weaken2Threads)
    ns.tprint(`${x} ${y}`)
    clip.push(`(${x},${y})`)
    // ys.push(y)
    // zs.push(z)
  }
  // ns.tprint(zs.reduce((t,x)=>t+x) / zs.length)
  await navigator.clipboard.writeText(
    `[${clip.join(",")}]`
  )
}


