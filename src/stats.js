import { CS, mapReviver, partition } from "./util.js"
import { getServerList } from "./servers.js"

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("getServerMaxRam")
  ns.disableLog("getServerUsedRam")
  ns.disableLog("asleep")
  ns.clearLog()
  let closed = false
  const setClosed = (c) => closed = c
  ns.tail()
  ns.moveTail(20, 20)
  ns.resizeTail(1100, 700)
  ns.printRaw(React.createElement(App, { ns, setClosed }))
  while (!closed)
    await ns.asleep(5e3)
}

function App({ ns, setClosed }) {
  const port = ns.getPortHandle(CS.SCRIPTS.STATS.PORT)
  const [servers, setServers] = React.useState(getServerList(ns))
  const [familiar, setFamiliar] = React.useState(null)
  const message = usePort(port)

  React.useEffect(() => () => setClosed(true), [])

  React.useEffect(() => {
    let timer = setInterval(() => {
      setServers(
        getServerList(ns)
          .filter(s => s.hasAdminRights)
          .concat(ns.getPurchasedServers().map(ns.getServer))
      )
    }, 250)
    return () => clearInterval(timer)
  }, [])

  React.useEffect(() => {
    if (message != CS.PORTS.EMPTY_TOKEN) {
      switch (message.type) {
        case CS.SCRIPTS.STATS.MESSAGES.FAMILIAR_INFO:
          setFamiliar(message)
          break
        default:
          ns.tprint(`Unknown message: ${message.type}`)
          break
      }
    }
  }, [message])

  return React.createElement("div",
    null,
    React.createElement(Totals, { ns, servers }),
    React.createElement(ServerList, { ns, servers, familiar })
  )
}

function usePort(port) {
  const [message, setMessage] = React.useState(CS.PORTS.EMPTY_TOKEN)
  React.useEffect(() => {
    let listening = true
    async function getMessage() {
      while (listening) {
        let m = port.read()
        while (m == CS.PORTS.EMPTY_TOKEN) {
          await port.nextWrite()
          m = port.read()
        }
        setMessage(JSON.parse(m, mapReviver))
      }
    }
    getMessage()
    return () => listening = false
  }, [port])
  return message
}

/** @param {{ns: NS, servers: Server[]}} */
function Totals({ ns, servers }) {
  const ramPerThread = ns.getScriptRam(CS.SCRIPTS.ZOMBIE.FILE)
  let capacity = servers
    .map(s => Math.floor(s.maxRam / ramPerThread))
    .reduce((t, x) => t + x, 0)
  let used = servers
    .map(s => Math.floor(s.ramUsed / ramPerThread))
    .reduce((t, x) => t + x, 0)
  let homeMax = ns.getServerMaxRam(CS.SERVERS.HOME)
  homeMax -= 260 + 64
  let homeUsed = ns.getServerUsedRam(CS.SERVERS.HOME)
  homeUsed -= 260
  capacity += Math.max(0, Math.floor(homeMax / ramPerThread))
  used += Math.max(0, Math.floor(homeUsed / ramPerThread))
  const income = ns.isRunning(CS.SCRIPTS.FAMILIAR.FILE, CS.SERVERS.HOME) ?
    ns.getScriptIncome(CS.SCRIPTS.FAMILIAR.FILE, CS.SERVERS.HOME)
    : 0
  return React.createElement("div", { style: { "display": "flex", "gap": "10px" } },
    React.createElement("h4", null, `Income: ${ns.formatNumber(income)} / s`),
    React.createElement("h4", null, `Threads: ${used} / ${capacity} (${ns.formatPercent(used / capacity)})`),
    React.createElement("h4", null, `\$${ns.formatNumber(income / capacity)} / thread / s`)
  )
}

/** @param {{ns: NS, servers: Server[]}} */
function ServerList({ ns, servers, familiar }) {
  const processes = ns.ps(CS.SERVERS.HOME)
    .filter(p => p.filename == CS.SCRIPTS.ZOMBIE.FILE)
    .concat(servers.flatMap(s => ns.ps(s.hostname)))
  const processMap = partition(p => p.args[1], processes)
  for (let [k, v] of processMap.entries()) {
    const actionMap = partition(p => p.args[0], v)
    for (let [kk, vv] of actionMap.entries()) {
      actionMap.set(kk, vv.reduce((t, { threads }) => t + threads, 0))
    }
    processMap.set(k, actionMap)
  }

  return React.createElement("table",
    null,
    React.createElement("thead", null,
      React.createElement("tr", null,
        React.createElement("th", null, "Name"),
        React.createElement("th", null, "Avail"),
        React.createElement("th", null, "Max"),
        React.createElement("th", null, "Pct"),
        React.createElement("th", null, "Sec"),
        React.createElement("th", null, "Min"),
        React.createElement("th", null, "Latest"),
        React.createElement("th", null, "Hack"),
        React.createElement("th", null, "Grow"),
        React.createElement("th", null, "Weaken"),
      )),
    React.createElement("tbody", null,
      servers
        .filter(s => !s.purchasedByPlayer && s.moneyMax > 0)
        .sort((s, t) => s.moneyMax - t.moneyMax)
        .map(server => React.createElement(
          Server, { ns, server, actionMap: processMap.get(server.hostname), latest: familiar?.latest.get(server.hostname) }
        ))))
}

/** @param {{ns: NS, server: Server}} */
function Server({ ns, server, actionMap, latest }) {
  let style = { "text-align": "right", "padding": "0 15px" }
  return React.createElement("tr", { key: server.hostname },
    React.createElement("td", null, server.hostname),
    React.createElement("td", { style }, ns.formatNumber(server.moneyAvailable).padStart(8)),
    React.createElement("td", { style }, ns.formatNumber(server.moneyMax)),
    React.createElement("td", { style }, ns.formatPercent(server.moneyAvailable / server.moneyMax).padStart(7)),
    React.createElement("td", { style }, ns.formatNumber(server.hackDifficulty, 2)),
    React.createElement("td", { style }, ns.formatNumber(server.minDifficulty, 2)),
    React.createElement("td", { style }, (latest ?? "").padStart(10)),
    React.createElement("td", { style }, actionMap?.get("hack") ?? 0),
    React.createElement("td", { style }, actionMap?.get("grow") ?? 0),
    React.createElement("td", { style }, actionMap?.get("weaken") ?? 0),
  )
}

function Chart({ ns, money }) {
  const canvasRef = React.useRef(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    context.fillStyle = "red"
    context.fillRect(0, 0, 100, money / 1e6)
  }, [money])

  return React.createElement("canvas", { ref: canvasRef })
}
