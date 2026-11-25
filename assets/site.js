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
    bug: { name: "Something is broken", send: "Send report", legend: "What happened?", color: 0xFF9933,
      page: "Report a problem", intro: "Two minutes, no account. The more exactly you say what happened, the faster it gets fixed.", done: "Report sent",
      hint: "What you saw, in your own words. For example: the second trinket icon stays grey after I use the trinket." },
    idea: { name: "An idea", send: "Send suggestion", legend: "What is the idea?", color: 0x599E59,
      page: "Suggest a feature", intro: "Something missing, or something that could work better? Say it in your own words. Every one gets read.", done: "Suggestion sent",
      hint: "What you would like the addon to do. For example: a sound when Windfury gives me extra attacks." },
    question: { name: "A question", send: "Send question", legend: "What do you want to know?", color: 0x66B3FF,
      page: "Ask a question", intro: "Not sure how something works, or whether it can? Ask. Leave your Discord name so the answer can reach you.", done: "Question sent",
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
  var VERS = {}, LIVE = {}, KNOWN = null, IDEAS = null;
  ADDONS.forEach(function (a) {
    VERS[a.id] = ((SNAP.addons[a.id] || {}).versions || []).slice();
    LIVE[a.id] = { state: "wait", zip: {}, exe: {}, page: {} };
  });
  function newest(id) { return VERS[id][0] || { v: "?", d: "", title: "", s: [] }; }
  function titleFor(v, game) { return (game && v.titles && v.titles[game]) || v.title || ""; }
  function shows(item, game) { return !game || !item.g || item.g.indexOf(game) !== -1; }
  function countItems(list, game) { var n = 0; list.forEach(function (v) { v.s.forEach(function (s) { s.items.forEach(function (i) { if (shows(i, game)) n++; }); }); }); return n; }

  // A GitHub release's text -> the same shape as the built-in history.
  //   "# Name 1.2.3: Title" / "## Added" / "- line" / "  * sub line"
  function parseRelease(rel) {
    var v = { v: String(rel.tag || "").replace(/^v/i, ""), d: rel.date || "", title: "", s: [] };
    var sec = null, item = null, loose = [];
    // (WowTiler's notes are written by hand: bold lines for headings, "- - " bullets, and the
    //  app's description under a "---" rule, which is not part of what changed)
    function plain(t) { return t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(^|\s)\*(\S.*?)\*(?=\s|[.,:;)]|$)/g, "$1$2").replace(/`([^`]+)`/g, "$1").trim(); }
    var text = String(rel.body || "").replace(/\r/g, "").split(/\n-{3,}\s*\n/)[0];
    text.split("\n").forEach(function (raw) {
      var m;
      raw = raw.replace(/^-\s+-\s+/, "- ");
      if ((m = /^\*\*([^*]+)\*\*\s*$/.exec(raw))) {
        var kind = /fix/i.test(m[1]) ? "fixed" : /new|added/i.test(m[1]) ? "added" : "notes";
        // "New in 1.6 - a third monitor": what follows the dash is the release's title
        var tm = /\s[-:]\s+(.+)$/.exec(m[1]);
        if (tm && !v.title) v.title = tm[1].charAt(0).toUpperCase() + tm[1].slice(1);
        sec = { type: kind, items: [] }; v.s.push(sec); item = null; return;
      }
      if ((m = /^#\s+(.*)$/.exec(raw))) { var c = m[1].indexOf(": "); v.title = c === -1 ? "" : m[1].slice(c + 2).trim(); return; }
      if ((m = /^#{2,3}\s+(.*)$/.exec(raw))) {
        var t = m[1].trim().toLowerCase(); if (TYPES.indexOf(t) === -1) t = "notes";
        sec = { type: t, items: [] }; v.s.push(sec); item = null; return;
      }
      if ((m = /^[-*]\s+(.*)$/.exec(raw))) {
        if (!sec) { sec = { type: "notes", items: [] }; v.s.push(sec); }
        item = { t: plain(m[1]) }; sec.items.push(item); return;
      }
      if (item && (m = /^\s+[-*]\s+(.*)$/.exec(raw))) { (item.sub = item.sub || []).push(plain(m[1])); return; }
      if (item && /^\s+\S/.test(raw)) { if (item.sub) item.sub[item.sub.length - 1] += " " + plain(raw); else item.t += " " + plain(raw); return; }
      if (raw.trim() && !/^\s*\*\*Download/i.test(raw) && !/will offer this update/i.test(raw)) loose.push(plain(raw));
    });
    v.s = v.s.filter(function (s) { return s.items.length; });
    // notes with no list at all: each paragraph is a line
    if (!v.s.length && loose.length) v.s.push({ type: "notes", items: loose.map(function (t) { return { t: t }; }) });
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
        var exe = (r.assets || []).filter(function (x) { return /\.exe$/i.test(x.name); })[0];
        return { tag: r.tag_name, date: r.published_at, body: r.body, page: r.html_url, zip: zip ? zip.browser_download_url : "", exe: exe ? exe.browser_download_url : "" };
      });
    }).then(function (res) {
      var have = {}; VERS[a.id].forEach(function (v) { have[v.v] = v; });
      var snapTop = VERS[a.id].length ? VERS[a.id][0].v : "0";
      res.data.forEach(function (rel) {
        var v = String(rel.tag || "").replace(/^v/i, ""); if (!v) return;
        if (rel.zip) LIVE[a.id].zip[v] = rel.zip;
        if (rel.exe) LIVE[a.id].exe[v] = rel.exe;
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
    function mine(res, seen, out) { res.data.forEach(function (i) {
      var id = repos[i.repo.toLowerCase()]; if (!id || seen[i.url]) return;
      seen[i.url] = 1; out.push({ addon: id, title: i.title, url: i.url, at: i.at });
    }); }
    // an issue labelled "idea" is a suggestion on the list, not a problem
    return cached("ideas", base + encodeURIComponent("label:idea"), trim).then(function (res) {
      var seen = {}; IDEAS = []; mine(res, seen, IDEAS); return seen;
    }, function () { IDEAS = []; return {}; }).then(function (ideaUrls) {
      return Promise.all([
        cached("known.own", base + encodeURIComponent("author:" + USER), trim),
        cached("known.label", base + encodeURIComponent("label:known"), trim)
      ]).then(function (both) {
        var seen = {}, out = [];
        Object.keys(ideaUrls).forEach(function (u) { seen[u] = 1; });
        both.forEach(function (res) { mine(res, seen, out); });
        KNOWN = out;
      }, function () { KNOWN = []; });
    });
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
  // Each addon's own icon, as it ships in the addon (data/addons.js names the file).
  function glyph(id, small) {
    var a = byId(id), box = el("i", { class: small ? "aicon aicon-s" : "aicon", "aria-hidden": "true" });   // (an <i>: the pickers style every <span> inside them)
    if (a && a.icon) box.appendChild(el("img", { src: a.icon, alt: "", width: small ? 20 : 44, height: small ? 20 : 44, loading: "lazy" }));
    return box;
  }

  // The picture beside the headline: forty raiders answering a ready check, eight groups of five in two rows.
  // Bar colours are the classes' own. It plays once; "Run it again" plays it again.
  var RAID = "WWWWW WWWRR RRRMM MMMMK KKKHH HPPPP PDDDS SSSSS".split(" ");
  var CLASS = { W: "#C79C6E", R: "#FFF569", M: "#69CCF0", K: "#9482C9", H: "#ABD473", P: "#F0EDE4", D: "#FF7D0A", S: "#2F7DE0" };
  var raidTimers = [];
  function startRaid() {
    var grid = $("raid-grid"); if (!grid) return;
    var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var cells = [], seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    fill(grid, RAID.map(function (g, gi) {
      return el("div", { class: "grp" }, g.split("").map(function (c, ci) {
        var hp = (gi * 5 + ci) % 7 === 3 ? 0.62 + rnd() * 0.3 : 1;
        var cell = el("i", { class: "cell", style: "--c:" + CLASS[c] + ";--hp:" + hp.toFixed(2) });
        cells.push(cell); return cell;
      }));
    }));
    function run() {
      raidTimers.forEach(clearTimeout); raidTimers = [];
      var n = 0, count = $("raid-count"), again = $("raid-again");
      again.hidden = true;
      function say() { count.textContent = n < cells.length ? "Ready check: " + n + " of " + cells.length : "Ready check: all " + cells.length + " in."; }
      cells.forEach(function (c) { c.removeAttribute("data-s"); });
      if (calm) { cells.forEach(function (c) { c.setAttribute("data-s", "ready"); }); n = cells.length; say(); return; }
      say();
      var late = [11, 28];   // there are always two
      cells.forEach(function (c, i) {
        var at = late.indexOf(i) !== -1 ? 3300 + late.indexOf(i) * 700 : 450 + rnd() * 2100;
        raidTimers.push(setTimeout(function () {
          c.setAttribute("data-s", "ready"); n++; say();
          if (n === cells.length) again.hidden = false;
        }, at));
      });
    }
    $("raid-again").addEventListener("click", run);
    run();
  }

  // the tick is the addons' own check mark; "away" is a plain dash
  function tickSvg(away) {
    if (away) return el("span", { class: "r-dash", "aria-hidden": "true" });
    return el("img", { class: "r-check", src: "assets/icons/readycheck.png", alt: "", width: 22, height: 22 });
  }
  // where "get the newest" goes: CurseForge for an addon; for a program its newest GitHub release
  function getLink(a) {
    if (a.curse) return a.curse;
    var v = newest(a.id).v, live = LIVE[a.id];
    return live.exe[v] || live.zip[v] || "https://github.com/" + USER + "/" + a.repo + "/releases/latest";
  }
  function rosterRow(a) {
    var v = newest(a.id), live = LIVE[a.id], zip = live.zip[v.v];
    var title = titleFor(v);
    return el("li", { class: "r-row", "data-state": live.state, "data-addon": a.id }, [
      el("span", { class: "r-tick" }, tickSvg(live.state === "away")),
      el("div", { class: "r-who" }, [
        glyph(a.id),
        el("h3", { text: a.name }),
        el("p", { text: a.line }),
        el("p", { class: "r-new" }, [a.games.length ? gameChips(a.games) : el("span", { class: "g", text: "Windows 10 and 11" })])
      ]),
      el("div", { class: "r-ver" }, [
        el("strong", { text: v.v }),
        el("span", { text: v.d ? "released " + ago(v.d) : "" }),
        el("span", { class: "vh", text: live.state === "ready" ? "checked with GitHub" : live.state === "away" ? "GitHub did not answer" : "checking" })
      ]),
      el("div", { class: "r-act" }, [
        a.curse ? el("a", { class: "btn btn-go", href: a.curse, target: "_blank", rel: "noopener", text: "Get it on CurseForge" })
                : el("a", { class: "btn btn-go", href: getLink(a), target: live.exe[v.v] || zip ? null : "_blank", rel: "noopener", text: "Download",
                    title: live.exe[v.v] ? a.name + " " + v.v + ", the program itself, from GitHub" : "The newest release on GitHub" }),
        zip ? el("a", { class: "btn", href: zip, text: "Zip", title: a.name + " " + v.v + " as a zip file from GitHub" })
            : el("a", { class: "btn", href: "https://github.com/" + USER + "/" + a.repo + "/releases/latest", target: "_blank", rel: "noopener", text: "Zip", title: "The newest release on GitHub" })
      ]),
      el("div", { class: "r-more" }, [
        title ? el("span", { class: "hint", text: "Newest: " + title }) : null,
        el("a", { href: "#/changelog/" + a.id, text: "What changed" }),
        el("a", { href: "#/report?addon=" + a.id, text: "Report a problem" }),
        el("a", { href: "#/suggest?addon=" + a.id, text: "Suggest a feature" })
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
      else if (away) txt = (ADDONS.length - away) + " of " + ADDONS.length + " checked in. The rest show what this page knew on " + niceDate(SNAP.generated) + ".";
      else {
        var top = ADDONS.map(function (a) { return { a: a, v: newest(a.id) }; }).sort(function (x, y) { return (toDate(y.v.d) || 0) - (toDate(x.v.d) || 0); })[0];
        txt = "All " + ADDONS.length + " checked in. Newest release: " + top.a.name + " " + top.v.v + ", " + ago(top.v.d) + ".";
      }
    }
    $("roster-state").textContent = txt;
    var vs = 0, lines = 0;
    ADDONS.forEach(function (a) { vs += VERS[a.id].length; lines += countItems(VERS[a.id]); });
    $("roster-foot").textContent = plural(vs, "version") + " and " + plural(lines, "change") + " on record, every one of them searchable.";
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
    if (sel.parentNode && sel.parentNode.tagName === "LABEL") sel.parentNode.hidden = !a.games.length;   // a program has no game versions
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
      el("a", { class: "btn btn-go", href: getLink(a), target: "_blank", rel: "noopener", text: "Get " + a.name + " " + top.v }),
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
        [glyph(a.id, true), a.name, el("small", { text: newest(a.id).v })]);
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
  var form, shot = null, opened = Date.now(), sendFailed = false;
  var DISCORD_HOOK = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/i;
  // where a report of this kind goes: suggestions may have a channel of their own
  function hookFor(k) {
    var ideas = String(CFG.ideasWebhook || "").trim(), main = String(CFG.reportWebhook || "").trim();
    var url = k === "idea" && /^https:\/\/[^\s]+$/i.test(ideas) ? ideas : main;
    return /^https:\/\/[^\s]+$/i.test(url) ? url : "";
  }
  function canSendKind(k) { return hookFor(k) !== ""; }
  var canSend = canSendKind("bug") || canSendKind("idea");

  function val(id) { return ($(id).value || "").trim(); }
  function kind() { var r = form.querySelector('input[name="type"]:checked'); return r ? r.value : "bug"; }
  function addonPick() { var r = form.querySelector('input[name="addon"]:checked'); return r ? r.value : ADDONS[0].id; }

  function drawAddonPick(chosen) {
    fill($("r-addon"), ADDONS.map(function (a) {
      var i = el("input", { type: "radio", name: "addon", value: a.id }); i.checked = a.id === chosen;
      return el("label", null, [i, el("span", null, [glyph(a.id, true), a.name])]);
    }));
  }
  function onAddon(keepVersion, keepGame) {
    var a = byId(addonPick());
    fillVersionSelect($("r-version"), a.id, keepVersion || "", true);
    fillGameSelect($("r-game"), a.id, keepGame || "", "Not sure");
    $("r-version-hint").textContent = "Where to find it: " + a.version;
    $("r-error-hint").textContent = a.id === "stacked" ? "For this addon, what /srg status prints helps a lot. Paste it here too."
      : a.kind === "app" ? "WowTiler writes WowTiler.log next to the exe. Paste what is in it here."
      : "Long errors are fine. The whole text is sent along as a file.";
    // a program is not in the game: no class, no raid, no other addons
    Array.prototype.forEach.call(form.querySelectorAll(".gameonly"), function (n) { n.hidden = a.kind === "app"; });
    onVersion(); drawSideKnown();
  }
  function onKind() {
    var k = kind(), K = KIND[k];
    Array.prototype.forEach.call(form.querySelectorAll(".bugonly"), function (n) { n.hidden = k !== "bug"; });
    Array.prototype.forEach.call(form.querySelectorAll(".ideaonly"), function (n) { n.hidden = k !== "idea"; });
    Array.prototype.forEach.call(document.querySelectorAll(".bugside"), function (n) { n.hidden = k === "idea"; });
    Array.prototype.forEach.call(document.querySelectorAll(".ideaside"), function (n) { n.hidden = k !== "idea"; });
    $("report-h").textContent = K.page;
    if (!$("view-report").hidden) { document.title = K.page + " - Zac's addons"; markNav(k === "idea" ? "suggest" : "report"); }
    sendMode();
    $("r-what-legend").textContent = K.legend; $("r-what").placeholder = K.hint;
    $("r-last-num").textContent = k === "bug" ? "4" : "3";
    $("r-send").textContent = K.send;
    $("r-old").hidden = k !== "bug" || !$("r-old").firstChild;
    drawMatches(); drawSideKnown();
  }
  // the buttons and the lines around them, for a kind that can or cannot be sent from here
  function sendMode() {
    var k = kind(), K = KIND[k], can = canSendKind(k), who = CFG.discordName || "Zac";
    // with a channel to send to there is ONE button; the other two ways only come up when there is
    // no channel, or when a send has just failed
    var other = !can || sendFailed;
    $("r-send").hidden = !can;
    $("r-copy").hidden = !other; $("r-issue").hidden = !other;
    $("r-copy").className = can ? "btn btn-quiet" : "btn btn-go btn-big";
    $("r-copy").textContent = k === "idea" ? "Copy the suggestion" : k === "question" ? "Copy the question" : "Copy the report text";
    $("report-intro").textContent = can ? K.intro : K.intro.replace(/\s*Leave your Discord name.*$/, "") + " Fill it in, then copy the text and send it over.";
    $("r-send-hint").textContent = can
      ? "It goes straight to Zac's Discord. This site keeps nothing, and nothing else about you is sent."
      : "Copy the text and send it to " + who + " on Discord, or open it on GitHub.";
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
        el("p", null, [el("a", { href: getLink(a), target: "_blank", rel: "noopener", text: "Get " + a.name + " " + newest(a.id).v }), " or carry on and send the report anyway."])
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
    $("side-known").hidden = !mine.length || kind() === "idea";
    fill($("side-known-list"), mine.map(function (k) { return knownNode(k, false); }));
    var ideas = (IDEAS || []).filter(function (k) { return k.addon === addonPick(); });
    $("side-ideas").hidden = !ideas.length || kind() !== "idea";
    fill($("side-ideas-list"), ideas.map(function (k) {
      return el("li", null, [el("a", { href: k.url, target: "_blank", rel: "noopener", text: k.title }), el("small", { text: "added " + ago(k.at) })]);
    }));
  }

  function makeRef(a) {
    var d = new Date(), abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", r = "";
    for (var i = 0; i < 4; i++) r += abc.charAt(Math.floor(Math.random() * abc.length));
    function two(n) { return (n < 10 ? "0" : "") + n; }
    return a.code + "-" + two(d.getFullYear() % 100) + two(d.getMonth() + 1) + two(d.getDate()) + "-" + r;
  }
  function gather() {
    var a = byId(addonPick()), k = kind(), v = val("r-version"), g = val("r-game"), b = behind(), app = a.kind === "app";
    return {
      a: a, kind: k, version: v, versionText: v === "older" ? "(older than " + VERS[a.id][VERS[a.id].length - 1].v + ")" : (v || "(version not sure)"),
      game: g, gameText: app ? "" : (g ? GAMES[g] : "not sure"), behind: v ? b.n : 0, newest: newest(a.id).v,
      what: val("r-what"), why: k === "idea" ? val("r-why") : "", steps: k === "bug" ? val("r-steps") : "", expected: k === "bug" ? val("r-expected") : "",
      freq: k === "bug" ? val("r-freq") : "", where: k === "bug" && !app ? val("r-where") : "", klass: k === "bug" && !app ? val("r-class") : "",
      combat: k === "bug" && !app && $("r-combat").checked, error: k === "bug" ? val("r-error") : "", others: k === "bug" && !app ? val("r-others") : "",
      contact: val("r-contact")
    };
  }
  function reportText(r, ref, forPublic) {
    var L = [];
    L.push((ref ? "Report " + ref + "\n" : "") + "Kind: " + KIND[r.kind].name);
    L.push("Addon: " + r.a.name + " " + r.versionText + (r.behind ? " (" + plural(r.behind, "version") + " behind, newest is " + r.newest + ")" : ""));
    if (r.gameText) L.push("Game: " + r.gameText);
    var facts = [];
    if (r.freq) facts.push("How often: " + r.freq);
    if (r.where) facts.push("Where: " + r.where);
    if (r.klass) facts.push("Class: " + r.klass);
    if (r.combat) facts.push("During a fight: yes");
    if (facts.length) L.push(facts.join("\n"));
    L.push("\n" + KIND[r.kind].legend + "\n" + r.what);
    if (r.why) L.push("\nWhat I would use it for\n" + r.why);
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
  // The post in Discord carries everything. The whole report is only attached as a text file when
  // the post had to cut something short (a long error, a long description).
  function needsFile(r) {
    return r.what.length > 1800 || String(r.error || "").length > 900 ||
      [r.why, r.steps, r.expected, r.others].some(function (v) { return String(v || "").length > 1000; });
  }
  function discordBody(r, ref) {
    var fields = [];
    function add(name, value, inline) { if (value) fields.push({ name: name, value: cut(value, 1000), inline: !!inline }); }
    add("Game", r.gameText, true);
    add("How often", r.freq, true);
    add("Where", (r.where || "") + (r.combat ? (r.where ? ", " : "") + "during a fight" : ""), true);
    add("Class", r.klass, true);
    if (r.behind) add("Behind", plural(r.behind, "version") + " (newest " + r.newest + ")", true);
    add("Would use it for", r.why);
    add("Did just before", r.steps);
    add("Expected", r.expected);
    if (r.error) add("Error text", "```\n" + cut(r.error.replace(/```/g, "'''"), 900) + "\n```");
    add("Other addons", r.others);
    add("Discord", r.contact, true);
    var embed = {
      title: cut(r.a.name + (r.kind !== "bug" && !r.version ? "" : " " + r.versionText) + ": " + KIND[r.kind].name, 250),
      description: cut(r.what, 1800),
      color: KIND[r.kind].color, fields: fields,
      footer: { text: ref }, timestamp: new Date().toISOString()
    };
    if (shot) embed.image = { url: "attachment://" + shot.name };
    var ping = /^\d{5,25}$/.test(String(CFG.pingUserId || "")) ? String(CFG.pingUserId) : "";
    var files = [];
    if (needsFile(r)) files.push({ id: files.length, filename: ref + ".txt" });
    if (shot) files.push({ id: files.length, filename: shot.name });
    var body = { username: "Addon reports", content: ping ? "<@" + ping + ">" : "", allowed_mentions: { parse: [], users: ping ? [ping] : [] }, embeds: [embed] };
    if (files.length) body.attachments = files;
    if (CFG.reportsAreForumPosts) body.thread_name = cut("[" + r.a.code + (r.kind === "idea" ? " idea" : r.version && r.version !== "older" ? " " + r.version : "") + "] " + r.what.replace(/\s+/g, " "), 95);
    return body;
  }

  function result(kindOfNote, nodes) { var box = $("r-result"); box.className = "note" + (kindOfNote === "warn" ? " note-warn" : ""); fill(box, nodes); box.hidden = false; }
  function showDone(r, ref, sent) {
    sendFailed = false;
    $("report-form").hidden = true; $("report-intro").hidden = true;
    $("done-h").textContent = KIND[r.kind].done;
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
    var webhook = hookFor(r.kind), isDiscord = DISCORD_HOOK.test(webhook);
    if (!webhook) { copyText(reportText(r, ref), "Copied"); return; }
    var recent = store.get("sent", []).filter(function (t) { return Date.now() - t < 10 * 60 * 1000; });
    if (recent.length >= 3) { result("warn", "That is three reports in ten minutes. Give it a few minutes, or put the rest into one report."); return; }
    if (Date.now() - opened < 4000) { result("warn", "That was quick. Read it over once and press send again."); opened = 0; return; }

    var fd = new FormData(), text = reportText(r, ref);
    fd.append("payload_json", JSON.stringify(discordBody(r, ref)));
    var nFile = 0;
    if (needsFile(r)) fd.append("files[" + (nFile++) + "]", new Blob([text], { type: "text/plain" }), ref + ".txt");
    if (shot) fd.append("files[" + (nFile++) + "]", shot.blob, shot.name);
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
      sendFailed = true; sendMode();
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

  var DRAFT = ["r-what", "r-why", "r-steps", "r-expected", "r-freq", "r-where", "r-class", "r-error", "r-others", "r-contact"];
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
      if (f && /^image\//.test(f.type)) { e.preventDefault(); takeShot(f); toast("Screenshot added"); }
    });
    $("r-copy").addEventListener("click", function () {
      var r = gather(); if (r.what.length < 12) { $("r-what-err").hidden = false; $("r-what").focus(); return; }
      copyText(reportText(r, makeRef(r.a)), "Copied");
    });
    $("done-again").addEventListener("click", function () {
      $("report-done").hidden = true; form.hidden = false; $("report-intro").hidden = false; $("r-result").hidden = true; store.del("draft");
      ["r-what", "r-why", "r-steps", "r-expected", "r-error"].forEach(function (id) { $(id).value = ""; });
      dropShot(); opened = Date.now(); drawMatches(); $("r-what").focus();
    });

    $("lede-discord").hidden = !canSend;
    sendMode();
    $("r-issue").href = issueLink(gather());
  }
  function openReport(q, want) {
    $("report-done").hidden = true; form.hidden = false; $("report-intro").hidden = false; opened = Date.now(); sendFailed = false;
    if (KIND[q.type]) want = q.type;
    if (want && want !== kind()) form.querySelector('input[name="type"][value="' + want + '"]').checked = true;
    onKind();
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
      el("tbody", null, ADDONS.filter(function (a) { return a.games.length; }).map(function (a) {
        return el("tr", null, [el("th", { scope: "row", text: a.name })].concat(games.map(function (g) {
          var yes = a.games.indexOf(g) !== -1; return el("td", { class: yes ? "yes" : "no", text: yes ? "Yes" : "No" });
        })));
      }))
    ]);
    fill($("help-cmds"), ADDONS.map(function (a) {
      return el("div", null, [el("h3", { text: a.commandsTitle || a.name }), el("dl", null, a.commands.reduce(function (out, c) {
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
    ADDONS.forEach(function (a) {
      links.push(a.curse ? el("a", { href: a.curse, target: "_blank", rel: "noopener", text: a.name + " on CurseForge" })
                         : el("a", { href: "https://github.com/" + USER + "/" + a.repo, target: "_blank", rel: "noopener", text: a.name + " on GitHub" }));
    });
    if (CFG.twitch) links.push(el("a", { href: CFG.twitch, target: "_blank", rel: "noopener", text: "Twitch" }));
    if (CFG.discordInvite) links.push(el("a", { href: CFG.discordInvite, target: "_blank", rel: "noopener", text: "Discord" }));
    fill($("foot-links"), links);
  }

  // ------------------------------------------------------------------ pages
  var VIEWS = { home: "Zac's addons for WoW", changelog: "What changed", report: "Report a problem", suggest: "Suggest a feature", help: "Help" };
  function markNav(name) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-nav]"), function (a) {
      if (a.getAttribute("data-nav") === name) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }
  var first = true;
  function route() {
    var h = location.hash.replace(/^#\/?/, ""), qi = h.indexOf("?");
    var path = (qi === -1 ? h : h.slice(0, qi)).split("/").filter(Boolean).map(decodeURIComponent), q = {};
    if (qi !== -1) h.slice(qi + 1).split("&").forEach(function (p) { var kv = p.split("="); try { q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ""); } catch (e) { /* a broken link: ignore that part */ } });
    var view = VIEWS[path[0]] ? path[0] : "home";
    var shown = view === "suggest" ? "report" : view;   // one form, two doors
    ["home", "changelog", "report", "help"].forEach(function (v) { $("view-" + v).hidden = v !== shown; });
    markNav(view);
    document.title = view === "home" ? VIEWS.home : VIEWS[view] + " - Zac's addons";
    if (view === "changelog") {
      if (byId(path[1]) && path[1] !== log.addon) { log.addon = path[1]; log.all = false; log.types = {}; }
      log.target = path[2] && VERS[log.addon].some(function (v) { return v.v === path[2]; }) ? path[2] : "";
      if (log.target) { log.q = ""; log.types = {}; $("log-q").value = ""; }   // a link to one version shows that version, whatever was being searched
      store.set("log.addon", log.addon);
      drawLogTabs(); drawLogTools(); drawLog();
    }
    if (shown === "report") openReport(q, view === "suggest" ? "idea" : "bug");
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
    startRaid();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
