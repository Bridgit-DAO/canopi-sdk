// @canopi-sdk/studio-kit runtime: sidebar renderers, data sources, bindings. Generated; do not edit.
// src/binding.ts
var IDENT = /^[A-Za-z_$][A-Za-z0-9_$-]*/;
function parseBindingPath(path) {
  if (typeof path !== "string" || !path.startsWith("$")) throw new Error('binding path must start with "$"');
  const out = [];
  let i = 1;
  while (i < path.length) {
    const rest = path.slice(i);
    if (rest.startsWith(".*")) {
      out.push({ kind: "wildcard" });
      i += 2;
      continue;
    }
    if (rest[0] === ".") {
      const m = IDENT.exec(rest.slice(1));
      if (!m) throw new Error(`bad property name at ${i + 1} in "${path}"`);
      out.push({ kind: "key", key: m[0] });
      i += 1 + m[0].length;
      continue;
    }
    if (rest[0] === "[") {
      const m = /^\[(?:(\*)|(\d+)|'([^'\\]*)'|"([^"\\]*)")\]/.exec(rest);
      if (!m) throw new Error(`unsupported bracket at ${i} in "${path}"`);
      if (m[1]) out.push({ kind: "wildcard" });
      else if (m[2] !== void 0) out.push({ kind: "index", index: Number(m[2]) });
      else out.push({ kind: "key", key: m[3] ?? m[4] });
      i += m[0].length;
      continue;
    }
    throw new Error(`unexpected "${rest[0]}" at ${i} in "${path}"`);
  }
  return out;
}
function isValidBindingPath(path) {
  try {
    parseBindingPath(path);
    return true;
  } catch {
    return false;
  }
}
var own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function resolveBinding(data, path) {
  const segs = parseBindingPath(path);
  const multi = segs.some((s) => s.kind === "wildcard");
  let current = [data];
  for (const s of segs) {
    const next = [];
    for (const v of current) {
      if (v === null || typeof v !== "object") continue;
      if (s.kind === "wildcard") next.push(...Array.isArray(v) ? v : Object.values(v));
      else if (s.kind === "index") {
        if (Array.isArray(v) && s.index < v.length) next.push(v[s.index]);
      } else if (!Array.isArray(v) && own(v, s.key)) next.push(v[s.key]);
    }
    current = next;
  }
  return multi ? current : current[0];
}
function getField(item, field) {
  if (!field) return item;
  let v = item;
  for (const part of field.split(".")) {
    if (v === null || typeof v !== "object" || Array.isArray(v) || !own(v, part)) return void 0;
    v = v[part];
  }
  return v;
}

