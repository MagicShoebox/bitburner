import { onReset } from "./servers.js"

/** @param {NS} ns */
export async function main(ns) {
  onReset()
  if (ns.singularity.getOwnedAugmentations(true).length > ns.singularity.getOwnedAugmentations().length)
    ns.singularity.installAugmentations()
  else
    ns.singularity.softReset()
}
