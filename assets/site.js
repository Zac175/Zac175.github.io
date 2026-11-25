/* Zac's addons - everything the pages do.
   No build step and no libraries: this file, config.js and the two data files are the site.

   Where things come from
     data/addons.js      the four addons (names, links, commands)
     data/changelog.js   the version history as of the day it was built
     GitHub              releases newer than that, and known problems (read in the visitor's browser)
     config.js           where reports are sent
*/
(function () {
  "use strict";

  var CFG = window.SITE_CONFIG || {};
  var ADDONS = window.ZAC_ADDONS || [];
  var SNAP = window.ZAC_CHANGELOG || { addons: {}, generated: "" };
  var USER = CFG.githubUser || "Zac175";

  var GAMES = { era: "Classic Era", tbc: "TBC Anniversary", forever: "WoW Forever", retail: "Retail" };
  var TYPES = ["added", "changed", "fixed", "removed", "notes"];
  var TYPE_NAME = { added: "Added", changed: "Changed", fixed: "Fixed", removed: "Removed", notes: "Changes" };
  var KIND = {
    bug: { name: "Something is broken", send: "Send report", legend: "What happened?", color: 0xD9785A,
      hint: "What you saw, in your own words. For example: the second trinket icon stays grey after I use the trinket." },
    idea: { name: "An idea", send: "Send idea", legend: "What is the idea?", color: 0x66C777,
      hint: "What you would like, and what you would use it for." },
    question: { name: "A question", send: "Send question", legend: "What do you want to know?", color: 0x77B2EE,
      hint: "Ask away. Leave your Discord name below so the answer can reach you." }
  };
  var CACHE_MS = 15 * 60 * 1000;
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // ------------------------------------------------------------------ small tools
  function $(id) { return document.getElementById(id); }
  function byId(id) { for (var i = 0; i < ADDONS.length; i++) if (ADDONS[i].id === id) return ADDONS[i]; return null; }

  // el("a", { href: "#", class: "btn", text: "Hi" }, [child, "text"]) - text is never read as HTML
  function el(tag, attrs, kids) {
    var n = document.createElement(tag), k;
    if (attrs) for (k in attrs) {
      if (attrs[k] == null || attrs[k] === false) continue;
      if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    }
    if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function fill(n, kids) { clear(n); (Array.isArray(kids) ? kids : [kids]).forEach(function (c) { if (c != null && c !== false) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }); return n; }

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("zac." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("zac." + k, JSON.stringify(v)); } catch (e) { /* private window: carry on without it */ } },
    del: function (k) { try { localStorage.removeItem("zac." + k); } catch (e) { /* same */ } }
  };

  function cmp(a, b) { // version compare: 3.0.9 < 3.0.19
    var x = String(a).split("."), y = String(b).split(".");
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var p = parseInt(x[i] || "0", 10) || 0, q = parseInt(y[i] || "0", 10) || 0;
      if (p !== q) return p < q ? -1 : 1;
    }
    return 0;
  }
  function toDate(s) {
    if (!s) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    var d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
    return isNaN(d) ? null : d;
  }
  function niceDate(s) { var d = toDate(s); return d ? d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() : ""; }
  function ago(s) {
    var d = toDate(s); if (!d) return "";
    var a = new Date(); a.setHours(0, 0, 0, 0);
    var b = new Date(d.getTime()); b.setHours(0, 0, 0, 0);
    var n = Math.round((a - b) / 86400000);
    if (n <= 0) return "today";
    if (n === 1) return "yesterday";
    if (n < 14) return n + " days ago";
    if (n < 60) return Math.round(n / 7) + " weeks ago";
    return "in " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
  function debounce(fn, ms) { var t; return function () { var a = arguments, me = this; clearTimeout(t); t = setTimeout(function () { fn.apply(me, a); }, ms); }; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var toastTimer;
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2200); }
  function copyText(text, okMsg) {
    function fallback() {
      var ta = el("textarea", { style: "position:fixed;left:-999px;top:0" }); ta.value = text; document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta); toast(ok ? okMsg : "Could not copy. Select the text and copy it yourself.");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
    else fallback();
  }
  // text with the search words marked
  function marked(text, words) {
    if (!words || !words.length) return [text];
    var re = new RegExp("(" + words.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|") + ")", "ig");
    return text.split(re).map(function (part, i) { return i % 2 ? el("mark", { text: part }) : part; });
  }
  function gameChips(list) { return el("span", { class: "games-in" }, list.map(function (g) { return el("span", { class: "g", text: GAMES[g] || g }); })); }

  // ------------------------------------------------------------------ the version history
  // VERS[id] = newest first; starts as the built-in history, newer GitHub releases are added on top.
  var VERS = {}, LIVE = {}, KNOWN = null;
  ADDONS.forEach(function (a) {
    VERS[a.id] = ((SNAP.addons[a.id] || {}).versions || []).slice();
    LIVE[a.id] = { state: "wait", zip: {}, page: {} };
  });
  function newest(id) { return VERS[id][0] || { v: "?", d: "", title: "", s: [] }; }
  function titleFor(v, game) { return (game && v.titles && v.titles[game]) || v.title || ""; }
  function shows(item, game) { return !game || !item.g || item.g.indexOf(game) !== -1; }
  function countItems(list, game) { var n = 0; list.forEach(function (v) { v.s.forEach(function (s) { s.items.forEach(function (i) { if (shows(i, game)) n++; }); }); }); return n; }

  // A GitHub release's text -> the same shape as the built-in history.
  //   "# Name 1.2.3: Title" / "## Added" / "- line" / "  * sub line"
  function parseRelease(rel) {
    var v = { v: String(rel.tag || "").replace(/^v/i, ""), d: rel.date || "", title: "", s: [] };
    var sec = null, item = null;
    String(rel.body || "").replace(/\r/g, "").split("\n").forEach(function (raw) {
      var m;
      if ((m = /^#\s+(.*)$/.exec(raw))) { var c = m[1].indexOf(": "); v.title = c === -1 ? "" : m[1].slice(c + 2).trim(); return; }
      if ((m = /^#{2,3}\s+(.*)$/.exec(raw))) {
        var t = m[1].trim().toLowerCase(); if (TYPES.indexOf(t) === -1) t = "notes";
        sec = { type: t, items: [] }; v.s.push(sec); item = null; return;
      }
      if ((m = /^[-*]\s+(.*)$/.exec(raw))) {
        if (!sec) { sec = { type: "notes", items: [] }; v.s.push(sec); }
        item = { t: m[1].trim() }; sec.items.push(item); return;
      }
      if (item && (m = /^\s+[-*]\s+(.*)$/.exec(raw))) { (item.sub = item.sub || []).push(m[1].trim()); return; }
      if (item && /^\s+\S/.test(raw)) { if (item.sub) item.sub[item.sub.length - 1] += " " + raw.trim(); else item.t += " " + raw.trim(); }
    });
    v.s = v.s.filter(function (s) { return s.items.length; });
    return v;
  }

  function cached(key, url, trim) {
    var hit = store.get("gh." + key, null);
    if (hit && Date.now() - hit.t < CACHE_MS) return Promise.resolve({ data: hit.d, at: hit.t });
    return fetch(url, { headers: { Accept: "application/vnd.github+json" } }).then(function (r) {
      if (!r.ok) throw new Error("GitHub answered " + r.status);
      return r.json();
    }).then(function (j) {
      var d = trim(j); store.set("gh." + key, { t: Date.now(), d: d }); return { data: d, at: Date.now() };
    }).catch(function (e) {
      if (hit) return { data: hit.d, at: hit.t, stale: true };   // an old answer beats none
      throw e;
    });
  }

  function loadReleases(a) {
    var url = "https://api.github.com/repos/" + USER + "/" + a.repo + "/releases?per_page=20";
    return cached("rel." + a.id, url, function (list) {
      return (Array.isArray(list) ? list : []).filter(function (r) { return !r.draft && !r.prerelease; }).map(function (r) {
        var zip = (r.assets || []).filter(function (x) { return /\.zip$/i.test(x.name); })[0];
        return { tag: r.tag_name, date: r.published_at, body: r.body, page: r.html_url, zip: zip ? zip.browser_download_url : "" };
      });
    }).then(function (res) {
      var have = {}; VERS[a.id].forEach(function (v) { have[v.v] = v; });
      var snapTop = VERS[a.id].length ? VERS[a.id][0].v : "0";
      res.data.forEach(function (rel) {
        var v = String(rel.tag || "").replace(/^v/i, ""); if (!v) return;
        if (rel.zip) LIVE[a.id].zip[v] = rel.zip;
        LIVE[a.id].page[v] = rel.page;
        if (have[v]) { if (!have[v].d && rel.date) have[v].d = rel.date; return; }
        if (cmp(v, snapTop) > 0) { var p = parseRelease(rel); if (p.s.length) { VERS[a.id].push(p); have[v] = p; } }
      });
      VERS[a.id].sort(function (x, y) { return cmp(y.v, x.v); });
      LIVE[a.id].state = "ready"; LIVE[a.id].at = res.at;
    }, function () { LIVE[a.id].state = "away"; });
  }

  // Known problems: open issues in the four repositories that Zac wrote himself, or that carry the label "known".
  function loadKnown() {
    var repos = {}; ADDONS.forEach(function (a) { repos[(USER + "/" + a.repo).toLowerCase()] = a.id; });
    function trim(j) {
      return ((j && j.items) || []).map(function (i) {
        return { title: i.title, url: i.html_url, repo: String(i.repository_url || "").split("/repos/")[1] || "", at: i.created_at };
      });
    }
    var base = "https://api.github.com/search/issues?per_page=30&q=" + encodeURIComponent("user:" + USER + " is:issue is:open ");
    return Promise.all([
      cached("known.own", base + encodeURIComponent("author:" + USER), trim),
      cached("known.label", base + encodeURIComponent("label:known"), trim)
    ]).then(function (both) {
      var seen = {}, out = [];
      both.forEach(function (res) { res.data.forEach(function (i) {
        var id = repos[i.repo.toLowerCase()]; if (!id || seen[i.url]) return;
        seen[i.url] = 1; out.push({ addon: id, title: i.title, url: i.url, at: i.at });
      }); });
      KNOWN = out;
    }, function () { KNOWN = []; });
  }

  // ------------------------------------------------------------------ rendering the history
  function itemNode(item, words, tag) {
    var kids = marked(item.t, words);
    if (item.g) { kids.push(" "); kids.push(gameChips(item.g)); }
    if (tag) kids.push(el("span", { class: "in-v", text: tag }));
    if (item.sub && item.sub.length) kids.push(el("ul", null, item.sub.map(function (s) { return el("li", null, marked(s, words)); })));
    return el("li", null, kids);
  }
  function sectionNode(type, nodes, showHead) {
    return el("section", { class: "sec sec-" + type }, [showHead ? el("h3", { text: TYPE_NAME[type] || "Changes" }) : null, el("ul", null, nodes)]);
  }

  // ------------------------------------------------------------------ home
  function tickSvg(away) {
    var ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg"), p = document.createElementNS(ns, "path");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
    p.setAttribute("d", away ? "M6 12h12" : "M5 12.5l4.5 4.5L19 7"); s.appendChild(p); return s;
  }
  function rosterRow(a) {
    var v = newest(a.id), live = LIVE[a.id], zip = live.zip[v.v];
    var title = titleFor(v);
    return el("li", { class: "r-row", "data-state": live.state, "data-addon": a.id }, [
      el("span", { class: "r-tick" }, tickSvg(live.state === "away")),
      el("div", { class: "r-who" }, [
        el("h3", { text: a.name }),
        el("p", { text: a.line }),
        el("p", { class: "r-new" }, [gameChips(a.games)])
      ]),
      el("div", { class: "r-ver" }, [
        el("strong", { text: v.v }),
        el("span", { text: v.d ? "released " + ago(v.d) : "" }),
        el("span", { class: "vh", text: live.state === "ready" ? "checked with GitHub" : live.state === "away" ? "GitHub did not answer" : "checking" })
      ]),
      el("div", { class: "r-act" }, [
        el("a", { class: "btn btn-go", href: a.curse, target: "_blank", rel: "noopener", text: "Get it on CurseForge" }),
        zip ? el("a", { class: "btn", href: zip, text: "Zip", title: a.name + " " + v.v + " as a zip file from GitHub" })
            : el("a", { class: "btn", href: "https://github.com/" + USER + "/" + a.repo + "/releases/latest", target: "_blank", rel: "noopener", text: "Zip", title: "The newest release on GitHub" })
      ]),
      el("div", { class: "r-more" }, [
        title ? el("span", { class: "hint", text: "Newest: " + title }) : null,
        el("a", { href: "#/changelog/" + a.id, text: "What changed" }),
        el("a", { href: "#/report?addon=" + a.id, text: "Report a problem" })
      ])
    ]);
  }
  var drawn = {};
  function drawRoster() {
    var rows = ADDONS.map(rosterRow);
    fill($("roster-list"), rows);
    // a row that has just checked in is drawn waiting first, so its tick can draw itself
    rows.forEach(function (row, i) {
      var id = ADDONS[i].id, now = LIVE[id].state;
      if (now === "ready" && drawn[id] !== "ready") {
        row.setAttribute("data-state", "wait");
        requestAnimationFrame(function () { requestAnimationFrame(function () { row.setAttribute("data-state", "ready"); }); });
      }
      drawn[id] = now;
    });
    var states = ADDONS.map(function (a) { return LIVE[a.id].state; });
    var waiting = states.indexOf("wait") !== -1, away = states.filter(function (s) { return s === "away"; }).length;
    var txt = "Checking for new versions…";
    if (!waiting) {
      if (away === ADDONS.length) txt = "GitHub did not answer. These are the versions this page knew on " + niceDate(SNAP.generated) + ".";
      else if (away) txt = plural(ADDONS.length - away, "addon") + " checked in. The rest show what this page knew on " + niceDate(SNAP.generated) + ".";
      else {
        var top = ADDONS.map(function (a) { return { a: a, v: newest(a.id) }; }).sort(function (x, y) { return (toDate(y.v.d) || 0) - (toDate(x.v.d) || 0); })[0];
        txt = "All " + ADDONS.length + " checked in. Newest release: " + top.a.name + " " + top.v.v + ", " + ago(top.v.d) + ".";
      }
    }
    $("roster-state").textContent = txt;
  }

  function option(value, text, sel) { var o = el("option", { value: value, text: text }); if (sel) o.selected = true; return o; }
  function fillVersionSelect(sel, id, chosen, withUnsure) {
    var list = VERS[id], kids = [];
    if (withUnsure) kids.push(option("", "Not sure", !chosen));
    list.forEach(function (v, i) { kids.push(option(v.v, v.v + (i === 0 ? " (newest)" : ""), chosen === v.v)); });
    if (list.length > 1) kids.push(option("older", "Older than " + list[list.length - 1].v, chosen === "older"));
    fill(sel, kids);
  }
  function fillGameSelect(sel, id, chosen, anyText) {
    var a = byId(id), kids = [option("", anyText, !chosen)];
    a.games.forEach(function (g) { kids.push(option(g, GAMES[g], chosen === g)); });
    fill(sel, kids);
  }

  var since = store.get("since", {});
  function drawSinceForm() {
    if (!byId(since.addon)) since.addon = ADDONS[0].id;
    fill($("since-addon"), ADDONS.map(function (a) { return option(a.id, a.name, a.id === since.addon); }));
    var list = VERS[since.addon];
    var known = since.v === "older" || list.some(function (v) { return v.v === since.v; });
    if (!known) since.v = list.length > 1 ? list[1].v : list[0].v;   // one behind: there is something to show
    fillVersionSelect($("since-version"), since.addon, since.v, false);
    if (byId(since.addon).games.indexOf(since.game) === -1) since.game = "";
    fillGameSelect($("since-game"), since.addon, since.game, "Every game version");
    drawSince();
  }
  function drawSince() {
    var a = byId(since.addon), list = VERS[a.id], out = $("since-out"), top = list[0];
    var newer = since.v === "older" ? list.slice() : list.filter(function (v) { return cmp(v.v, since.v) > 0; });
    store.set("since", since);
    if (!newer.length) {
      fill(out, el("p", { class: "since-sum" }, [el("strong", { text: "You have the newest " + a.name + "." }), " Nothing to catch up on."]));
      return;
    }
    var groups = {}, total = 0;
    newer.forEach(function (v) { v.s.forEach(function (s) { s.items.forEach(function (i) {
      if (!shows(i, since.game)) return;
      (groups[s.type] = groups[s.type] || []).push({ item: i, v: v.v }); total++;
    }); }); });
    var parts = TYPES.filter(function (t) { return groups[t]; }).map(function (t) {
      return t === "notes" ? plural(groups[t].length, "change") : groups[t].length + " " + TYPE_NAME[t].toLowerCase();
    });
    var head = el("p", { class: "since-sum" }, [
      el("strong", { text: plural(newer.length, "version") + " behind." }),
      " " + (total ? parts.join(", ") + (since.game ? " on " + GAMES[since.game] : "") + "." : "Nothing in them changes " + GAMES[since.game] + ".")
    ]);
    var get = el("div", { class: "since-get" }, [
      el("a", { class: "btn btn-go", href: a.curse, target: "_blank", rel: "noopener", text: "Get " + a.name + " " + top.v }),
      el("a", { class: "btn", href: "#/changelog/" + a.id, text: "Read it version by version" })
    ]);
    var cols = el("div", { class: "since-cols" }, TYPES.filter(function (t) { return groups[t]; }).map(function (t) {
      var all = groups[t], LIMIT = 8;
      var nodes = all.map(function (g) { return itemNode(g.item, null, g.v); });
      var sec = sectionNode(t, nodes.slice(0, LIMIT), true);
      if (nodes.length > LIMIT) {
        var more = el("button", { type: "button", class: "link more", text: "Show all " + nodes.length, onclick: function () {
          var ul = sec.querySelector("ul"); nodes.slice(LIMIT).forEach(function (n) { ul.appendChild(n); }); more.remove();
        } });
        sec.appendChild(more);
      }
      return sec;
    }));
    fill(out, [head, get, cols]);
  }

  function knownNode(k, withAddon) {
    var a = byId(k.addon);
    return el("li", null, [
      el("a", { href: k.url, target: "_blank", rel: "noopener", text: k.title }),
      el("small", { text: (withAddon ? a.name + ", " : "") + "reported " + ago(k.at) })
    ]);
  }
  function drawKnown() {
    var has = KNOWN && KNOWN.length;
    $("known-wrap").hidden = !has;
    if (has) fill($("known-list"), KNOWN.map(function (k) { return knownNode(k, true); }));
    drawSideKnown();
  }

  // ------------------------------------------------------------------ what changed
  var log = { addon: store.get("log.addon", ADDONS[0] && ADDONS[0].id), q: "", game: "", types: {}, all: false, target: "" };
  var LOG_FIRST = 8;
  function drawLogTabs() {
    fill($("log-tabs"), ADDONS.map(function (a) {
      return el("button", { type: "button", "aria-pressed": a.id === log.addon ? "true" : "false", onclick: function () { location.hash = "#/changelog/" + a.id; } },
        [a.name, el("small", { text: newest(a.id).v })]);
    }));
  }
  function drawLogTools() {
    var a = byId(log.addon), list = VERS[a.id];
    if (a.games.indexOf(log.game) === -1) log.game = "";
    fillGameSelect($("log-game"), a.id, log.game, "Every game version");
    var present = TYPES.filter(function (t) { return t !== "notes" && list.some(function (v) { return v.s.some(function (s) { return s.type === t; }); }); });
    Object.keys(log.types).forEach(function (t) { if (present.indexOf(t) === -1) delete log.types[t]; });
    $("log-types").hidden = present.length < 2;
    fill($("log-types"), present.map(function (t) {
      return el("button", { type: "button", "aria-pressed": log.types[t] ? "true" : "false", text: TYPE_NAME[t], onclick: function () {
        if (log.types[t]) delete log.types[t]; else log.types[t] = true; drawLogTools(); drawLog();
      } });
    }));
  }
  function drawLog() {
    var a = byId(log.addon), list = VERS[a.id], box = $("log");
    var words = log.q.toLowerCase().split(/\s+/).filter(function (w) { return w.length > 1; });
    var typed = Object.keys(log.types).length > 0;
    var filtering = words.length || typed;
    var shown = 0, lines = 0, nodes = [];
    function hit(item) {
      if (!words.length) return true;
      var hay = (item.t + " " + (item.sub || []).join(" ")).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) !== -1; });
    }
    list.forEach(function (v, idx) {
      var title = titleFor(v, log.game);
      var titleHit = words.length && words.every(function (w) { return (title + " " + v.v).toLowerCase().indexOf(w) !== -1; });
      var secs = [];
      v.s.forEach(function (s) {
        if (typed && !log.types[s.type]) return;
        var items = s.items.filter(function (i) { return shows(i, log.game) && (titleHit || hit(i)); });
        if (items.length) { secs.push(sectionNode(s.type, items.map(function (i) { return itemNode(i, words); }), s.type !== "notes")); lines += items.length; }
      });
      if (!secs.length) return;
      shown++;
      if (!filtering && !log.all && !log.target && shown > LOG_FIRST) return;
      nodes.push(el("article", { class: "ver" + (log.target === v.v ? " is-target" : ""), id: "v-" + v.v }, [
        el("div", { class: "ver-side" }, [
          el("div", { class: "ver-n" }, el("a", { href: "#/changelog/" + a.id + "/" + v.v, title: "A link to this version", text: v.v })),
          el("p", { class: "ver-d", text: niceDate(v.d) })
        ]),
        el("div", { class: "ver-body" }, [
          el("div", { class: "ver-top" }, [
            el("h2", null, [].concat(title ? marked(title, words) : [a.name + " " + v.v], idx === 0 ? [el("span", { class: "tag tag-new", text: "Newest" })] : [])),
            el("a", { class: "link", href: "#/report?addon=" + a.id + "&v=" + v.v, text: "Report a problem with " + v.v })
          ])
        ].concat(secs))
      ]));
    });
    var hidden = !filtering && !log.all && !log.target ? Math.max(0, shown - LOG_FIRST) : 0;
    if (hidden) nodes.push(el("p", { class: "more" }, el("button", { type: "button", class: "btn", text: "Show the " + plural(hidden, "older version"), onclick: function () { log.all = true; drawLog(); } })));
    if (!nodes.length) nodes.push(el("p", { class: "empty", text: filtering || log.game ? "Nothing matches. Try one word, or take a filter off." : "No history yet." }));
    fill(box, nodes);
    $("log-count").textContent = filtering || log.game
      ? plural(lines, "change") + " in " + plural(shown, "version") + (words.length ? " for “" + log.q.trim() + "”" : "") + (log.game ? " on " + GAMES[log.game] : "")
      : plural(lines, "change") + " in " + plural(shown, "version") + ", newest first";
    if (log.target) { var t = document.getElementById("v-" + log.target); if (t) t.scrollIntoView({ block: "start" }); }
  }

  // ------------------------------------------------------------------ report
  var form, shot = null, opened = Date.now(), webhook = String(CFG.reportWebhook || "").trim();
  var isDiscord = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/i.test(webhook);
  var canSend = isDiscord || /^https:\/\/[^\s]+$/i.test(webhook);

  function val(id) { return ($(id).value || "").trim(); }
  function kind() { var r = form.querySelector('input[name="type"]:checked'); return r ? r.value : "bug"; }
  function addonPick() { var r = form.querySelector('input[name="addon"]:checked'); return r ? r.value : ADDONS[0].id; }

  function drawAddonPick(chosen) {
    fill($("r-addon"), ADDONS.map(function (a) {
      var i = el("input", { type: "radio", name: "addon", value: a.id }); i.checked = a.id === chosen;
      return el("label", null, [i, el("span", { text: a.name })]);
    }));
  }
  function onAddon(keepVersion, keepGame) {
    var a = byId(addonPick());
    fillVersionSelect($("r-version"), a.id, keepVersion || "", true);
    fillGameSelect($("r-game"), a.id, keepGame || "", "Not sure");
    $("r-version-hint").textContent = "Where to find it: " + a.version;
    $("r-error-hint").textContent = a.id === "stacked" ? "For this addon, what /srg status prints helps a lot. Paste it here too." : "Long errors are fine. The whole text is sent along as a file.";
    onVersion(); drawSideKnown();
  }
  function onKind() {
    var k = kind(), K = KIND[k];
    Array.prototype.forEach.call(form.querySelectorAll(".bugonly"), function (n) { n.hidden = k !== "bug"; });
    $("r-what-legend").textContent = K.legend; $("r-what").placeholder = K.hint;
    $("r-last-num").textContent = k === "bug" ? "4" : "3";
    $("r-send").textContent = K.send;
    $("r-old").hidden = k !== "bug" || !$("r-old").firstChild;
    drawMatches();
  }
  function behind() {
    var a = byId(addonPick()), v = val("r-version"), list = VERS[a.id];
    if (!v) return { n: 0, list: list.slice(0, 6), unsure: true };
    var newer = v === "older" ? list.slice() : list.filter(function (x) { return cmp(x.v, v) > 0; });
    return { n: newer.length, list: newer };
  }
  function onVersion() {
    var a = byId(addonPick()), b = behind(), box = $("r-old");
    clear(box);
    if (b.n > 0) {
      fill(box, [
        el("p", null, [el("strong", { text: "You are " + plural(b.n, "version") + " behind." }), " " + a.name + " " + newest(a.id).v + " is the newest. Update first: there is a fair chance this is already fixed."]),
        el("p", null, [el("a", { href: a.curse, target: "_blank", rel: "noopener", text: "Get " + a.name + " " + newest(a.id).v }), " or carry on and send the report anyway."])
      ]);
    }
    box.hidden = kind() !== "bug" || b.n === 0;
    drawMatches();
  }

  // "This may already be fixed": the words of the report against the Fixed lines of newer versions.
  var STOP = {}; ("about above after again also always another because been before being both cannot could does doing down during each ever every from have having here into just like more most much only other over same should show shows showing shown some still such than that then them there these they thing this those through under until very want were what when where which while will with without would your when game addon addons work works working doesnt dont wont cant broken wrong problem issue stays stay").split(" ").forEach(function (w) { STOP[w] = 1; });
  function stem(w) { return w.replace(/(?:ing|ed|es|s)$/, ""); }
  function tokens(text) {
    var out = {}, m, re = /[a-z][a-z']{2,}/g, s = String(text).toLowerCase();
    while ((m = re.exec(s))) { var w = m[0].replace(/'/g, ""); if (w.length >= 4 && !STOP[w]) out[stem(w)] = 1; }
    return out;
  }
  var drawMatches = debounce(function () {
    var card = $("side-fixed"); if (!form) return;
    var want = tokens(val("r-what") + " " + val("r-steps")), wantN = Object.keys(want).length, b = behind();
    var hits = [];
    if (kind() === "bug" && wantN >= 2) b.list.forEach(function (v) { v.s.forEach(function (s) {
      if (s.type !== "fixed" && s.type !== "notes") return;
      s.items.forEach(function (i) {
        var have = tokens(i.t), n = 0; for (var k in want) if (have[k]) n++;
        if (n >= 2) hits.push({ n: n, v: v.v, i: i });
      });
    }); });
    hits.sort(function (x, y) { return y.n - x.n || cmp(y.v, x.v); });
    hits = hits.slice(0, 4);
    card.hidden = !hits.length;
    if (!hits.length) return;
    $("side-fixed-sub").textContent = b.unsure ? "From the newest versions. Does one of these sound like it?" : "Fixed after the version you have. Does one of these sound like it?";
    fill($("side-fixed-list"), hits.map(function (h) { return el("li", null, [h.i.t, el("small", { text: "in " + h.v })]); }));
  }, 350);
  function drawSideKnown() {
    if (!form) return;
    var mine = (KNOWN || []).filter(function (k) { return k.addon === addonPick(); });
    $("side-known").hidden = !mine.length;
    fill($("side-known-list"), mine.map(function (k) { return knownNode(k, false); }));
  }

  function makeRef(a) {
    var d = new Date(), abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", r = "";
    for (var i = 0; i < 4; i++) r += abc.charAt(Math.floor(Math.random() * abc.length));
    function two(n) { return (n < 10 ? "0" : "") + n; }
    return a.code + "-" + two(d.getFullYear() % 100) + two(d.getMonth() + 1) + two(d.getDate()) + "-" + r;
  }
  function gather() {
    var a = byId(addonPick()), k = kind(), v = val("r-version"), g = val("r-game"), b = behind();
    return {
      a: a, kind: k, version: v, versionText: v === "older" ? "(older than " + VERS[a.id][VERS[a.id].length - 1].v + ")" : (v || "(version not sure)"),
      game: g, gameText: g ? GAMES[g] : "not sure", behind: v ? b.n : 0, newest: newest(a.id).v,
      what: val("r-what"), steps: k === "bug" ? val("r-steps") : "", expected: k === "bug" ? val("r-expected") : "",
      freq: k === "bug" ? val("r-freq") : "", where: k === "bug" ? val("r-where") : "", klass: k === "bug" ? val("r-class") : "",
      combat: k === "bug" && $("r-combat").checked, error: k === "bug" ? val("r-error") : "", others: k === "bug" ? val("r-others") : "",
      contact: val("r-contact")
    };
  }
  function reportText(r, ref, forPublic) {
    var L = [];
    L.push((ref ? "Report " + ref + "\n" : "") + "Kind: " + KIND[r.kind].name);
    L.push("Addon: " + r.a.name + " " + r.versionText + (r.behind ? " (" + plural(r.behind, "version") + " behind, newest is " + r.newest + ")" : ""));
    L.push("Game: " + r.gameText);
    var facts = [];
    if (r.freq) facts.push("How often: " + r.freq);
    if (r.where) facts.push("Where: " + r.where);
    if (r.klass) facts.push("Class: " + r.klass);
    if (r.combat) facts.push("During a fight: yes");
    if (facts.length) L.push(facts.join("\n"));
    L.push("\n" + KIND[r.kind].legend + "\n" + r.what);
    if (r.steps) L.push("\nWhat I did just before\n" + r.steps);
    if (r.expected) L.push("\nWhat I expected\n" + r.expected);
    if (r.error) L.push("\nError text\n" + r.error);
    if (r.others) L.push("\nOther addons: " + r.others);
    if (r.contact && !forPublic) L.push("\nDiscord: " + r.contact);
    return L.join("\n");
  }
  function cut(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; }
  function issueLink(r) {
    var body = cut(reportText(r, "", true), 5500);
    return "https://github.com/" + USER + "/" + r.a.repo + "/issues/new?title=" + encodeURIComponent(cut((r.version && r.version !== "older" ? "[" + r.version + "] " : "") + r.what.replace(/\s+/g, " "), 90)) + "&body=" + encodeURIComponent(body);
  }
  function discordBody(r, ref) {
    var fields = [];
    function add(name, value, inline) { if (value) fields.push({ name: name, value: cut(value, 1000), inline: !!inline }); }
    add("Game", r.gameText, true);
    add("How often", r.freq, true);
    add("Where", (r.where || "") + (r.combat ? (r.where ? ", " : "") + "during a fight" : ""), true);
    add("Class", r.klass, true);
    if (r.behind) add("Behind", plural(r.behind, "version") + " (newest " + r.newest + ")", true);
    add("Did just before", r.steps);
    add("Expected", r.expected);
    if (r.error) add("Error text", "```\n" + cut(r.error.replace(/```/g, "'''"), 900) + "\n```");
    add("Other addons", r.others);
    add("Discord", r.contact, true);
    var embed = {
      title: cut(r.a.name + " " + r.versionText + ": " + KIND[r.kind].name, 250),
      description: cut(r.what, 1800),
      color: KIND[r.kind].color, fields: fields,
      footer: { text: ref }, timestamp: new Date().toISOString()
    };
    if (shot) embed.image = { url: "attachment://" + shot.name };
    var ping = /^\d{5,25}$/.test(String(CFG.pingUserId || "")) ? String(CFG.pingUserId) : "";
    var files = [{ id: 0, filename: ref + ".txt" }];
    if (shot) files.push({ id: 1, filename: shot.name });
    var body = { username: "Addon reports", content: ping ? "<@" + ping + ">" : "", allowed_mentions: { parse: [], users: ping ? [ping] : [] }, embeds: [embed], attachments: files };
    if (CFG.reportsAreForumPosts) body.thread_name = cut("[" + r.a.code + (r.version && r.version !== "older" ? " " + r.version : "") + "] " + r.what.replace(/\s+/g, " "), 95);
    return body;
  }

  function result(kindOfNote, nodes) { var box = $("r-result"); box.className = "note" + (kindOfNote === "warn" ? " note-warn" : ""); fill(box, nodes); box.hidden = false; }
  function showDone(r, ref, sent) {
    $("report-form").hidden = true; $("report-intro").hidden = true;
    $("done-h").textContent = r.kind === "bug" ? "Report sent" : r.kind === "idea" ? "Idea sent" : "Question sent";
    $("done-p").textContent = r.contact
      ? "It is in Zac's Discord now. If something is unclear he will message " + r.contact + " there."
      : "It is in Zac's Discord now. You left no Discord name, so he cannot ask you anything about it. To add something later, message " + (CFG.discordName || "Zac") + " on Discord with the reference below.";
    $("done-ref").textContent = ref;
    var d = $("report-done"); d.hidden = false; d.focus(); window.scrollTo(0, 0);
    if (sent) { store.del("draft"); var times = store.get("sent", []); times.push(Date.now()); store.set("sent", times.slice(-10)); }
  }
  function send(ev) {
    ev.preventDefault();
    var r = gather(), tooShort = r.what.length < 12;
    $("r-what-err").hidden = !tooShort; $("r-result").hidden = true;
    if (tooShort) { $("r-what").focus(); return; }
    var ref = makeRef(r.a);
    if (val("r-site")) { showDone(r, ref, false); return; }                      // a script filled the hidden field
    if (!canSend) { copyText(reportText(r, ref), "Report copied"); return; }
    var recent = store.get("sent", []).filter(function (t) { return Date.now() - t < 10 * 60 * 1000; });
    if (recent.length >= 3) { result("warn", "That is three reports in ten minutes. Give it a few minutes, or put the rest into one report."); return; }
    if (Date.now() - opened < 4000) { result("warn", "That was quick. Read it over once and press send again."); opened = 0; return; }

    var fd = new FormData(), text = reportText(r, ref);
    fd.append("payload_json", JSON.stringify(discordBody(r, ref)));
    fd.append("files[0]", new Blob([text], { type: "text/plain" }), ref + ".txt");
    if (shot) fd.append("files[1]", shot.blob, shot.name);
    var url = webhook;
    if (isDiscord && !/[?&]wait=/.test(url)) url += (url.indexOf("?") === -1 ? "?" : "&") + "wait=true";
    var btn = $("r-send"), label = btn.textContent;
    btn.disabled = true; btn.textContent = "Sending…";
    fetch(url, { method: "POST", body: fd }).then(function (res) {
      if (res.ok) { showDone(r, ref, true); return; }
      if (res.status === 429) return res.json().catch(function () { return {}; }).then(function (j) {
        var wait = Math.ceil(Number(j.retry_after) || 5);
        result("warn", "Discord is busy right now. Try again in " + plural(wait, "second") + ". Nothing you wrote is lost.");
      });
      if (res.status === 413) { result("warn", "The screenshot is too big for Discord. Remove it and send again, then mention that you have one."); return; }
      throw new Error("status " + res.status);
    }).catch(function () {
      result("warn", [
        el("p", null, [el("strong", { text: "The report did not go through." }), " Nothing you wrote is lost."]),
        el("p", null, ["Press “Copy the report text” and send it to " + (CFG.discordName || "Zac") + " on Discord, or open it on GitHub instead."])
      ]);
    }).then(function () { btn.disabled = false; btn.textContent = label; });
  }

  // a screenshot, shrunk in the browser before it is sent
  function takeShot(file) {
    if (!file || !/^image\//.test(file.type)) return;
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var max = 1920, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
      var c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(function (blob) {
        if (!blob) return;
        shot = { blob: blob, name: "screenshot.jpg" };
        $("r-shot-name").textContent = (file.name || "Pasted picture") + ", " + Math.max(1, Math.round(blob.size / 1024)) + " KB";
        $("r-shot-clear").hidden = false;
      }, "image/jpeg", 0.86);
    };
    img.onerror = function () { URL.revokeObjectURL(url); toast("That picture could not be read."); };
    img.src = url;
  }
  function dropShot() { shot = null; $("r-shot").value = ""; $("r-shot-name").textContent = "None added"; $("r-shot-clear").hidden = true; }

  var DRAFT = ["r-what", "r-steps", "r-expected", "r-freq", "r-where", "r-class", "r-error", "r-others", "r-contact"];
  var saveDraft = debounce(function () {
    var d = { type: kind(), addon: addonPick(), version: val("r-version"), game: val("r-game"), combat: $("r-combat").checked };
    DRAFT.forEach(function (id) { d[id] = $(id).value; });
    store.set("draft", d);
    var r = gather(); $("r-issue").href = issueLink(r);
  }, 400);

  function setupReport() {
    form = $("report-form");
    var d = store.get("draft", {});
    if (KIND[d.type]) form.querySelector('input[name="type"][value="' + d.type + '"]').checked = true;
    drawAddonPick(byId(d.addon) ? d.addon : ADDONS[0].id);
    DRAFT.forEach(function (id) { if (typeof d[id] === "string") $(id).value = d[id]; });
    $("r-combat").checked = !!d.combat;
    onAddon(d.version, d.game); onKind();

    form.addEventListener("submit", send);
    form.addEventListener("input", saveDraft);
    form.addEventListener("change", function (e) {
      if (e.target.name === "addon") onAddon("", val("r-game"));
      else if (e.target.name === "type") onKind();
      else if (e.target.id === "r-version") onVersion();
      saveDraft();
    });
    $("r-what").addEventListener("input", drawMatches); $("r-steps").addEventListener("input", drawMatches);
    $("r-shot").addEventListener("change", function () { takeShot(this.files && this.files[0]); });
    $("r-shot-clear").addEventListener("click", dropShot);
    form.addEventListener("paste", function (e) {
      var f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0];
      if (f && /^image\//.test(f.type) && kind() === "bug") { e.preventDefault(); takeShot(f); toast("Screenshot added"); }
    });
    $("r-copy").addEventListener("click", function () {
      var r = gather(); if (r.what.length < 12) { $("r-what-err").hidden = false; $("r-what").focus(); return; }
      copyText(reportText(r, makeRef(r.a)), "Report copied");
    });
    $("done-again").addEventListener("click", function () {
      $("report-done").hidden = true; form.hidden = false; $("report-intro").hidden = false; $("r-result").hidden = true;
      ["r-what", "r-steps", "r-expected", "r-error"].forEach(function (id) { $(id).value = ""; });
      dropShot(); opened = Date.now(); drawMatches(); $("r-what").focus();
    });

    $("lede-discord").hidden = !canSend;
    if (canSend) {
      $("r-send-hint").textContent = "It goes straight to Zac's Discord. This site keeps nothing, and nothing else about you is sent.";
    } else {
      $("r-send").hidden = true; $("r-copy").className = "btn btn-go btn-big";
      $("r-send-hint").textContent = "Copy the text and send it to " + (CFG.discordName || "Zac") + " on Discord, or open it on GitHub.";
      $("report-intro").textContent = "Two minutes, no account. Fill it in, then copy the text and send it over.";
    }
    $("r-issue").href = issueLink(gather());
  }
  function openReport(q) {
    $("report-done").hidden = true; form.hidden = false; $("report-intro").hidden = false; opened = Date.now();
    if (byId(q.addon)) {
      form.querySelector('input[name="addon"][value="' + q.addon + '"]').checked = true;
      var has = VERS[q.addon].some(function (v) { return v.v === q.v; });
      onAddon(has ? q.v : "", byId(q.addon).games.indexOf(q.game) !== -1 ? q.game : val("r-game"));
    }
  }

  // ------------------------------------------------------------------ help and the footer
  function drawHelp() {
    fill($("help-versions"), ADDONS.reduce(function (out, a) { out.push(el("dt", { text: a.name }), el("dd", { text: a.version })); return out; }, []));
    var games = Object.keys(GAMES);
    fill($("help-games"), [
      el("thead", null, el("tr", null, [el("th", { text: "" })].concat(games.map(function (g) { return el("th", { scope: "col", text: GAMES[g] }); })))),
      el("tbody", null, ADDONS.map(function (a) {
        return el("tr", null, [el("th", { scope: "row", text: a.name })].concat(games.map(function (g) {
          var yes = a.games.indexOf(g) !== -1; return el("td", { class: yes ? "yes" : "no", text: yes ? "Yes" : "No" });
        })));
      }))
    ]);
    fill($("help-cmds"), ADDONS.map(function (a) {
      return el("div", null, [el("h3", { text: a.name }), el("dl", null, a.commands.reduce(function (out, c) {
        out.push(el("dt", null, el("code", { text: c[0] })), el("dd", { text: c[1] })); return out;
      }, []))]);
    }));
    var reach = [];
    if (CFG.discordName) reach.push(CFG.discordInvite ? el("a", { href: CFG.discordInvite, target: "_blank", rel: "noopener", text: "Join the Discord" }) : el("span", null, ["I am ", el("strong", { text: CFG.discordName }), " on Discord"]));
    if (CFG.twitch) reach.push(el("a", { href: CFG.twitch, target: "_blank", rel: "noopener", text: "live on Twitch" }));
    var kids = [];
    reach.forEach(function (n, i) { if (i) kids.push(i === reach.length - 1 ? " and " : ", "); kids.push(n); });
    kids.push(reach.length ? ". For anything that is broken, the " : "For anything that is broken, the ");
    kids.push(el("a", { href: "#/report", text: "report page" })); kids.push(" is quickest: it asks for the details I would ask you for anyway.");
    fill($("reach-p"), kids);
    document.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-copy]"); if (b) copyText(b.getAttribute("data-copy"), "Copied");
    });
  }
  function drawFoot() {
    var links = [el("a", { href: "https://github.com/" + USER, target: "_blank", rel: "noopener", text: "GitHub" })];
    ADDONS.forEach(function (a) { links.push(el("a", { href: a.curse, target: "_blank", rel: "noopener", text: a.name + " on CurseForge" })); });
    if (CFG.twitch) links.push(el("a", { href: CFG.twitch, target: "_blank", rel: "noopener", text: "Twitch" }));
    if (CFG.discordInvite) links.push(el("a", { href: CFG.discordInvite, target: "_blank", rel: "noopener", text: "Discord" }));
    fill($("foot-links"), links);
  }

  // ------------------------------------------------------------------ pages
  var VIEWS = { home: "Zac's addons for WoW Classic", changelog: "What changed", report: "Report a problem", help: "Help" };
  var first = true;
  function route() {
    var h = location.hash.replace(/^#\/?/, ""), qi = h.indexOf("?");
    var path = (qi === -1 ? h : h.slice(0, qi)).split("/").filter(Boolean).map(decodeURIComponent), q = {};
    if (qi !== -1) h.slice(qi + 1).split("&").forEach(function (p) { var kv = p.split("="); try { q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ""); } catch (e) { /* a broken link: ignore that part */ } });
    var view = VIEWS[path[0]] ? path[0] : "home";
    Object.keys(VIEWS).forEach(function (v) { $("view-" + v).hidden = v !== view; });
    Array.prototype.forEach.call(document.querySelectorAll("[data-nav]"), function (a) {
      if (a.getAttribute("data-nav") === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    document.title = view === "home" ? VIEWS.home : VIEWS[view] + " - Zac's addons";
    if (view === "changelog") {
      if (byId(path[1]) && path[1] !== log.addon) { log.addon = path[1]; log.all = false; log.types = {}; }
      log.target = path[2] && VERS[log.addon].some(function (v) { return v.v === path[2]; }) ? path[2] : "";
      if (log.target) { log.q = ""; log.types = {}; $("log-q").value = ""; }   // a link to one version shows that version, whatever was being searched
      store.set("log.addon", log.addon);
      drawLogTabs(); drawLogTools(); drawLog();
    }
    if (view === "report") openReport(q);
    if (!(view === "changelog" && log.target)) window.scrollTo(0, 0);
    if (!first) $("main").focus({ preventScroll: true });
    first = false;
  }

  function refresh() {   // after GitHub answered: redraw whatever shows versions
    drawRoster(); drawSinceForm();
    if (!$("view-changelog").hidden) { drawLogTabs(); drawLogTools(); drawLog(); }
    if (form) { var v = val("r-version"), g = val("r-game"); fillVersionSelect($("r-version"), addonPick(), v, true); fillGameSelect($("r-game"), addonPick(), g, "Not sure"); onVersion(); }
  }

  function start() {
    if (!ADDONS.length) return;
    if (!byId(log.addon)) log.addon = ADDONS[0].id;
    drawRoster(); drawSinceForm(); drawHelp(); drawFoot(); setupReport();

    $("since-addon").addEventListener("change", function () { since.addon = this.value; since.v = null; drawSinceForm(); });
    $("since-version").addEventListener("change", function () { since.v = this.value; drawSince(); });
    $("since-game").addEventListener("change", function () { since.game = this.value; drawSince(); });
    $("log-q").addEventListener("input", debounce(function () { log.q = $("log-q").value; drawLog(); }, 150));
    $("log-game").addEventListener("change", function () { log.game = this.value; drawLog(); });

    window.addEventListener("hashchange", route);
    route();

    // The ready check: each addon ticks when GitHub has answered for it, one after the other.
    var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ADDONS.forEach(function (a, i) {
      Promise.all([loadReleases(a), sleep(calm ? 0 : 350 + i * 260)]).then(refresh);
    });
    loadKnown().then(drawKnown);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
