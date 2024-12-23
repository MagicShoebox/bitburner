import { CS, Heap, getRandomBigInt, intdiv, log2 } from "./util.js"
import { getServerList } from "./servers.js"

/** @param {NS} ns */
export async function main(ns) {
  let contract, contractType, data, answer, reward
  switch (ns.args.length) {
    case 0:
      const contracts = getContracts(ns)
      for (contract of contracts) {
        const { file, hostname } = contract;
        ({ contractType, data, answer, reward } = attempt(ns, contract))
        if (answer == null) {
          ns.tprint(`No solver for ${file} on ${hostname} (${contractType})`)
          ns.codingcontract.createDummyContract(contractType)
          const dummyFile = ns.ls(CS.SERVERS.HOME, ".cct")[0]
          ns.tprint(`Created dummy contract ${dummyFile}`)
          continue
        }
        if (reward.length == 0) {
          ns.tprint(`Wrong answer for ${file} on ${hostname} (${contractType})`)
          ns.tprint(data)
          ns.tprint(answer)
          continue
        }
        ns.tprint(`Solved ${file} on ${hostname} (${contractType})`)
        ns.tprint(reward)
      }
      break
    case 1:
      contract = { hostname: CS.SERVERS.HOME, file: ns.args[0] };
      ({ data, answer, reward } = attempt(ns, contract))
      ns.tprint(data)
      ns.tprint(answer)
      ns.tprint(reward)
      break
    case 2:
      if (ns.args[1].endsWith(".cct")) {
        ({ contractType, data } = getContract(ns, ns.args[0], ns.args[1]))
      } else {
        contractType = ns.args[0]
        data = ns.args[1][0] == "[" ? JSON.parse(ns.args[1]) : ns.args[1]
      }
      answer = solve(ns, contractType, data)
      ns.tprint(data)
      ns.tprint(answer)
      break
  }
}

/** @param {NS} ns */
function attempt(ns, contract) {
  const { hostname, file } = contract
  const { contractType, data } = getContract(ns, hostname, file)
  const answer = solve(ns, contractType, data)
  let reward
  if (answer == null) {
    reward = null
  } else {
    reward = ns.codingcontract.attempt(answer, file, hostname)
  }
  return { contractType, data, answer, reward }
}

/** @param {NS} ns */
function getContract(ns, hostname, file) {
  return {
    contractType: ns.codingcontract.getContractType(file, hostname),
    data: ns.codingcontract.getData(file, hostname)
  }
}

/** @param {Array<number>} data */
function jumping1(data) {
  let i, remaining
  for (i = 0, remaining = 0; i < data.length && remaining >= 0; i++, remaining--) {
    remaining = Math.max(remaining, data[i])
  }
  if (i == data.length)
    return 1
  return 0
}

/** @param {Array<number>} data */
function jumping2(data) {
  const best = new Array(data.length).fill(data.length)
  best[0] = 0
  for (let i = 0; i < data.length; i++) {
    for (let j = 1; j <= data[i] && i + j < data.length; j++) {
      if (best[i] + 1 < best[i + j])
        best[i + j] = best[i] + 1
    }
  }
  if (best[data.length - 1] >= data.length)
    return 0
  return best[data.length - 1]
}

/** @param {Array} data */
function coloring(data) {
  const [nodes, edges] = data
  const graph = Array.from({ length: nodes }, () => new Set())
  for (let [u, v] of edges) {
    graph[u].add(v)
    graph[v].add(u)
  }
  const colors = new Array(nodes)
  for (let root = 0; root < nodes; root++) {
    if (colors[root] != undefined)
      continue
    const visited = new Set()
    const queue = [[root, 0]]
    while (queue.length > 0) {
      const [current, color] = queue.shift()
      if (colors[current] != undefined)
        return []
      visited.add(current)
      colors[current] = color
      for (let neighbor of graph[current]) {
        if (!visited.has(neighbor)) {
          queue.push([neighbor, (color + 1) % 2])
        }
      }
    }
  }
  return colors
}

/** @param {string} data */
function compression1(data) {
  const compressed = []
  let i = 0
  while (i < data.length) {
    let c = data[i]
    let j = 1
    while (i + j < data.length && c == data[i + j])
      j++
    i += j
    while (j > 0) {
      compressed.push(Math.min(j, 9), c)
      j -= 9
    }
  }
  return compressed.join("")
}

