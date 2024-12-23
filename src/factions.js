import {partition} from "./util.js"

const FactionName = {
  Illuminati: "Illuminati",
  Daedalus: "Daedalus",
  TheCovenant: "The Covenant",
  ECorp: "ECorp",
  MegaCorp: "MegaCorp",
  BachmanAssociates: "Bachman & Associates",
  BladeIndustries: "Blade Industries",
  NWO: "NWO",
  ClarkeIncorporated: "Clarke Incorporated",
  OmniTekIncorporated: "OmniTek Incorporated",
  FourSigma: "Four Sigma",
  KuaiGongInternational: "KuaiGong International",
  FulcrumSecretTechnologies: "Fulcrum Secret Technologies",
  BitRunners: "BitRunners",
  TheBlackHand: "The Black Hand",
  NiteSec: "NiteSec",
  Aevum: "Aevum",
  Chongqing: "Chongqing",
  Ishima: "Ishima",
  NewTokyo: "New Tokyo",
  Sector12: "Sector-12",
  Volhaven: "Volhaven",
  SpeakersForTheDead: "Speakers for the Dead",
  TheDarkArmy: "The Dark Army",
  TheSyndicate: "The Syndicate",
  Silhouette: "Silhouette",
  Tetrads: "Tetrads",
  SlumSnakes: "Slum Snakes",
  Netburners: "Netburners",
  TianDiHui: "Tian Di Hui",
  CyberSec: "CyberSec",
  Bladeburners: "Bladeburners",
  ChurchOfTheMachineGod: "Church of the Machine God",
  ShadowsOfAnarchy: "Shadows of Anarchy",
}

const AugmentationClass = {
  Ignore: "Ignore",
  Hacking: "Hacking",
  FactionRep: "Faction Reputation",
  CompanyRep: "Company Reputation",
  Special: "Special"
}

const TARGET_FACTIONS = [
  FactionName.Sector12,
  FactionName.TianDiHui,
  FactionName.BachmanAssociates,
  FactionName.Chongqing,
  FactionName.CyberSec,
  FactionName.NiteSec,
  FactionName.TheBlackHand,
  FactionName.BitRunners,
  FactionName.Daedalus
]

/** @param {NS} ns */
export async function main(ns) {
  const haveAugs = new Set(TARGET_FACTIONS.flatMap(f => ns.singularity.getAugmentationsFromFaction(f)))
  const wantAugs = getDesiredAugmentations(ns).filter(a => !haveAugs.has(a))
  const foo = new Map()
  for (let x of wantAugs) {
    for (let f of ns.singularity.getAugmentationFactions(x)) {
      foo.set(f, foo.get(f) ?? [])
      foo.get(f).push(x)
    }
  }
  for (let [k,v] of foo.entries())
    ns.tprint(`${k} -- ${v}`)
  return
  while (true) {
    ns.singularity.checkFactionInvitations()
      .filter(f => MAIN_FACTIONS.has(f))
      .forEach(f => ns.singularity.joinFaction(f))
    // ns.singularity.getFactionRep()
    // if (!ns.singularity.isBusy())
    // ns.singularity.getCurrentWork()
    // ns.singularity.workForFaction("Daedalus", ns.enums.FactionWorkType.hacking)
    await ns.sleep(60e3)
  }
}

/** @param {NS} ns */
function getAugmentationNames(ns) {
  return [...new Set(Object.values(FactionName)
    .flatMap(f => ns.singularity.getAugmentationsFromFaction(f)))]
}

/** @param {NS} ns */
function classifyAugmentation(ns, name) {
  if (name == "CashRoot Starter Kit" || name == "Neuroreceptor Management Implant")
    return AugmentationClass.Special
  const stats = ns.singularity.getAugmentationStats(name)
  const hackingStats = Object.keys(stats).filter(k => k.startsWith("hacking"))
  if (hackingStats.some(k => stats[k] > 1))
    return AugmentationClass.Hacking
  if (stats.faction_rep > 1)
    return AugmentationClass.FactionRep
  if (stats.company_rep > 1)
    return AugmentationClass.CompanyRep
  return AugmentationClass.Ignore
}

/** @param {NS} ns */
function getDesiredAugmentations(ns) {
  const desiredClasses = new Set([
    AugmentationClass.Hacking,
    AugmentationClass.FactionRep,
    //AugmentationClass.CompanyRep,
    AugmentationClass.Special
  ])
  return getAugmentationNames(ns)
    .filter(a => desiredClasses.has(classifyAugmentation(ns, a)))
}
