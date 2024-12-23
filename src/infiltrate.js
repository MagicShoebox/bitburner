
/** @param {NS} ns */
export async function main(ns) {
  let savedEvent = null
  ns.tprintRaw(React.createElement("button", { class: "css-13ak5e0", onClick: e => savedEvent = e }, "Click me!"))

  while (savedEvent == null) {
    await ns.asleep(1e3)
  }

  /** @type {Document} */
  const dom = document
  const root = dom.getElementById("root")
  const terminalButton = [...root.querySelectorAll("div[role='button']")]
    .find(x => x.textContent == "Terminal")

  ns.singularity.goToLocation(ns.enums.LocationName.NewTokyoNoodleBar)

  const infiltrateButton = [...root.querySelectorAll("button")]
    .find(x => x.textContent == "Infiltrate Company")
  click(ns, infiltrateButton, savedEvent)

  // const infiltrations = ns.infiltration.getPossibleLocations()
  //   .map(x => ns.infiltration.getInfiltration(x.name))
  //   .sort((a, b) => a.difficulty - b.difficulty)
  // for (const x of infiltrations.slice(ns.args[0],ns.args[0]+5)) {
  //   ns.tprint(
  //     `${x.location.city} ${x.location.name} ${x.difficulty} ${ns.formatNumber(x.reward.sellCash)}`
  //   )
  // }
}

/** @param {Element} element */
function click(ns, element, savedEvent) {
  // const event = new Event("click", {bubbles: true, cancelable:true})
  // element.dispatchEvent(savedEvent)
  element[Object.keys(element)[1]].onClick(savedEvent)
  // element.onclick(null, null, event)
}