/** @param {string} data */
function compression2(data) {
  let plaintext = ""
  let i = 0
  let rawChunk = true
  while (i < data.length) {
    const size = parseInt(data[i++])
    if (size == 0) {
      rawChunk = !rawChunk
      continue
    }
    if (rawChunk) {
      plaintext += data.substring(i, i + size)
      i += size
      rawChunk = false
      continue
    }
    const start = plaintext.length - parseInt(data[i++])
    let token = plaintext.substring(start, start + size)
    if (token.length < size)
      token = token.repeat(Math.ceil(size / token.length))
    plaintext += token.substring(0, size)
    rawChunk = true
  }
  return plaintext
}

/** @param {string} data */
function compression3(data) {
  const LITERAL = 0
  const BACKREF = 1
  function match(i) {
    let best = [0, 0]
    for (let j = Math.min(9, i); j > 0; j--) {
      if (data[i - j] == data[i]) {
        let k = 1
        while (k < 9 && i + k < data.length && data[i - j + k] == data[i + k]) {
          k++
        }
        if (k > best[0])
          best = [k, j]
      }
    }
    return best
  }
  const key = ({ type, end }) => `${type},${end}`
  function* neighbors(node) {
    const { type, end, length } = node
    if (type == LITERAL) {
      yield { prev: key(node), type: BACKREF, end, length: length + 1, offset: 0 }
      let [k, j] = match(end)
      if (k > 0)
        yield { prev: key(node), type: BACKREF, end: end + k, length: length + 2, offset: j }
    } else {
      yield { prev: key(node), type: LITERAL, end, length: length + 1 }
      for (let i = 1; i <= Math.min(9, data.length - end); i++)
        yield { prev: key(node), type: LITERAL, end: end + i, length: length + i + 1 }
    }
  }
  const first = { prev: null, type: BACKREF, end: 0, length: 0 }
  const visited = new Map([[key(first), first]])
  const queue = [[first.length, first]]
  while (queue.length > 0) {
    const [_, node] = Heap.pop(queue)
    if (node.end == data.length)
      break
    for (let neighbor of neighbors(node)) {
      const nk = key(neighbor)
      if (!visited.has(nk) || visited.get(nk).length > neighbor.length) {
        visited.set(nk, neighbor)
        const score = 2 * intdiv(data.length - neighbor.end, 9)
        Heap.push(queue, [neighbor.length + score, neighbor])
      }
    }
  }
  const finals = [
    visited.get(key({ type: LITERAL, end: data.length })),
    visited.get(key({ type: BACKREF, end: data.length }))
  ]
  let final = finals[0]
  if (final === undefined || final.length > finals[1]?.length)
    final = finals[1]
  const path = []
  while (final.prev != null) {
    path.push(final)
    final = visited.get(final.prev)
  }
  let compressed = ""
  let start = 0
  for (let node of path.reverse()) {
    if (node.type == LITERAL)
      compressed += `${node.end - start}${data.substring(start, node.end)}`
    else if (node.end > start)
      compressed += `${node.end - start}${node.offset}`
    else
      compressed += `0`
    start = node.end
  }
  return compressed
}

/** @param {string} data */
function encrypt1(data) {
  let [plaintext, key] = data
  let ciphertext = new Array(plaintext.length)
  key %= 26
  for (let i = 0; i < plaintext.length; i++) {
    if (plaintext[i] == " ")
      ciphertext[i] = " "
    else
      ciphertext[i] =
        ((parseInt(plaintext[i], 36) - 10 - key + 26) % 26 + 10).toString(36).toUpperCase()
  }
  return ciphertext.join("")
}

/** @param {string} data */
function encrypt2(data) {
  let [plaintext, key] = data
  let ciphertext = new Array(plaintext.length)
  for (let i = 0; i < plaintext.length; i++)
    ciphertext[i] =
      ((parseInt(plaintext[i], 36) - 10 + parseInt(key[i % key.length], 36) - 10) % 26 + 10).toString(36).toUpperCase()
  return ciphertext.join("")
}

