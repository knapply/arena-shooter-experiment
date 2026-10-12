/* ===== CTF navigation: 1m height grid over the map, A* with walk / jump-clamber / drop edges and per-team danger costs ===== */
(function () {
  const K = window.KA,
    T = K.THREE,
    CTF = window.CTF;
  const NAV = (CTF.NAV = /** @type {Record<string, any>} */ ({}));
  const X0 = -26,
    Z0 = -50,
    W = 52,
    H = 100,
    N = W * H;
  NAV.W = W;
  NAV.X0 = X0;
  NAV.Z0 = Z0;
  NAV.H = H;
  let top = null,
    ok = null,
    pruned = null;
  const STEP = 0.47,
    JUMP = 2.15,
    CLEAR = 0.42;
  function cellCalc(c, solids) {
    const x = X0 + (c % W) + 0.5,
      z = Z0 + ((c / W) | 0) + 0.5;
    let t = 0;
    for (const b of solids) {
      if (x >= b.x0 - 0.01 && x <= b.x1 + 0.01 && z >= b.z0 - 0.01 && z <= b.z1 + 0.01 && b.y1 > t) t = b.y1;
    }
    top[c] = t;
    let free = t < 6;
    if (free)
      for (const b of solids) {
        if (
          x + CLEAR > b.x0 &&
          x - CLEAR < b.x1 &&
          z + CLEAR > b.z0 &&
          z - CLEAR < b.z1 &&
          b.y1 > t + STEP &&
          b.y0 < t + 1.8
        ) {
          free = false;
          break;
        }
      }
    ok[c] = free ? 1 : 0;
  }
  /* cover broke or rebuilt: recompute just the cells around it */
  NAV.patch = function (b) {
    if (!top) return;
    const i0 = Math.max(0, Math.floor(b.x0 - X0) - 2),
      i1 = Math.min(W - 1, Math.floor(b.x1 - X0) + 2),
      j0 = Math.max(0, Math.floor(b.z0 - Z0) - 2),
      j1 = Math.min(H - 1, Math.floor(b.z1 - Z0) + 2);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const c = j * W + i;
        cellCalc(c, K.SOLID);
        /* cells the build found unreachable stay closed (otherwise a break and restore would open
           wall tops for good, and every later match would path differently) */
        if (pruned[c]) ok[c] = 0;
      }
  };
  NAV.build = function (solids) {
    top = new Float32Array(N);
    ok = new Uint8Array(N);
    pruned = new Uint8Array(N);
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        cellCalc(j * W + i, solids);
      }
    NAV.top = top;
    NAV.ok = ok;
    NAV.wl = new Int8Array(N);
    NAV.cz = new Float32Array(N);
    for (let c = 0; c < N; c++) {
      const x = X0 + (c % W) + 0.5;
      NAV.wl[c] = x < -9.5 ? 0 : x > 9.5 ? 2 : 1;
      NAV.cz[c] = Z0 + ((c / W) | 0) + 0.5;
    }
    // keep only cells reachable from Red's flag stand so goals never point at unreachable wall tops
    const s = NAV.cell(0, -43);
    const seen = new Uint8Array(N),
      q = [s];
    seen[s] = 1;
    while (q.length) {
      const c = q.pop();
      const ci = c % W,
        cj = (c / W) | 0;
      for (const [di, dj] of D8) {
        const i = ci + di,
          j = cj + dj;
        if (i < 0 || j < 0 || i >= W || j >= H) continue;
        const n = j * W + i;
        if (!ok[n] || seen[n] || edge(c, n) < 0) continue;
        seen[n] = 1;
        q.push(n);
      }
    }
    for (let c = 0; c < N; c++)
      if (!seen[c]) {
        if (ok[c]) pruned[c] = 1;
        ok[c] = 0;
      }
  };
  NAV.cell = (x, z) => {
    const i = Math.floor(x - X0),
      j = Math.floor(z - Z0);
    if (i < 0 || j < 0 || i >= W || j >= H) return -1;
    return j * W + i;
  };
  NAV.pos = (c, out) =>
    (out || new T.Vector3()).set(X0 + (c % W) + 0.5, top[c], Z0 + Math.floor(c / W) + 0.5);
  NAV.nearest = function (x, z, y) {
    let c = NAV.cell(x, z);
    if (c >= 0 && ok[c] && (y == null || Math.abs(top[c] - y) < 1.2)) return c;
    let best = -1,
      bd = 1e9;
    const ci = Math.floor(x - X0),
      cj = Math.floor(z - Z0);
    for (let r = 1; r < 6 && best < 0; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          const i = ci + di,
            j = cj + dj;
          if (i < 0 || j < 0 || i >= W || j >= H) continue;
          const k = j * W + i;
          if (!ok[k]) continue;
          const d = di * di + dj * dj + (y == null ? 0 : Math.abs(top[k] - y) * 4);
          if (d < bd) {
            bd = d;
            best = k;
          }
        }
    return best;
  };
  /* edge rule: walk if rise ≤ STEP, jump/clamber if rise ≤ JUMP, any drop allowed */
  function edge(a, b) {
    const dh = top[b] - top[a];
    if (dh <= STEP) return dh < -1.2 ? 1.2 : 0;
    if (dh <= JUMP) return 2.5;
    return -1;
  }
  NAV.edgeKind = (a, b) => {
    const dh = top[b] - top[a];
    return dh > STEP ? "jump" : dh < -1.2 ? "drop" : "walk";
  };
  // binary heap
  const heapI = new Int32Array(N * 8),
    heapF = new Float32Array(N * 8);
  let hn = 0;
  function push(i, f) {
    let k = hn++;
    heapI[k] = i;
    heapF[k] = f;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heapF[p] <= heapF[k]) break;
      const ti = heapI[p],
        tf = heapF[p];
      heapI[p] = heapI[k];
      heapF[p] = heapF[k];
      heapI[k] = ti;
      heapF[k] = tf;
      k = p;
    }
  }
  function pop() {
    const r = heapI[0];
    hn--;
    if (hn > 0) {
      heapI[0] = heapI[hn];
      heapF[0] = heapF[hn];
      let k = 0;
      for (;;) {
        const l = 2 * k + 1,
          rr = l + 1;
        let m = k;
        if (l < hn && heapF[l] < heapF[m]) m = l;
        if (rr < hn && heapF[rr] < heapF[m]) m = rr;
        if (m === k) break;
        const ti = heapI[m],
          tf = heapF[m];
        heapI[m] = heapI[k];
        heapF[m] = heapF[k];
        heapI[k] = ti;
        heapF[k] = tf;
        k = m;
      }
    }
    return r;
  }
  const g = new Float32Array(N),
    from = new Int32Array(N),
    stamp = new Int32Array(N),
    closed = new Int32Array(N);
  let gen = 0;
  const D8 = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.414],
    [1, -1, 1.414],
    [-1, 1, 1.414],
    [-1, -1, 1.414],
  ];
  /* cost(c) returns extra cost per cell (danger, lane bias). Returns array of cells start..goal, or null */
  NAV.path = function (s, t, cost, maxExp) {
    if (s < 0 || t < 0) return null;
    gen++;
    hn = 0;
    const tx = t % W,
      tz = (t / W) | 0;
    g[s] = 0;
    from[s] = -1;
    stamp[s] = gen;
    push(s, 0);
    let exp = 0;
    maxExp = maxExp || N;
    while (hn > 0) {
      const c = pop();
      if (closed[c] === gen) continue;
      closed[c] = gen;
      if (c === t) break;
      if (++exp > maxExp) return null;
      const ci = c % W,
        cj = (c / W) | 0;
      for (const [di, dj, dc] of D8) {
        const i = ci + di,
          j = cj + dj;
        if (i < 0 || j < 0 || i >= W || j >= H) continue;
        const n = j * W + i;
        if (!ok[n] || closed[n] === gen) continue;
        const e = edge(c, n);
        if (e < 0) continue;
        if (di && dj) {
          const a = cj * W + i,
            b = j * W + ci;
          if (!ok[a] || !ok[b] || Math.abs(top[a] - top[c]) > STEP || Math.abs(top[b] - top[c]) > STEP)
            continue;
        }
        const ng = g[c] + dc + e + (cost ? cost(n) : 0);
        if (stamp[n] !== gen || ng < g[n]) {
          stamp[n] = gen;
          g[n] = ng;
          from[n] = c;
          const hx = Math.abs(i - tx),
            hz = Math.abs(j - tz);
          push(n, ng + Math.max(hx, hz) + 0.414 * Math.min(hx, hz));
        }
      }
    }
    if (stamp[t] !== gen || closed[t] !== gen) return null;
    const out = [];
    for (let c = t; c >= 0; c = from[c]) out.push(c);
    out.reverse();
    return out;
  };
  /* straight-line walkability: no jump edges and no blocked cells between two points */
  NAV.clearLine = function (a, b) {
    const ax = X0 + (a % W) + 0.5,
      az = Z0 + ((a / W) | 0) + 0.5,
      bx = X0 + (b % W) + 0.5,
      bz = Z0 + ((b / W) | 0) + 0.5;
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) * 2);
    let prev = a;
    for (let k = 1; k <= n; k++) {
      const c = NAV.cell(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n);
      if (c < 0 || !ok[c]) return false;
      if (c !== prev) {
        if (Math.abs(top[c] - top[prev]) > STEP) return false;
        prev = c;
      }
    }
    return true;
  };

  /* danger layer: decaying grid of where each team took deaths; lets the team route around kill zones it has learned */
  NAV.Danger = function () {
    this.v = new Float32Array(N);
  };
  NAV.Danger.prototype.add = function (x, z, amt, rad) {
    const ci = Math.floor(x - X0),
      cj = Math.floor(z - Z0);
    rad = rad || 4;
    for (let dj = -rad; dj <= rad; dj++)
      for (let di = -rad; di <= rad; di++) {
        const i = ci + di,
          j = cj + dj;
        if (i < 0 || j < 0 || i >= W || j >= H) continue;
        const d = Math.hypot(di, dj);
        if (d > rad) continue;
        this.v[j * W + i] += amt * (1 - d / rad);
      }
  };
  NAV.Danger.prototype.decay = function (k) {
    const v = this.v;
    for (let i = 0; i < N; i++) v[i] *= k;
  };
  NAV.Danger.prototype.at = function (c) {
    return this.v[c];
  };
  NAV.Danger.prototype.toJSON = function () {
    const o = [];
    for (let i = 0; i < N; i++) if (this.v[i] > 0.05) o.push(i, Math.round(this.v[i] * 100) / 100);
    return o;
  };
  NAV.Danger.prototype.load = function (a) {
    this.v.fill(0);
    if (Array.isArray(a))
      for (let i = 0; i + 1 < a.length; i += 2) {
        const c = a[i] | 0;
        if (c >= 0 && c < N) this.v[c] = +a[i + 1] || 0;
      }
  };
})();
