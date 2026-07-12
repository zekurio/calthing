// node_modules/.deno/@elysiajs+eden@1.4.9/node_modules/@elysiajs/eden/dist/chunk-I5KHAGLL.mjs
var d = class extends Error {
  constructor(e, s) {
    super(s + "");
    this.status = e;
    this.value = s;
  }
};
var i = /(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))/;
var o = /(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s\d{2}\s\d{4}\s\d{2}:\d{2}:\d{2}\sGMT(?:\+|-)\d{4}\s\([^)]+\)/;
var u = /^(?:(?:(?:(?:0?[1-9]|[12][0-9]|3[01])[/\s-](?:0?[1-9]|1[0-2])[/\s-](?:19|20)\d{2})|(?:(?:19|20)\d{2}[/\s-](?:0?[1-9]|1[0-2])[/\s-](?:0?[1-9]|[12][0-9]|3[01]))))(?:\s(?:1[012]|0?[1-9]):[0-5][0-9](?::[0-5][0-9])?(?:\s[AP]M)?)?$/;
var c = (t) => t.trim().length !== 0 && !Number.isNaN(Number(t));
var a = (t, r) => {
  if (typeof t != "string" || r?.parseDate === false) return null;
  let e = t.replace(/"/g, "");
  if (i.test(e) || o.test(e) || u.test(e)) {
    let s = new Date(e);
    if (!Number.isNaN(s.getTime())) return s;
  }
  return null;
};
var p = (t) => {
  let r = t.charCodeAt(0), e = t.charCodeAt(t.length - 1);
  return r === 123 && e === 125 || r === 91 && e === 93;
};
var f = (t, r) => JSON.parse(t, (e, s) => {
  let n = a(s, r);
  return n || s;
});
var g = (t, r) => {
  if (!t) return t;
  if (c(t)) return +t;
  if (t === "true") return true;
  if (t === "false") return false;
  if (r?.parseDate !== false) {
    let e = a(t, r);
    if (e) return e;
  }
  if (p(t)) try {
    return f(t, r);
  } catch {
  }
  return t;
};
var S = (t, r) => {
  let e = t.data.toString();
  return e === "null" ? null : g(e, r);
};

// node_modules/.deno/@elysiajs+eden@1.4.9/node_modules/@elysiajs/eden/dist/chunk-FXT7FC66.mjs
var K = (n, e, t) => {
  if (n.endsWith("/") || (n += "/"), e === "index" && (e = ""), !t || !Object.keys(t).length) return `${n}${e}`;
  let s = "";
  for (let [c2, a2] of Object.entries(t)) s += `${c2}=${a2}&`;
  return `${n}${e}?${s.slice(0, -1)}`;
};
var $ = typeof FileList > "u";
var M = (n) => $ ? n instanceof Blob : n instanceof FileList || n instanceof File;
var H = (n) => {
  if (!n) return false;
  for (let e in n) {
    if (M(n[e])) return true;
    if (Array.isArray(n[e]) && n[e].find((t) => M(t))) return true;
  }
  return false;
};
var x = (n) => $ ? n : new Promise((e) => {
  let t = new FileReader();
  t.onload = () => {
    let s = new File([t.result], n.name, { lastModified: n.lastModified, type: n.type });
    e(s);
  }, t.readAsArrayBuffer(n);
});
var T = class {
  ws;
  url;
  constructor(e) {
    this.ws = new WebSocket(e), this.url = e;
  }
  send(e) {
    return Array.isArray(e) ? (e.forEach((t) => this.send(t)), this) : (this.ws.send(typeof e == "object" ? JSON.stringify(e) : e.toString()), this);
  }
  on(e, t, s) {
    return this.addEventListener(e, t, s);
  }
  off(e, t, s) {
    return this.ws.removeEventListener(e, t, s), this;
  }
  subscribe(e, t) {
    return this.addEventListener("message", e, t);
  }
  addEventListener(e, t, s) {
    return this.ws.addEventListener(e, (c2) => {
      if (e === "message") {
        let a2 = S(c2);
        t({ ...c2, data: a2 });
      } else t(c2);
    }, s), this;
  }
  removeEventListener(e, t, s) {
    return this.off(e, t, s), this;
  }
  close() {
    return this.ws.close(), this;
  }
};
var j = (n, e = "", t) => new Proxy(() => {
}, { get(s, c2, a2) {
  return j(n, `${e}/${c2.toString()}`, t);
}, apply(s, c2, [a2, b = {}] = [{}, {}]) {
  let f2 = a2 !== void 0 && (typeof a2 != "object" || Array.isArray(a2)) ? a2 : void 0, { $query: I, $fetch: F, $headers: P2, $transform: m2, getRaw: C2, ...q2 } = a2 ?? {};
  f2 ??= q2;
  let w = e.lastIndexOf("/"), E = e.slice(w + 1).toUpperCase(), v = K(n, w === -1 ? "/" : e.slice(0, w), Object.assign(b.query ?? {}, I)), D = t.fetcher ?? fetch, l = t.transform ? Array.isArray(t.transform) ? t.transform : [t.transform] : void 0, S2 = m2 ? Array.isArray(m2) ? m2 : [m2] : void 0;
  return S2 && (l ? l = S2.concat(l) : l = S2), E === "SUBSCRIBE" ? new T(v.replace(/^([^]+):\/\//, v.startsWith("https://") ? "wss://" : "ws://")) : (async (N) => {
    let r, R2 = { ...t.$fetch?.headers, ...F?.headers, ...b.headers, ...P2 };
    if (E !== "GET" && E !== "HEAD") {
      r = Object.keys(f2).length || Array.isArray(f2) ? f2 : void 0;
      let p2 = r && (typeof r == "object" || Array.isArray(f2));
      if (p2 && H(r)) {
        let u2 = new FormData();
        for (let [h, o2] of Object.entries(r)) if ($) u2.append(h, o2);
        else if (o2 instanceof File) u2.append(h, await x(o2));
        else if (o2 instanceof FileList) for (let d2 = 0; d2 < o2.length; d2++) u2.append(h, await x(o2[d2]));
        else if (Array.isArray(o2)) for (let d2 = 0; d2 < o2.length; d2++) {
          let k = o2[d2];
          u2.append(h, k instanceof File ? await x(k) : k);
        }
        else u2.append(h, o2);
        r = u2;
      } else r != null && (R2["content-type"] = p2 ? "application/json" : "text/plain", r = p2 ? JSON.stringify(r) : f2);
    }
    let i2 = await D(v, { method: E, body: r, ...t.$fetch, ...b.fetch, ...F, headers: R2 }), g2;
    if (N.getRaw) return i2;
    switch (i2.headers.get("Content-Type")?.split(";")[0]) {
      case "application/json":
        g2 = await i2.json();
        break;
      default:
        g2 = await i2.text().then(g);
    }
    let B2 = i2.status >= 300 || i2.status < 200 ? new d(i2.status, g2) : null, A2 = { data: g2, error: B2, response: i2, status: i2.status, headers: i2.headers };
    if (l) for (let p2 of l) {
      let y = p2(A2);
      y instanceof Promise && (y = await y), y != null && (A2 = y);
    }
    return A2;
  })({ getRaw: C2 });
} });
var z = (n, e = { fetcher: fetch }) => new Proxy({}, { get(t, s) {
  return j(n, s, e);
} });

// node_modules/.deno/@elysiajs+eden@1.4.9/node_modules/@elysiajs/eden/dist/chunk-TTKI5TQ7.mjs
var C = class {
  constructor(t) {
    this.url = t;
    this.ws = new WebSocket(t);
  }
  ws;
  send(t) {
    return Array.isArray(t) ? (t.forEach((n) => this.send(n)), this) : (this.ws.send(typeof t == "object" ? JSON.stringify(t) : t.toString()), this);
  }
  on(t, n, r) {
    return this.addEventListener(t, n, r);
  }
  off(t, n, r) {
    return this.ws.removeEventListener(t, n, r), this;
  }
  subscribe(t, n) {
    return this.addEventListener("message", t, n);
  }
  addEventListener(t, n, r) {
    return this.ws.addEventListener(t, (o2) => {
      if (t === "message") {
        let i2 = S(o2);
        n({ ...o2, data: i2 });
      } else n(o2);
    }, r), this;
  }
  removeEventListener(t, n, r) {
    return this.off(t, n, r), this;
  }
  close() {
    return this.ws.close(), this;
  }
};
var X = ["get", "post", "put", "delete", "patch", "options", "head", "connect", "subscribe"];
var P = (e, t) => typeof t == "function" ? t(e) : t === true;
var _ = ["localhost", "127.0.0.1", "0.0.0.0"];
var q = typeof FileList > "u";
var H2 = (e) => q ? e instanceof Blob : e instanceof FileList || e instanceof File;
var Y = (e) => {
  if (!e) return false;
  for (let t in e) if (H2(e[t]) || Array.isArray(e[t]) && e[t].find(H2)) return true;
  return false;
};
var K2 = (e) => q ? e : new Promise((t) => {
  let n = new FileReader();
  n.onload = () => {
    let r = new File([n.result], e.name, { lastModified: e.lastModified, type: e.type });
    t(r);
  }, n.readAsArrayBuffer(e);
});
var A = async (e, t, n = {}, r = {}) => {
  if (Array.isArray(e)) {
    for (let o2 of e) if (!Array.isArray(o2)) r = await A(o2, t, n, r);
    else {
      let i2 = o2[0];
      if (typeof i2 == "string") r[i2.toLowerCase()] = o2[1];
      else for (let [s, u2] of i2) r[s.toLowerCase()] = u2;
    }
    return r;
  }
  if (!e) return r;
  switch (typeof e) {
    case "function":
      if (e instanceof Headers) return A(e, t, n, r);
      let o2 = await e(t, n);
      return o2 ? A(o2, t, n, r) : r;
    case "object":
      if (e instanceof Headers) return e.forEach((i2, s) => {
        r[s.toLowerCase()] = i2;
      }), r;
      for (let [i2, s] of Object.entries(e)) r[i2.toLowerCase()] = s;
      return r;
    default:
      return r;
  }
};
function V(e, t) {
  let n = e.split(`
`), r = {};
  for (let o2 of n) {
    if (!o2 || o2.startsWith(":")) continue;
    let i2 = o2.indexOf(":");
    if (i2 > 0) {
      let s = o2.slice(0, i2).trim(), u2 = o2.slice(i2 + 1).replace(/^ /, "");
      r[s] = u2 && g(u2, t);
    }
  }
  return Object.keys(r).length > 0 ? r : null;
}
function* B(e, t) {
  let n;
  for (; (n = e.value.indexOf(`

`)) !== -1; ) {
    let r = e.value.slice(0, n);
    if (e.value = e.value.slice(n + 2), r.trim()) {
      let o2 = V(r, t);
      o2 && (yield o2);
    }
  }
}
async function* U(e, t) {
  let n = e.body;
  if (!n) return;
  let r = n.getReader(), o2 = new TextDecoder("utf-8");
  if (e.headers.get("Content-Type")?.startsWith("text/event-stream")) {
    let i2 = { value: "" };
    try {
      for (; ; ) {
        let { done: u2, value: x2 } = await r.read();
        if (u2) break;
        let m2 = typeof x2 == "string" ? x2 : o2.decode(x2, { stream: true });
        i2.value += m2, yield* B(i2, t);
      }
      let s = o2.decode();
      if (s && (i2.value += s), yield* B(i2, t), i2.value.trim()) {
        let u2 = V(i2.value, t);
        u2 && (yield u2);
      }
    } finally {
      r.releaseLock();
    }
  } else try {
    for (; ; ) {
      let { done: i2, value: s } = await r.read();
      if (i2) break;
      yield g(typeof s == "string" ? s : o2.decode(s, { stream: true }), { parseDate: t?.parseDate });
    }
  } finally {
    r.releaseLock();
  }
}
var L = (e, t, n = [], r) => new Proxy(() => {
}, { get(o2, i2) {
  if (i2 === "~path") return "/" + n.join("/");
  if (!(n.length === 0 && (i2 === "then" || i2 === "catch" || i2 === "finally"))) return L(e, t, [...n, i2], r);
}, apply(o2, i2, [s, u2]) {
  if (!s || u2 || typeof s == "object" && Object.keys(s).length !== 1 || X.includes(n.at(-1))) {
    let x2 = [...n], m2 = x2.pop(), b = "/" + x2.join("/"), { fetcher: G = fetch, headers: R2, onRequest: g2, onResponse: D, fetch: $2 } = t, E = m2 === "get" || m2 === "head" || m2 === "subscribe", M2 = E ? s?.query : u2?.query, F = "";
    if (M2) {
      let a2 = (k, d2) => {
        d2 != null && (d2 instanceof Date && (d2 = d2.toISOString()), F += (F ? "&" : "?") + `${encodeURIComponent(k)}=${encodeURIComponent(typeof d2 == "object" ? JSON.stringify(d2) : d2 + "")}`);
      };
      for (let [k, d2] of Object.entries(M2)) {
        if (Array.isArray(d2)) {
          for (let T2 of d2) a2(k, T2);
          continue;
        }
        a2(k, d2);
      }
    }
    if (m2 === "subscribe") {
      let a2 = e.replace(/^([^]+):\/\//, e.startsWith("https://") ? "wss://" : e.startsWith("http://") || _.find((k) => e.includes(k)) ? "ws://" : "wss://") + b + F;
      return new C(a2);
    }
    return (async () => {
      R2 = await A(R2, b, u2);
      let a2 = { method: m2?.toUpperCase(), body: s, ...$2, headers: R2 };
      a2.headers = { ...R2, ...await A(E ? s?.headers : u2?.headers, b, a2) };
      let k = E && typeof s == "object" ? s.fetch : u2?.fetch, T2 = (E && typeof s == "object" ? s.throwHttpError : u2?.throwHttpError) ?? t.throwHttpError;
      if (a2 = { ...a2, ...k }, E && delete a2.body, g2) {
        Array.isArray(g2) || (g2 = [g2]);
        for (let y of g2) {
          let c2 = await y(b, a2);
          typeof c2 == "object" && (a2 = { ...a2, ...c2, headers: { ...a2.headers, ...await A(c2.headers, b, a2) } });
        }
      }
      if (E && delete a2.body, Y(s)) {
        let y = new FormData(), c2 = (f2) => {
          if (typeof f2 == "string" || H2(f2)) return false;
          if (typeof f2 == "object") {
            if (f2 !== null) return true;
            if (f2 instanceof Date) return false;
          }
          return false;
        }, w = async (f2) => f2 instanceof File ? await K2(f2) : c2(f2) ? JSON.stringify(f2) : f2;
        for (let [f2, p2] of Object.entries(a2.body)) {
          if (Array.isArray(p2)) {
            if (p2.some((S2) => typeof S2 == "object" && S2 !== null && !H2(S2))) y.append(f2, JSON.stringify(p2));
            else for (let S2 = 0; S2 < p2.length; S2++) {
              let z2 = p2[S2], Q = await w(z2);
              y.append(f2, Q);
            }
            continue;
          }
          if (q) {
            if (Array.isArray(p2)) for (let O of p2) y.append(f2, await w(O));
            else y.append(f2, await w(p2));
            continue;
          }
          if (p2 instanceof File) {
            y.append(f2, await K2(p2));
            continue;
          }
          if (p2 instanceof FileList) {
            for (let O = 0; O < p2.length; O++) y.append(f2, await K2(p2[O]));
            continue;
          }
          y.append(f2, await w(p2));
        }
        a2.body = y;
      } else typeof s == "object" ? (a2.headers["content-type"] = "application/json", a2.body = JSON.stringify(s)) : s != null && (a2.headers["content-type"] = "text/plain");
      if (E && delete a2.body, g2) {
        Array.isArray(g2) || (g2 = [g2]);
        for (let y of g2) {
          let c2 = await y(b, a2);
          typeof c2 == "object" && (a2 = { ...a2, ...c2, headers: { ...a2.headers, ...await A(c2.headers, b, a2) } });
        }
      }
      u2?.headers?.["content-type"] && (a2.headers["content-type"] = u2?.headers["content-type"]);
      let I = e + b + F, l;
      try {
        l = await (r?.handle(new Request(I, a2)) ?? G(I, a2));
      } catch (y) {
        let c2 = new d(503, y);
        if (P(c2, T2)) throw c2;
        return { data: null, error: c2, response: void 0, status: 503, headers: void 0 };
      }
      let h = null, v = null;
      if (D) {
        Array.isArray(D) || (D = [D]);
        for (let y of D) try {
          let c2 = await y(l.clone());
          if (c2 != null) {
            h = c2;
            break;
          }
        } catch (c2) {
          c2 instanceof d ? v = c2 : v = new d(422, c2);
          break;
        }
      }
      if (h !== null) return { data: h, error: v, response: l, status: l.status, headers: l.headers };
      switch (l.headers.get("Content-Type")?.split(";")[0]) {
        case "text/event-stream":
          h = U(l, { parseDate: t.parseDate });
          break;
        case "application/json":
          h = JSON.parse(await l.text(), (c2, w) => {
            if (typeof w != "string") return w;
            let f2 = a(w, { parseDate: t.parseDate });
            return f2 || w;
          });
          break;
        case "application/octet-stream":
          h = await l.arrayBuffer();
          break;
        case "multipart/form-data":
          let y = await l.formData();
          h = {}, y.forEach((c2, w) => {
            h[w] = c2;
          });
          break;
        default:
          l.headers.get("content-type")?.startsWith("text/") && l.headers.get("transfer-encoding") === "chunked" && !l.headers.has("content-length") ? h = U(l, { parseDate: t.parseDate }) : h = await l.text().then((c2) => g(c2, { parseDate: t.parseDate }));
      }
      if (l.status >= 300 || l.status < 200) {
        if (v = new d(l.status, h), P(v, T2)) throw v;
        h = null;
      }
      return { data: h, error: v, response: l, status: l.status, headers: l.headers };
    })();
  }
  return typeof s == "object" ? L(e, t, [...n, Object.values(s)[0]], r) : L(e, t, n);
} });
var se = (e, t = {}) => typeof e == "string" ? (t.keepDomain || (e.includes("://") || (e = (_.find((n) => e.includes(n)) ? "http://" : "https://") + e), e.endsWith("/") && (e = e.slice(0, -1))), L(e, t)) : (typeof window < "u" && console.warn("Elysia instance server found on client side, this is not recommended for security reason. Use generic type instead."), L("http://e.ly", t, [], e));

// node_modules/.deno/@elysiajs+eden@1.4.9/node_modules/@elysiajs/eden/dist/chunk-E2P2HQLJ.mjs
var j2 = async (t) => {
  switch (t.headers.get("Content-Type")?.split(";")[0]) {
    case "application/json":
      return t.json();
    case "application/octet-stream":
      return t.arrayBuffer();
    case "multipart/form-data": {
      let s = await t.formData(), n = {};
      return s.forEach((a2, c2) => {
        n[c2] = a2;
      }), n;
    }
  }
  return t.text().then(g);
};
var m = (t, e) => typeof e == "function" ? e(t) : e === true;
var R = async (t, e, s) => {
  let n = await j2(t);
  if (t.status >= 300 || t.status < 200) {
    let a2 = new d(t.status, n);
    if (m(a2, s)) throw a2;
    return { data: null, status: t.status, headers: t.headers, retry: e, error: a2 };
  }
  return { data: n, error: null, status: t.status, headers: t.headers, retry: e };
};
var H3 = (t, e) => (s, { query: n, params: a2, body: c2, throwHttpError: E, ...h } = {}) => {
  a2 && Object.entries(a2).forEach(([r, o2]) => {
    s = s.replace(`:${r}`, o2);
  });
  let w = e?.fetcher || globalThis.fetch, l = E ?? e?.throwHttpError, y = n ? Object.fromEntries(Object.entries(n).filter(([r, o2]) => o2 != null)) : null, T2 = y ? `?${new URLSearchParams(y).toString()}` : "", g2 = `${t}${s}${T2}`, u2 = new Headers(h.headers || {}), f2 = u2.get("content-type");
  if (!(c2 instanceof FormData) && !(c2 instanceof URLSearchParams) && (!f2 || f2 === "application/json")) try {
    c2 = JSON.stringify(c2), f2 || u2.set("content-type", "application/json");
  } catch {
  }
  let F = { ...h, method: h.method?.toUpperCase() || "GET", headers: u2, body: c2 }, p2 = () => w(g2, F).then((r) => R(r, p2, l)).catch((r) => {
    if (r instanceof d) throw r;
    let o2 = new d(503, r);
    if (m(o2, l)) throw o2;
    return { data: null, error: o2, status: 503, headers: void 0, retry: p2 };
  });
  return p2();
};
export {
  d as EdenFetchError,
  H3 as edenFetch,
  z as edenTreaty,
  se as treaty
};
//# sourceMappingURL=@elysiajs_eden.js.map