/** @param {Array<Array<number>>} data */
function grid1(data) {
  const [rows, columns] = data
  if (rows < 2)
    return 1
  let prev = new Array(columns).fill(1)
  let curr = new Array(columns)
  for (let i = 1; i < rows; i++) {
    curr[0] = prev[0]
    for (let j = 1; j < columns; j++) {
      curr[j] = prev[j] + curr[j - 1]
    }
    [prev, curr] = [curr, prev]
  }
  return prev[columns - 1]
}

/** @param {Array<Array<number>>} data */
function grid2(data) {
  const flow = (i, j, x) => data[i][j] = data[i][j] == 1 ? 0 : x
  if (data[0][0] == 1)
    return 0
  data[0][0] = 1
  for (let j = 1; j < data[0].length; j++)
    flow(0, j, data[0][j - 1])
  for (let i = 1; i < data.length; i++) {
    flow(i, 0, data[i - 1][0])
    for (let j = 1; j < data[i].length; j++) {
      flow(i, j, data[i - 1][j] + data[i][j - 1])
    }
  }
  return data.slice(-1)[0].slice(-1)[0]
}

/** @param {string} */
function hammingBin2Int(data) {
  let message = data.split("").map(x => x == "1" ? 1 : 0)
  let code = message[0]
  let number = 0n
  let p = 0
  for (let i = 1; i < message.length; i++) {
    if (i == 1 << p) {
      p += 1
      code += message[i] << p
      continue
    }
    code ^= message[i]
    for (let j = 0; j < p; j++) {
      if ((i >> j) % 2 == 1)
        code ^= message[i] << (j + 1)
    }
    number = (number << 1n) + BigInt(message[i])
  }
  if (code <= 1)
    return number.toString()
  // if code % 2 == 0, double bit error (not in scenario)
  code >>= 1
  let b = log2(code)
  if (code == 1 << b)
    return number.toString()
  number ^= 1n << BigInt(message.length - p - (code - b))
  return number.toString()
}

/** @param {BigInt} data */
function hammingInt2Bin(data) {
  let message = [0]
  let d = BigInt(log2(data))
  let p = 0
  while (d >= 0n) {
    if (message.length == 1 << p) {
      message.push(0)
      p += 1
      continue
    }
    let b = Number((data >> d) % 2n)
    d--
    for (let i = 0; i < p; i++) {
      if ((message.length >> i) % 2 == 1)
        message[1 << i] ^= b
    }

    message.push(b)
  }
  for (let i = 1; i < message.length; i++)
    message[0] ^= message[i]
  return message.join("")
}

/** @param {Array<Array<number>>} data */
function intervals(data) {
  data.sort((a, b) => a[0] - b[0])
  const merged = [data.shift()]
  for (let [lb, ub] of data) {
    let [lm, um] = merged[merged.length - 1]
    if (ub <= um)
      continue
    if (lb <= um) {
      merged[merged.length - 1] = [lm, ub]
      continue
    }
    merged.push([lb, ub])
  }
  return merged
}

/** @param {string} data */
function ipAddress(data) {
  if (data.length < 4 || data.length > 12)
    return []
  const between = (lb, x, ub) => x >= lb && x <= ub
  const isValid = octet =>
    (octet.length == 1 || octet[0] != "0")
    && between(0, parseInt(octet), 255)
  const addresses = []
  for (let i = 1; i < 4 && i < data.length - 2; i++) {
    for (let j = i + 1; j < i + 4 && j < data.length - 1; j++) {
      for (let k = j + 1; k < j + 4 && k < data.length; k++) {
        const octets = [
          data.substring(0, i),
          data.substring(i, j),
          data.substring(j, k),
          data.substring(k)
        ]
        if (octets.every(isValid))
          addresses.push(octets.join("."))
      }
    }
  }
  return addresses
}

