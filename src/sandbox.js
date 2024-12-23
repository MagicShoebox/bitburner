import { CS, getRandomInt } from "./util.js"
import { getServerList } from "./servers.js"

/** @param {NS} ns */
export async function main(ns) {
}

/** @param {NS} ns */
// async function testContracts(ns) {
//   for (let type of ns.codingcontract.getContractTypes()) {
//     for (let i = 0; i < 50; i++) {
//       ns.codingcontract.createDummyContract(type)
//       let f = ns.ls("home", ".cct")[0]
//       ns.run("coding.js", 1, f)
//       await ns.sleep(100)
//       if (ns.fileExists(f)) {
//         return
//       }
//     }
//   }
// }
