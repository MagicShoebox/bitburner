
/** Constants object */
export const CS = Object.freeze({
  SERVERS: Object.freeze({
    HOME: "home",
  }),
  SCRIPTS: Object.freeze({
    UTIL: Object.freeze({
      FILE: "util.js",
    }),
    AUTOEXEC: Object.freeze({
      NAME: "Autoexec",
      FILE: "autoexec.js",
    }),
    TREASURER: Object.freeze({
      NAME: "Treasurer",
      FILE: "treasurer.js",
      INTERVAL: 60e3
    }),
    NECRO: Object.freeze({
      NAME: "Necro",
      FILE: "necro.js",
      INTERVAL: 60e3
    }),
    FAMILIAR: Object.freeze({
      NAME: "Familiar",
      FILE: "familiar.js",
      INTERVAL: 60e3,
    }),
    ZOMBIE: Object.freeze({
      NAME: "Zombie",
      FILE: "zombie.js",
      PORT: 2,
    }),
    GANG: Object.freeze({
      NAME: "Gang",
      FILE: "gang.js",
      INTERVAL: 60e3,
    }),
    SHARE: Object.freeze({
      NAME: "Share",
      FILE: "share.js",
    }),
    STATS: Object.freeze({
      NAME: "Stats",
      FILE: "stats.js",
      INTERVAL: 500,
      PORT: 1,
      MESSAGES: Object.freeze({
        FAMILIAR_INFO: "fam_stats",
      })
    })
  }),
  PORTS: Object.freeze({
    EMPTY_TOKEN: "NULL PORT DATA",
  })
})

export const Heap = Object.freeze({
  /** @param {Array} arr */
  heapify(arr) {
    for (let i = Math.floor(arr.length / 2); i >= 0; i--)
      Heap.__sift(arr, i)
    return arr
  },

  push(arr, item) {
    let i = arr.push(item) - 1
    let swap
    do {
      swap = false
      let parent = Heap.__parent(i)
      if (Heap.__lt(item, arr[parent])) {
        [arr[i], arr[parent]] = [arr[parent], item]
        swap = true
        i = parent
      }
    } while (swap)
    return arr
  },

  peek(arr) {
    return arr[0]
  },

  pop(arr) {
    let item = arr[0]
    if (arr.length > 1) {
      arr[0] = arr.pop()
      Heap.__sift(arr, 0)
    }
    else {
      arr.pop()
    }
    return item
  },

  __lt(x, y) {
    if (!Array.isArray(x) || !Array.isArray(y))
      return x < y
    for (let i = 0; i < x.length && i < y.length; i++) {
      if (Heap.__lt(x[i], y[i]))
        return true
      else if (Heap.__lt(y[i], x[i]))
        return false
    }
    return false
  },

  __left(i) {
    return 2 * i + 1
  },

  __right(i) {
    return 2 * i + 2
  },

  __parent(i) {
    return Math.floor((i - 1) / 2)
  },

  __sift(arr, i) {
    let swap
    do {
      swap = false
      const left = Heap.__left(i)
      const right = Heap.__right(i)
      let min = i
      if (Heap.__lt(arr[left], arr[min]))
        min = left
      if (Heap.__lt(arr[right], arr[min]))
        min = right
      if (min != i) {
        [arr[i], arr[min]] = [arr[min], arr[i]]
        swap = true
        i = min
      }
    } while (swap)
  }
})

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
/** @param {number} min
 * @param {number} max */
export function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}

export function getRandomBigInt(min, max) {
  return BigInt(Math.floor(Math.random() * Number(max - min))) + min; // The maximum is exclusive and the minimum is inclusive
}

// https://stackoverflow.com/questions/18928117/how-to-do-integer-division-in-javascript-getting-division-answer-in-int-not-flo#comment126439517_19296059
/** @param {number} a
 * @param {number} b */
export function intdiv(a, b) {
  return (a - a % b) / b
}

export function log2(x) {
  let n = 0
  let d = typeof x == 'bigint' ? 1n : 1
  while (x > d) {
    x >>= d
    n++
  }
  return n
}

// https://stackoverflow.com/a/56150320/3491874
export function mapReplacer(key, value) {
  if (value instanceof Map) {
    return {
      dataType: "Map",
      value: Array.from(value.entries())
    }
  } else {
    return value
  }
}

export function mapReviver(key, value) {
  if (typeof value === "object" && value !== null) {
    if (value.dataType === "Map") {
      return new Map(value.value)
    }
  }
  return value
}

// https://stackoverflow.com/a/32721346
/** @param {function} f */
export function not(f) {
  return function () {
    return !f.apply(this, arguments)
  }
}

/** @param {function} f
 * @param {function} g */
export function and(f, g) {
  return function () {
    return f.apply(this, arguments) && g.apply(this, arguments)
  }
}

// https://stackoverflow.com/a/38863774
/** @param {function} f 
 * @param {Array} xs */
export function partition(f, xs) {
  const append = function (ys = [], y) {
    ys.push(y)
    return ys
  }
  return xs.reduce((m, x) => {
    let v = f(x)
    return m.set(v, append(m.get(v), x))
  }, new Map())
}

Array.prototype.partition = function (f) {
  return partition(f, this)
}

/** @param {function} f 
 * @param {Array} xs */
export function bifilter(f, xs) {
  let result = partition(f, xs)
  return [result.get(true) || [], result.get(false) || []]
}

Array.prototype.bifilter = function (f) {
  return bifilter(f, this)
}