function maths(data) {
  let [digits, target] = data
  let splits = []

  for (let splitter = 2 ** (digits.length - 1); splitter < 2 ** (digits.length); splitter++) {
    const terms = []
    for (let start = 0, end = 0; end < digits.length; end++) {
      if ((splitter >> end) % 2 == 1) {
        terms.push(digits.substring(start, end + 1))
        start = end + 1
      }
    }
    if (terms.every(t => t[0] != "0" || t.length == 1))
      splits.push(terms.map(t => parseInt(t)))
  }

  const expressions = splits.flatMap(terms => {
    let splitExpressions = [[terms.shift()]]
    while (terms.length > 0) {
      let term = terms.shift()
      splitExpressions = splitExpressions
        .flatMap(exp => ["+", "-", "*"]
          .map(op => exp.concat([op, term])))
    }
    return splitExpressions
  })

  const evalExpr = expr => {
    let value = [expr[0]]
    let j = 0
    for (let i = 1; i < expr.length; i += 2) {
      if (expr[i] == "*")
        value[j] *= expr[i + 1]
      else
        j = value.push(expr[i], expr[i + 1]) - 1
    }
    for (let i = 1; i < value.length; i += 2) {
      if (value[i] == "+")
        value[0] += value[i + 1]
      else
        value[0] -= value[i + 1]
    }
    return value[0] == target
  }

  return expressions.filter(evalExpr).map(expr => expr.join(""))
}

/** @param {Array<number>} data */
function maxSum(data) {
  let total = 0
  let best = data[0]
  for (let i = 0; i < data.length; i++) {
    total = Math.max(total + data[i], data[i])
    best = Math.max(total, best)
  }
  return best
}

/** @param {BigInt} data */
function primeFactor(data) {

  // Euclidean
  const gcd = (a, b) => {
    while (b != 0n)
      [a, b] = [b, a % b]
    return a
  }

  // Modular Exponentiation by Squaring
  const pow = (b, e, m) => {
    let r = 1n
    b %= m
    while (e > 0n) {
      if (e % 2n == 1n)
        r = (r * b) % m
      e >>= 1n
      b = (b * b) % m
    }
    return r
  }

  // Miller-Rabin
  const isPrime = (n) => {
    if (n == 2n)
      return true
    let d = n - 1n
    let s = 0n
    while (d % 2n == 0n) {
      d /= 2n
      s++
    }
    // n = 2^s*d + 1
    for (let i = 0; i < 5; i++) {
      let a
      do {
        a = getRandomBigInt(2n, n)
      } while (gcd(a, n) > 1n)
      if (pow(a, d, n) == 1n)
        continue
      let r
      for (r = 0n; r < s; r++) {
        if (pow(a, 2n ** r * d, n) == n - 1n)
          break
      }
      if (r < s)
        continue
      return false
    }
    return true
  }

  // Pollard Rho
  const factor = (n) => {
    for (let x0 = 2n; x0 < 5n; x0++) {
      const f = x => (x * x + 1n) % n
      let x = x0
      let y = x0
      let z
      do {
        x = f(x)
        y = f(f(y))
        z = x > y ? gcd(x - y, n) : gcd(y - x, n)
      } while (z == 1n)
      if (z != n)
        return z
    }
    return n
  }

  const primes = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n]
  let p = 0
  let i = 0
  for (let i = 0; i < primes.length && data > 1n; i++) {
    if (data % primes[i] == 0n) {
      p = primes[i]
      data /= primes[i]
    }
  }
  while (data > 1n) {
    if (isPrime(data))
      return p > data ? p : data
    let q = factor(data)
    data /= q
    if (isPrime(q) && q > p)
      p = q
  }
  return p
}

/** @param {string} data */
function sanitize(data) {
  let parentheses = []
  let openErrors = []
  let closeErrors = []
  for (let i = 0; i < data.length; i++) {
    if (data[i] == "(") {
      openErrors.push(i)
      continue
    }
    if (data[i] != ")")
      continue
    if (openErrors.length > 0) {
      parentheses.push([openErrors.pop(), i])
      continue
    }
    closeErrors.push(i)
  }
  let opens = parentheses
    .map(p => p[0])
    .concat(openErrors)
  let closes = parentheses
    .map(p => p[1])
    .concat(closeErrors)
  let omits = [new Set()]
  while (closeErrors.length > 0) {
    let c = closeErrors.pop()
    omits = omits
      .flatMap(idxs =>
        closes
          .filter(i => !idxs.has(i) && i <= c)
          .map(i => new Set(idxs).add(i)))
  }
  while (openErrors.length > 0) {
    let op = openErrors.pop()
    omits = omits
      .flatMap(idxs =>
        opens
          .filter(i => !idxs.has(i) && i >= op)
          .map(i => new Set(idxs).add(i)))

  }
  return [...new Set(
    omits.map(idxs => data
      .split("")
      .filter((_, i) => !idxs.has(i))
      .join(""))
  )]
}

