import { CS } from "./util.js"
import { calculateExp } from "./formulas.js"

/** @param {NS} ns */
export async function main(ns) {
  if (!ns.gang.inGang() && !createGang(ns)) {
    ns.tprint("Can't start gang")
    return
  }

  while (true) {
    let funds = ns.getServerMoneyAvailable(CS.SERVERS.HOME)
    let stats = ns.gang.getGangInformation()
    let members = ns.gang.getMemberNames().map(ns.gang.getMemberInformation)
    while (ns.gang.canRecruitMember()) {
      let name = recruit(ns, members)
      if (name != null)
        members.push(ns.gang.getMemberInformation(name))
    }
    ascend(ns, members)
    equip(ns, members)
    for (let m of members) {
      if (m.hack_asc_mult < 15 || m.hack < 3e3) {
        if (m.task != "Train Hacking") {
          ns.gang.setMemberTask(m.name, "Train Hacking")
          m.task = "Train Hacking"
        }
        continue
      }
      if (m.task != "Ethical Hacking" || stats.wantedPenalty > 0.95) {
        if (funds < 10e9 || ns.singularity.getFactionRep(stats.faction) > 2.5e6) {
          ns.gang.setMemberTask(m.name, "Money Laundering")
          m.task = "Money Laundering"
        } else {
          ns.gang.setMemberTask(m.name, "Cyberterrorism")
          m.task = "Cyberterrorism"
        }
        continue
      }
    }
    if (stats.wantedPenalty < 0.95 && members.every(m => m.task != "Ethical Hacking")) {
      let fixerCandidates = members
        .filter(m => m.task == "Money Laundering")
        .sort((a, b) => a.hack - b.hack)
      if (fixerCandidates.length > 0) {
        let fixer = fixerCandidates[0]
        ns.gang.setMemberTask(fixer.name, "Ethical Hacking")
        fixer.task = "Ethical Hacking"
      }
    }
    await ns.sleep(CS.SCRIPTS.GANG.INTERVAL)
  }
}

/** @param {NS} ns */
function createGang(ns) {
  return ns.getPlayer().factions.some(ns.gang.createGang)
}

/** @param {NS} ns 
 * @param {GangMemberInfo[]} members */
function recruit(ns, members) {
  let names = [
    "Rogers", "Thor", "Banner", "Stark", "Romanov", "Barton",
    "Maximoff", "Wilson", "Barnes", "Strange", "Parker", "T'Challa"
  ]
  let existing = new Set(members.map(m => m.name))
  let name = names.filter(n => !existing.has(n))
  if (name.length == 0) {
    ns.tprint("Come up with more names, idiot")
    return
  }
  if (ns.gang.recruitMember(name[0]))
    return name[0]
  return null
}

/** @param {NS} ns 
 * @param {GangMemberInfo[]} members */
function ascend(ns, members) {
  const threshold = (skl, skl_asc, skl_exp, skl_eqp, asc_mul) => {
    let skl_goal = skl / skl_eqp * asc_mul
    let skl_goal_base = skl_goal / skl_eqp / skl_asc
    let exp_goal = calculateExp(skl_goal_base)
    return skl_exp <= exp_goal / 2
  }
  members
    .map(m => ({
      m,
      asc: ns.gang.getAscensionResult(m.name)
    }))
    .filter(({ asc }) => asc != undefined)
    .filter(({ m, asc }) =>
      ["agi", "cha", "def", "dex", "hack", "str"].some(skl =>
        threshold(m[skl], m[`${skl}_asc_mult`], m[`${skl}_exp`], m[`${skl}_mult`], asc[skl])
      ))
    .forEach(({ m }) => ns.gang.ascendMember(m.name))
}

/** @param {NS} ns 
 * @param {GangMemberInfo[]} members */
function equip(ns, members) {
  let rootkits = ns.gang.getEquipmentNames()
    .filter(n => ns.gang.getEquipmentType(n) == "Rootkit")
  return members
    .map(m => ({
      ...m,
      upgrades: new Set(m.upgrades)
    }))
    .flatMap(m => rootkits
      .filter(r => !m.upgrades.has(r))
      .map(r => ({
        name: m.name,
        item: r
      })))
    .sort(({ item: a }, { item: b }) => ns.gang.getEquipmentCost(a) - ns.gang.getEquipmentCost(b))
    .every(({ name, item }) => ns.gang.purchaseEquipment(name, item))
}