// src/format.ts
var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var UNITS = { km: "km", mi: "mi", m: "m", cm: "cm", mm: "mm", kg: "kg", g: "g", lb: "lb", ms: "ms", sec: "s", secs: "s", seconds: "s", min: "min", mins: "min", minutes: "min", hours: "h", hrs: "h", days: "days", pct: "%", percent: "%", percentage: "%", usd: "USD", eur: "EUR", gbp: "GBP", kwh: "kWh", mph: "mph", kmh: "km/h" };
var ACRONYMS = /* @__PURE__ */ new Set(["id", "url", "uri", "api", "isbn", "doi", "sku", "ip", "gps", "eta", "faq", "pdf", "html", "json", "utc", "vin", "iata", "icao", "olid", "oclc", "lccn", "http"]);
function fieldWords(field) {
  return String(field || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").replace(/[_\-.]+/g, " ").trim().split(/\s+/).filter(Boolean);
}
function humanizeField(field, hint = {}) {
  const unit = typeof hint.unit === "string" && hint.unit.trim() ? hint.unit.trim() : "";
  if (typeof hint.title === "string" && hint.title.trim()) return `${hint.title.trim().slice(0, 60)}${unit ? ` (${unit})` : ""}`;
  const parts = fieldWords(field.split(".").pop() ?? "");
  if (!parts.length) return "";
  let u = unit;
  if (parts.length > 1 && UNITS[parts[parts.length - 1].toLowerCase()]) {
    const w = UNITS[parts.pop().toLowerCase()];
    if (!u) u = w;
  }
  const words = parts.map((p, i) => ACRONYMS.has(p.toLowerCase()) ? p.toUpperCase() : i === 0 ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p.toLowerCase());
  return `${words.join(" ")}${u ? ` (${u})` : ""}`.slice(0, 60);
}
function fieldLabel(field, label, schema) {
  if (typeof label === "string" && label.trim()) return label;
  return humanizeField(field, { title: schema?.title, unit: schema?.["x-unit"] ?? schema?.unit });
}
function schemaAtPath(schema, path) {
  let node = schema;
  let segs;
  try {
    segs = parseBindingPath(path || "$");
  } catch {
    return void 0;
  }
  for (const s of segs) {
    if (!isObj(node)) return void 0;
    if (s.kind === "key") node = isObj(node.properties) ? node.properties[s.key] : void 0;
    else node = isObj(node.items) ? node.items : isObj(node.additionalProperties) ? node.additionalProperties : void 0;
  }
  return isObj(node) ? node : void 0;
}
function schemaOfField(itemSchema, field) {
  if (!itemSchema || !field) return void 0;
  let node = itemSchema;
  for (const key of field.split(".")) {
    if (isObj(node) && node.type === "array" && isObj(node.items)) node = node.items;
    node = isObj(node) && isObj(node.properties) ? node.properties[key] : void 0;
  }
  return isObj(node) ? node : void 0;
}
var COMPACT = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;
var ISO_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?$/;
function validParts(y, mo, d, h, mi, s) {
  if (y < 1900 || y > 2199 || mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}
var DT_UTC = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function formatTimestamp(v) {
  const s = typeof v === "number" && Number.isInteger(v) ? String(v) : typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  let m = COMPACT.exec(s);
  if (m) {
    const [y2, mo2, d2, h2, mi2, sec2] = m.slice(1).map(Number);
    if (!validParts(y2, mo2, d2, h2, mi2, sec2)) return null;
    return `${DT_UTC.format(Date.UTC(y2, mo2 - 1, d2, h2, mi2, sec2))} UTC`;
  }
  if (typeof v !== "string") return null;
  m = ISO_DATETIME.exec(s);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1, 6).map(Number);
  const sec = Number(m[6] ?? 0);
  if (!validParts(y, mo, d, h, mi, sec)) return null;
  if (!m[7]) return DT_UTC.format(Date.UTC(y, mo - 1, d, h, mi, sec));
  const t = Date.parse(s.replace(" ", "T"));
  return Number.isNaN(t) ? null : `${DT_UTC.format(t)} UTC`;
}
var NO_GROUP_WORDS = /* @__PURE__ */ new Set(["id", "ids", "year", "years", "yr", "code", "codes", "zip", "zipcode", "postcode", "postal", "phone", "tel", "fax", "isbn", "issn", "ean", "upc", "sku", "olid", "oclc", "lccn", "pin", "ref", "key", "version", "timestamp"]);
var ID_WORDS = new Set([...NO_GROUP_WORDS].filter((w) => w !== "timestamp"));
var GROUPED = new Intl.NumberFormat("en-US", { maximumFractionDigits: 20 });
var groupedText = (v) => GROUPED.format(v);
function isPlainNumber(v, hint = {}) {
  const own2 = hint.format === "plain" || hint.format === "year" || hint.format === "integer" ? hint.format : "";
  const fromSchema = hint.schema?.["x-format"] ?? hint.schema?.format;
  const fmt = own2 || (typeof fromSchema === "string" ? fromSchema : "");
  if (fmt === "plain" || fmt === "year") return true;
  if (fmt === "integer") return false;
  const t = hint.schema?.type;
  if (t === "string" || Array.isArray(t) && t.includes("string") && !t.includes("number") && !t.includes("integer")) return true;
  const words = hint.name ? fieldWords(hint.name) : [];
  if (words.some((w) => NO_GROUP_WORDS.has(w.toLowerCase()))) return true;
  if (words.length > 1 && UNITS[words[words.length - 1].toLowerCase()]) return false;
  return Number.isInteger(v) && v >= 1e3 && v <= 2999;
}
function formatNumber(v, hint = {}) {
  if (!Number.isFinite(v)) return "";
  const fmt = hint.format;
  const idLike = !!hint.name && fieldWords(hint.name).some((w) => ID_WORDS.has(w.toLowerCase()));
  if (fmt !== "integer" && fmt !== "plain" && fmt !== "year" && !idLike) {
    const ts = formatTimestamp(v);
    if (ts) return ts;
  }
  if (isPlainNumber(v, hint)) return String(v);
  return groupedText(fmt === "integer" ? Math.round(v) : v);
}

// src/render.ts
var SVG_NS = "http://www.w3.org/2000/svg";
var ACCENT = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
var SIDEBAR_CSS = `.sk-root{--sk-bg:#121417;--sk-fg:#e8eaed;--sk-muted:#9aa0a6;--sk-line:#2c3036;--sk-chip:rgba(127,127,127,.14);--sk-accent:#5b8def;color-scheme:dark;background:var(--sk-bg);color:var(--sk-fg);font:14px/1.45 system-ui,sans-serif;padding:12px;display:flex;flex-direction:column;gap:12px;box-sizing:border-box}
.sk-root[data-theme="light"]{--sk-bg:#fff;--sk-fg:#1f2328;--sk-muted:#57606a;--sk-line:#d0d7de;color-scheme:light}
.sk-root *{box-sizing:border-box}
.sk-c{display:flex;flex-direction:column;gap:6px}
.sk-c>h3{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--sk-muted);margin:0}
.sk-header h2{margin:0;font-size:18px}.sk-header p{margin:0;color:var(--sk-muted)}
.sk-stat .sk-value{font-size:24px;font-weight:650;color:var(--sk-accent)}
.sk-muted,.sk-empty,.sk-status{color:var(--sk-muted);margin:0;font-size:13px}
.sk-error{color:#e5534b;margin:0;font-size:13px}
.sk-list,.sk-timeline,.sk-feed{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.sk-list li,.sk-feed li,.sk-card-box{padding:8px;border-radius:8px;background:var(--sk-chip)}
.sk-list .sk-sub,.sk-list .sk-meta,.sk-feed .sk-sub{display:block;font-size:12px;color:var(--sk-muted)}
.sk-timeline li{border-left:2px solid var(--sk-accent);padding:0 0 0 8px}
.sk-timeline time{display:block;font-size:11px;color:var(--sk-muted)}
.sk-table{width:100%;border-collapse:collapse;font-size:13px}.sk-table th,.sk-table td{text-align:left;padding:4px 6px;border-bottom:1px solid var(--sk-line)}
.sk-dl{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;margin:0}.sk-dl dt{color:var(--sk-muted)}.sk-dl dd{margin:0;overflow-wrap:anywhere}
.sk-root input,.sk-root textarea,.sk-root select{width:100%;font:inherit;color:inherit;background:transparent;border:1px solid var(--sk-line);border-radius:6px;padding:6px}
.sk-root label{display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--sk-muted)}
.sk-root button,.sk-root a.sk-button{font:inherit;padding:6px 12px;border-radius:6px;border:1px solid var(--sk-accent);background:transparent;color:var(--sk-fg);cursor:pointer;text-decoration:none;align-self:flex-start}
.sk-chips{display:flex;flex-wrap:wrap;gap:6px}.sk-chips button{font-size:12px;padding:2px 8px;border-color:var(--sk-line)}
.sk-spark svg{width:100%;height:36px}.sk-spark polyline{fill:none;stroke:var(--sk-accent);stroke-width:2}
.sk-answer{white-space:pre-wrap;padding:8px;border-radius:8px;background:var(--sk-chip);margin:0}
`;
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== void 0) e.textContent = toText(text);
  return e;
}
function toText(v) {
  if (v === null || v === void 0) return "";
  if (typeof v === "string") return formatTimestamp(v) ?? v;
  if (typeof v === "number") return formatNumber(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.map(toText).join(", ");
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}
function safeUrl(v) {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
var str = (v, d = "") => typeof v === "string" ? v : d;
var num = (v, d) => typeof v === "number" && Number.isFinite(v) ? v : d;
var asArray = (v) => Array.isArray(v) ? v : v === void 0 || v === null ? [] : [v];
var asObject = (v) => Array.isArray(v) ? v[0] : v;
var errCode = (e) => e && typeof e === "object" && "code" in e ? String(e.code) : "error";
function formatValue(v, p, field) {
  const format = str(field?.format) || str(p.format, "text");
  if (typeof v === "number") {
    if (format === "currency") return new Intl.NumberFormat("en-US", { style: "currency", currency: str(p.currency, "USD"), maximumFractionDigits: 0 }).format(v);
    if (format === "percent") return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(v);
    return formatNumber(v, { name: field?.name, schema: field?.schema, format }) + str(p.suffix);
  }
  return toText(v) + str(p.suffix);
}
function fieldValue(o, field, p, ctx, format) {
  return formatValue(getField(o, field || void 0), p, { name: field.split(".").pop(), schema: schemaOfField(ctx.schema, field), format });
}
function formatDate(v) {
  const ts = formatTimestamp(v);
  if (ts) return ts;
  if (typeof v !== "string" && typeof v !== "number") return toText(v);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? toText(v) : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function empty(p, d = "Nothing here yet.") {
  return el("p", "sk-empty", str(p.emptyText, d));
}
var RENDERERS = {
  header(s, c, data) {
    const p = c.props, o = asObject(data);
    s.append(el("h2", "", p.titleField ? getField(o, str(p.titleField)) : str(p.title, c.title)));
    const sub = p.subtitleField ? getField(o, str(p.subtitleField)) : p.subtitle;
    if (sub !== void 0 && sub !== "") s.append(el("p", "", sub));
  },
  stat(s, c, data, ctx) {
    const p = c.props;
    let text;
    if (p.aggregate === "count") text = formatValue(asArray(data).length, p, { format: "integer" });
    else if (p.aggregate === "sum") text = formatValue(asArray(data).reduce((a, it) => a + num(getField(it, str(p.field) || void 0), 0), 0), p, { format: str(p.format) || "number" });
    else text = fieldValue(asObject(data), str(p.field), p, ctx);
    s.append(el("div", "sk-value", text));
    if (p.label) s.append(el("p", "sk-muted", p.label));
  },
  list(s, c, data, ctx) {
    const p = c.props, items = asArray(data).slice(0, num(p.limit, 10));
    if (!items.length) {
      s.append(empty(p));
      return;
    }
    const ul = el("ul", "sk-list");
    for (const it of items) {
      const li = el("li");
      const title = getField(it, str(p.titleField) || void 0);
      const href = p.linkField ? safeUrl(getField(it, str(p.linkField))) : null;
      if (href) {
        const a = el("a", "", title);
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        li.append(a);
      } else li.append(el("span", "", title));
      if (p.subtitleField) li.append(el("span", "sk-sub", getField(it, str(p.subtitleField))));
      if (p.metaField) li.append(el("span", "sk-meta", fieldValue(it, str(p.metaField), p, ctx)));
      ul.append(li);
    }
    s.append(ul);
  },
  card(s, c, data, ctx) {
    const p = c.props, o = asObject(data);
    if (o === void 0 || o === null) {
      s.append(empty(p));
      return;
    }
    const box = el("div", "sk-card-box");
    if (p.titleField) box.append(el("strong", "", getField(o, str(p.titleField))));
    if (p.bodyField) box.append(el("p", "sk-muted", getField(o, str(p.bodyField))));
    const fields = Array.isArray(p.fields) ? p.fields.filter((f) => typeof f === "string") : [];
    if (fields.length) {
      const dl = el("dl", "sk-dl");
      for (const f of fields) dl.append(el("dt", "", fieldLabel(f, void 0, schemaOfField(ctx.schema, f))), el("dd", "", fieldValue(o, f, {}, ctx)));
      box.append(dl);
    }
    const href = p.linkField ? safeUrl(getField(o, str(p.linkField))) : null;
    if (href) {
      const a = el("a", "", str(p.linkLabel, "Open"));
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      box.append(a);
    }
    s.append(box);
  },
  table(s, c, data, ctx) {
    const p = c.props, rows = asArray(data).slice(0, num(p.limit, 20));
    const cols = Array.isArray(p.columns) ? p.columns : [];
    if (!rows.length) {
      s.append(empty(p));
      return;
    }
    const t = el("table", "sk-table"), head = el("tr");
    for (const col of cols) head.append(el("th", "", fieldLabel(str(col.field), col.label, schemaOfField(ctx.schema, str(col.field)))));
    t.append(el("thead"));
    t.tHead.append(head);
    const body = el("tbody");
    for (const r of rows) {
      const tr = el("tr");
      for (const col of cols) tr.append(el("td", "", fieldValue(r, str(col.field), p, ctx, col.format)));
      body.append(tr);
    }
    t.append(body);
    s.append(t);
  },
  timeline(s, c, data) {
    const p = c.props, items = asArray(data).slice(0, num(p.limit, 10));
    if (!items.length) {
      s.append(empty(p));
      return;
    }
    const ol = el("ol", "sk-timeline");
    for (const it of items) {
      const li = el("li");
      const when = getField(it, str(p.dateField) || void 0);
      const t = el("time", "", formatDate(when));
      if (typeof when === "string") t.dateTime = when;
      li.append(t, el("strong", "", getField(it, str(p.titleField) || void 0)));
      if (p.bodyField) li.append(el("p", "sk-muted", getField(it, str(p.bodyField))));
      ol.append(li);
    }
    s.append(ol);
  },
  detail(s, c, data, ctx) {
    const p = c.props, o = asObject(data);
    const fields = Array.isArray(p.fields) ? p.fields : [];
    if (o === void 0 || o === null) {
      s.append(empty(p));
      return;
    }
    const dl = el("dl", "sk-dl");
    for (const f of fields) {
      const name = str(f.field);
      dl.append(el("dt", "", fieldLabel(name, f.label, schemaOfField(ctx.schema, name))), el("dd", "", fieldValue(o, name, p, ctx, f.format)));
    }
    s.append(dl);
  },
  form(s, c, _data, ctx) {
    const p = c.props;
    const form = el("form");
    const fields = Array.isArray(p.fields) ? p.fields : [];
    for (const f of fields) {
      const name = str(f.name);
      if (!name) continue;
      const label = el("label", "", str(f.label, name));
      let input;
      if (f.type === "textarea") input = el("textarea");
      else if (f.type === "select") {
        input = el("select");
        for (const o of Array.isArray(f.options) ? f.options : []) {
          const opt = el("option", "", o);
          opt.value = typeof o === "string" ? o : toText(o);
          input.append(opt);
        }
      } else {
        input = el("input");
        input.type = f.type === "number" ? "number" : "text";
      }
      input.name = name;
      if (f.required === true) input.required = true;
      label.append(input);
      form.append(label);
    }
    const btn = el("button", "", str(p.submitLabel, "Save"));
    btn.type = "submit";
    const status = el("p", "sk-status");
    status.setAttribute("aria-live", "polite");
    form.append(btn, status);
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const values = {};
      for (const f of fields) {
        const name = str(f.name);
        const input = form.elements.namedItem(name);
        if (!input) continue;
        values[name] = f.type === "number" && input.value !== "" ? Number(input.value) : input.value;
      }
      try {
        if (p.composeTagType) {
          await ctx.tab.tags.compose(str(p.composeTagType), values);
          status.textContent = "Review and post it in the Canopi composer.";
        } else {
          await ctx.tab.storage.set(`form:${c.id}`, values);
          status.textContent = "Saved";
        }
      } catch (e) {
        status.textContent = `Could not submit (${errCode(e)})`;
      }
    });
    s.append(form);
  },
  action(s, c, data, ctx) {
    const p = c.props, label = str(p.label, c.title || "Open");
    if (p.kind === "link") {
      const href = safeUrl(p.urlField ? getField(asObject(data), str(p.urlField)) : p.url);
      if (!href) {
        s.append(el("p", "sk-muted", "No link available."));
        return;
      }
      const a = el("a", "sk-button", label);
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      s.append(a);
      return;
    }
    const btn = el("button", "", label);
    btn.type = "button";
    const status = el("p", "sk-status");
    btn.addEventListener("click", async () => {
      try {
        if (p.kind === "openTab") await ctx.tab.ui.openTab(str(p.tabId));
        else if (p.kind === "compose") {
          await ctx.tab.tags.compose(str(p.tagType), p.data && typeof p.data === "object" ? p.data : {});
          status.textContent = "Review and post it in the Canopi composer.";
        }
      } catch (e) {
        status.textContent = `Could not do that (${errCode(e)})`;
      }
    });
    s.append(btn, status);
  },
  sparkline(s, c, data, ctx) {
    const p = c.props;
    const values = asArray(data).map((it) => getField(it, str(p.field) || void 0)).filter((v) => typeof v === "number" && Number.isFinite(v));
    if (values.length < 2) {
      s.append(empty(p, "Not enough data."));
      return;
    }
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 30");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${str(p.label, c.title)}: ${values.map((v) => toText(v)).join(", ")}`);
    const line = document.createElementNS(SVG_NS, "polyline");
    line.setAttribute("points", values.map((v, i) => `${(i / (values.length - 1) * 100).toFixed(2)},${(28 - (v - min) / span * 26).toFixed(2)}`).join(" "));
    svg.append(line);
    const wrap = el("div", "sk-spark");
    wrap.append(svg);
    s.append(wrap, el("p", "sk-muted", `${str(p.label)}${p.label ? ": " : ""}${formatValue(values[values.length - 1], p, { name: str(p.field).split(".").pop(), schema: schemaOfField(ctx.schema, str(p.field)) })}`));
  },
  async "tag-feed"(s, c, _data, ctx) {
    const p = c.props;
    try {
      const items = await ctx.tab.tags.list(str(p.tagType), { limit: num(p.limit, 10), scope: p.scope === "all" ? "all" : "page" });
      if (!items.length) {
        s.append(empty(p, "No tags on this page yet."));
        return;
      }
      const ul = el("ul", "sk-feed");
      for (const it of items) {
        const li = el("li", "", it.summary);
        li.append(el("span", "sk-sub", `@${it.author?.handle ?? ""}`));
        ul.append(li);
      }
      s.append(ul);
    } catch (e) {
      s.append(el("p", "sk-error", `Tags unavailable (${errCode(e)})`));
    }
  },
  "ask-deepi"(s, c, _data, ctx) {
    const p = c.props;
    const form = el("form");
    const input = el("input");
    input.type = "text";
    input.name = "q";
    input.placeholder = str(p.placeholder, "Ask Deepi about this page…");
    const btn = el("button", "", "Ask");
    btn.type = "submit";
    const answer = el("p", "sk-answer");
    answer.hidden = true;
    const chips = el("div", "sk-chips");
    for (const q of Array.isArray(p.suggestions) ? p.suggestions : []) {
      const b = el("button", "", q);
      b.type = "button";
      b.addEventListener("click", () => {
        input.value = typeof q === "string" ? q : toText(q);
      });
      chips.append(b);
    }
    form.append(input, btn);
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      answer.hidden = false;
      if (!ctx.askDeepi) {
        answer.textContent = "Deepi isn't connected in this build.";
        return;
      }
      answer.textContent = "Thinking…";
      try {
        answer.textContent = await ctx.askDeepi(q);
      } catch (e) {
        answer.textContent = `Deepi is unavailable (${errCode(e)})`;
      }
    });
    s.append(chips, form, answer);
  }
};
async function renderComponent(c, data, ctx) {
  const s = el("section", `sk-c sk-${/^[a-z-]+$/.test(c.type) ? c.type : "unknown"}`);
  s.dataset.cmp = c.id;
  if (c.title && c.type !== "header") s.append(el("h3", "", c.title));
  const r = RENDERERS[c.type];
  if (!r) {
    s.append(el("p", "sk-error", `Unsupported component "${c.type}"`));
    return s;
  }
  await r(s, c, data, ctx);
  return s;
}
function pageParams(ctx) {
  if (!ctx) return {};
  const out = { pageUrl: ctx.url, pageTitle: ctx.title };
  try {
    const u = new URL(ctx.url);
    Object.assign(out, { pageOrigin: u.origin, pageHost: u.hostname, pagePath: u.pathname });
  } catch {
  }
  return out;
}
async function renderSidebar(root, project, opts) {
  const { tab } = opts;
  const sources = Array.isArray(opts.sources) ? Object.fromEntries(opts.sources.map((s) => [s.id, s])) : opts.sources;
  const byId = new Map(project.components.map((c) => [c.id, c]));
  const layout = (project.design?.sidebar?.layout ?? []).map((id) => byId.get(id)).filter((c) => !!c && c.surface === "sidebar" && c.status !== "rejected");
  const ctx = { tab, askDeepi: opts.askDeepi };
  root.classList.add("sk-root");
  const accent = project.design?.theme?.accent;
  if (accent && ACCENT.test(accent)) root.style.setProperty("--sk-accent", accent);
  const setTheme = (t) => root.setAttribute("data-theme", t === "light" ? "light" : "dark");
  try {
    setTheme(await tab.theme.get());
  } catch {
    setTheme("dark");
  }
  const offTheme = tab.theme.onChange(setTheme);
  let page = null;
  try {
    page = await tab.page.getContext();
  } catch {
    page = null;
  }
  let generation = 0;
  async function refresh() {
    const mine = ++generation;
    const params = { ...pageParams(page), ...opts.params ?? {} };
    const fetches = /* @__PURE__ */ new Map();
    const sections = await Promise.all(layout.map(async (c) => {
      let data;
      let schema;
      if (c.binding?.sourceId) {
        const src = sources[c.binding.sourceId];
        try {
          if (!src) throw new Error(`no source "${c.binding.sourceId}"`);
          if (!fetches.has(src.id)) fetches.set(src.id, src.fetch(params));
          data = resolveBinding(await fetches.get(src.id), c.binding.path || "$");
          schema = schemaAtPath(src.schema, c.binding.path || "$");
        } catch {
          const s = el("section", "sk-c");
          s.dataset.cmp = c.id;
          if (c.title) s.append(el("h3", "", c.title));
          s.append(el("p", "sk-error", `Couldn't load ${c.binding.sourceId}`));
          return s;
        }
      }
      return renderComponent(c, data, schema ? { ...ctx, schema } : ctx);
    }));
    if (mine === generation) root.replaceChildren(...sections);
  }
  const offPage = tab.page.onContextChange((next) => {
    page = next;
    void refresh();
  });
  await refresh();
  return { refresh, destroy() {
    offTheme();
    offPage();
    generation++;
    root.replaceChildren();
  } };
}