/** @param {Array<Array<number>>} data */
function shortest(data) {
  const goalR = data.length - 1
  const goalC = data[0].length - 1
  const neighbors = (r, c) => {
    return [
      { neighbor: [r, c - 1], direction: "L" },
      { neighbor: [r, c + 1], direction: "R" },
      { neighbor: [r - 1, c], direction: "U" },
      { neighbor: [r + 1, c], direction: "D" }
    ]
      .filter(({ neighbor: [nr, nc] }) =>
        nr >= 0
        && nr < data.length
        && data[nr][nc] == 0)
  }
  const key = (r, c) => r * data[0].length + c
  const visited = new Map([[key(0, 0), { distance: 0, prev: null, dir: null }]])
  const queue = [[0, [0, 0]]]
  while (queue.length > 0) {
    const [_, [r, c]] = Heap.pop(queue)
    if (r == goalR && c == goalC)
      break
    const distance = visited.get(key(r, c)).distance + 1
    for (let { neighbor: [nr, nc], direction } of neighbors(r, c)) {
      if (!visited.has(key(nr, nc)) || visited.get(key(nr, nc)).distance > distance) {
        visited.set(key(nr, nc), { distance, prev: [r, c], dir: direction })
        const score = goalR - nr + goalC - nc
        Heap.push(queue, [distance + score, [nr, nc]])
      }
    }
  }
  if (!visited.has(key(goalR, goalC)))
    return ""
  let path = []
  let { prev, dir } = visited.get(key(goalR, goalC))
  while (prev != null) {
    let [r, c] = prev
    path.push(dir);
    ({ prev, dir } = visited.get(key(r, c)))
  }
  return path.reverse().join("")
}

/** @param {Array<Array<number>>} data */
function spiralize(data) {
  data = data.map(r => r.slice(0))
  let result = []
  let rows = data.length
  let columns = data[0].length
  while (rows > 0 && columns > 0) {
    result.push(...data.shift())
    if (--rows == 0)
      break
    result.push(...data.map(r => r.pop()))
    if (--columns == 0)
      break
    result.push(...data.pop().reverse())
    if (--rows == 0)
      break
    result.push(...data.map(r => r.shift()).reverse())
    if (--columns == 0)
      break
  }
  return result
}

/** @param {Array<number>} data */
function __gains(data) {
  let gains = [data[1] - data[0]]
  for (let i = 2; i < data.length; i++) {
    let change = data[i] - data[i - 1]
    if (Math.sign(change) != -Math.sign(gains[gains.length - 1]))
      gains[gains.length - 1] += change
    else
      gains.push(change)
  }
  if (gains[0] <= 0)
    gains.shift()
  if (gains[gains.length - 1] > 0)
    gains.push(-1)
  return gains
}

/** @param {Array<number>} data */
function stocks1(data) {
  return maxSum(__gains(data))
}

/** @param {Array<number>} data */
function stocks2(data) {
  return __gains(data)
    .filter(x => x > 0)
    .reduce((t, x) => t + x)
}

/** @param {Array<number>} data */
function stocks3(data) {
  return stocks4([2, data])
}

/** @param {Array<number>} data */
function stocks4(data) {
  const [k, prices] = data
  if (k == 1)
    return stocks1(prices)
  if (prices.length < 2)
    return 0

  let gains = __gains(prices)
  if (k * 2 >= gains.length)
    return gains
      .slice(0, k * 2)
      .filter(x => x > 0)
      .reduce((t, x) => t + x, 0)
  for (let i = k * 2; i < gains.length; i += 2) {
    let minIdx = 0
    for (let j = 1; j < k * 2; j++) {
      if (Math.abs(gains[j]) < Math.abs(gains[minIdx]))
        minIdx = j
    }
    if (gains[i] >= Math.abs(gains[minIdx])) {
      if (minIdx == 0)
        gains.splice(0, k * 2,
          ...gains.slice(2, k * 2),
          gains[i],
          gains[i + 1])
      else if (minIdx == k * 2 - 1)
        gains.splice(k * 2 - 2, 2,
          gains[k * 2 - 2] + gains[k * 2 - 1] + gains[i],
          gains[i + 1])
      else
        gains.splice(minIdx - 1, k * 2 - minIdx + 1,
          gains[minIdx - 1] + gains[minIdx] + gains[minIdx + 1],
          ...gains.slice(minIdx + 2, k * 2),
          gains[i],
          gains[i + 1])
    } else if (i + 2 < gains.length && gains[i] > Math.abs(gains[i + 1])) {
      gains[i + 2] += gains[i] + gains[i + 1]
    } else {
      gains[k * 2 - 1] += gains[i] + gains[i + 1]
    }
  }
  return gains
    .slice(0, k * 2)
    .filter(x => x > 0)
    .reduce((t, x) => t + x)
}

/** @param {Array} data */
function totalSum1(data) {
  const as = [...Array(data).keys()]
  as.shift()
  const counts = new Array(data + 1).fill(0)
  counts[0] = 1
  for (let a of as.reverse())
    for (let i = a; i <= data; i++)
      counts[i] += counts[i - a]
  return counts[data]
}

/** @param {Array} data */
function totalSum2(data) {
  const [c, as] = data
  const counts = new Array(c + 1).fill(0)
  counts[0] = 1
  for (let a of as.reverse())
    for (let i = a; i <= c; i++)
      counts[i] += counts[i - a]
  return counts[c]
}

/** @param {Array<Array<number>>} data */
function triangle(data) {
  if (data.length == 1)
    return data[0][0]
  for (let i = data.length - 2; i >= 0; i--) {
    for (let j = 0; j < data[i].length; j++) {
      data[i][j] = data[i][j] + Math.min(data[i + 1][j], data[i + 1][j + 1])
    }
  }
  return data[0][0]
}

/** @param {NS} ns */
function getContracts(ns) {
  /** @type {Server[]} servers */
  const servers = getServerList(ns)
  const files = servers.flatMap(s => ns.ls(s.hostname, ".cct").map(f => ({ hostname: s.hostname, file: f })))
  return files
}

function solve(ns, contractType, data) {
  switch (contractType) {
    case "Encryption I: Caesar Cipher":
      return encrypt1(data)
    case "Encryption II: Vigenère Cipher":
      return encrypt2(data)
    case "Unique Paths in a Grid I":
      return grid1(data)
    case "Unique Paths in a Grid II":
      return grid2(data)
    case "Compression I: RLE Compression":
      return compression1(data)
    case "Compression II: LZ Decompression":
      return compression2(data)
    case "Compression III: LZ Compression":
      return compression3(data)
    case "Array Jumping Game":
      return jumping1(data)
    case "Array Jumping Game II":
      return jumping2(data)
    case "Minimum Path Sum in a Triangle":
      return triangle(data)
    case "Spiralize Matrix":
      return spiralize(data)
    case "Find Largest Prime Factor":
      return Number(primeFactor(BigInt(data)))
    case "Proper 2-Coloring of a Graph":
      return coloring(data)
    case "Generate IP Addresses":
      return ipAddress(data)
    case "Total Ways to Sum":
      return totalSum1(data)
    case "Total Ways to Sum II":
      return totalSum2(data)
    case "Merge Overlapping Intervals":
      return intervals(data)
    case "Shortest Path in a Grid":
      return shortest(data)
    case "Subarray with Maximum Sum":
      return maxSum(data)
    case "Algorithmic Stock Trader I":
      return stocks1(data)
    case "Algorithmic Stock Trader II":
      return stocks2(data)
    case "Algorithmic Stock Trader III":
      return stocks3(data)
    case "Algorithmic Stock Trader IV":
      return stocks4(data)
    case "Find All Valid Math Expressions":
      return maths(data)
    case "Sanitize Parentheses in Expression":
      return sanitize(data)
    case "HammingCodes: Encoded Binary to Integer":
      return hammingBin2Int(data)
    case "HammingCodes: Integer to Encoded Binary":
      return hammingInt2Bin(BigInt(data))
    default:
      return null
  }
}