// src/datasource.ts
var withSchema = (src, schema) => schema && typeof schema === "object" && !Array.isArray(schema) ? { ...src, schema } : src;
var DataSourceError = class extends Error {
  constructor(sourceId, status, message) {
    super(message);
    this.sourceId = sourceId;
    this.status = status;
    this.name = "DataSourceError";
  }
};
function pickFixture(fixtures, params = {}) {
  if (!fixtures || fixtures.length === 0) return void 0;
  let best;
  let bestKeys = 0;
  for (const f of fixtures) {
    const keys = Object.entries(f.params ?? {});
    if (keys.length === 0) continue;
    if (keys.every(([k, v]) => params[k] === v) && keys.length > bestKeys) {
      best = f;
      bestKeys = keys.length;
    }
  }
  return best ?? fixtures.find((f) => !f.params || Object.keys(f.params).length === 0) ?? fixtures[0];
}
function fillTemplate(template, params = {}) {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name) => encodeURIComponent(params[name] ?? ""));
}
var clone = (v) => v === void 0 ? v : JSON.parse(JSON.stringify(v));
function createMemoryDataSource(descriptor, opts = {}) {
  return withSchema({
    id: descriptor.id,
    async fetch(params) {
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      const f = pickFixture(descriptor.fixtures, params);
      if (!f) throw new DataSourceError(descriptor.id, null, `source "${descriptor.id}" has no fixtures`);
      return clone(f.response);
    }
  }, descriptor.schema);
}
async function request(id, f, url, method, params) {
  const init = { method, credentials: "omit", headers: { accept: "application/json" } };
  if (method === "POST") {
    init.headers = { accept: "application/json", "content-type": "application/json" };
    init.body = JSON.stringify(params);
  }
  let res;
  try {
    res = await f(url, init);
  } catch (e) {
    throw new DataSourceError(id, null, `source "${id}" unreachable: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw new DataSourceError(id, res.status, `source "${id}" answered ${res.status}`);
  return res.json();
}
function createDataSource(descriptor, opts = {}) {
  if (descriptor.kind === "static" || descriptor.kind === "bridge") return createMemoryDataSource(descriptor);
  const f = opts.fetch ?? ((...a) => fetch(...a));
  const method = descriptor.request?.method === "POST" ? "POST" : "GET";
  const id = descriptor.id;
  if (descriptor.mode === "mock") {
    if (!opts.mockBaseUrl) throw new DataSourceError(id, null, `source "${id}" is mock: mockBaseUrl is required`);
    const base = `${opts.mockBaseUrl.replace(/\/+$/, "")}/${encodeURIComponent(id)}`;
    return withSchema({
      id,
      fetch(params = {}) {
        const qs = method === "GET" ? new URLSearchParams(params).toString() : "";
        return request(id, f, qs ? `${base}?${qs}` : base, method, params);
      }
    }, descriptor.schema);
  }
  const live = descriptor.live;
  if (!live || !live.baseUrl) throw new DataSourceError(id, null, `source "${id}" is live but has no live.baseUrl`);
  return withSchema({
    id,
    fetch(params = {}) {
      const filled = new URL(fillTemplate(descriptor.request.urlTemplate, params), live.baseUrl);
      const url = new URL(filled.pathname + filled.search, live.baseUrl);
      if (live.host && url.hostname !== live.host) {
        return Promise.reject(new DataSourceError(id, null, `source "${id}" resolved to ${url.hostname}, not ${live.host}`));
      }
      return request(id, f, url.toString(), method, params);
    }
  }, descriptor.schema);
}
export {
  DataSourceError,
  SIDEBAR_CSS,
  createDataSource,
  createMemoryDataSource,
  fieldLabel,
  fillTemplate,
  formatNumber,
  formatTimestamp,
  getField,
  humanizeField,
  isValidBindingPath,
  parseBindingPath,
  pickFixture,
  renderComponent,
  renderSidebar,
  resolveBinding,
  safeUrl,
  toText
};
