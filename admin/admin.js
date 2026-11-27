// The admin panel (zacaddons.com/admin/). Everything it shows or changes goes through the
// site's own server (/admin/api/...), which checks the sign-in on every call. Nothing secret
// is in this file or kept in the browser: the sign-in is a cookie scripts cannot read.
(function () {
  "use strict";
  if (window.top !== window.self) { document.documentElement.textContent = ""; return; }   // never inside another site's frame

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "text") n.textContent = v;
      else if (k === "on") Object.keys(v).forEach(function (e) { n.addEventListener(e, v[e]); });
      else if (k === "class") n.className = v;
      else n.setAttribute(k, v === true ? "" : v);
    });
    (Array.isArray(kids) ? kids : kids == null ? [] : [kids]).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    });
    return n;
  }
  function fill(box, kids) { box.textContent = ""; (Array.isArray(kids) ? kids : [kids]).forEach(function (k) { if (k) box.appendChild(k); }); }
  function msg(id, text, kind) { var m = $(id); m.textContent = text || ""; m.className = "adm-msg" + (kind ? " " + kind : ""); }
  function ago(t) {
    if (!t) return "";
    var s = Math.round((Date.now() - (typeof t === "number" ? t : Date.parse(t))) / 1000);
    if (s < 60) return "just now";
    var m = Math.round(s / 60); if (m < 60) return m + " min ago";
    var h = Math.round(m / 60); if (h < 36) return h + " h ago";
    var d = Math.round(h / 24); if (d < 60) return d + " days ago";
    return new Date(typeof t === "number" ? t : Date.parse(t)).toLocaleDateString();
  }
  function when(t) { return new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); }
  function n(x) { return Number(x || 0).toLocaleString(); }

  // ------------------------------------------------------------ talking to the server
  function api(path, opt) {
    opt = opt || {};
    var init = { method: opt.method || "GET", credentials: "same-origin", cache: "no-store", headers: {} };
    if (init.method !== "GET") { init.headers["X-Panel"] = "1"; init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opt.body || {}); }
    return fetch("/admin/api/" + path, init).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: "The server answered strangely (" + r.status + ")." }; }).then(function (j) {
        if (r.status === 401 && !opt.quiet) { show("login"); throw new Error("Signed out."); }
        if (!r.ok || !j.ok) throw new Error(j.error || ("Error " + r.status));
        return j;
      });
    }, function () { throw new Error("Could not reach the server. Is the internet on?"); });
  }

  // ------------------------------------------------------------ screens
  var STATE = null;
  function show(which) {
    ["boot", "setup", "login"].forEach(function (s) { $(s).hidden = s !== which; });
    $("app").hidden = which !== "app";
    $("nav").hidden = $("sign-out").hidden = which !== "app";
    if (which === "app") openTab();
  }
  function boot() {
    api("state", { quiet: true }).then(function (s) {
      STATE = s;
      if (s.signedIn) show("app");
      else if (!s.setUp) startSetup(false);
      else show("login");
    }).catch(function (e) { fill($("boot"), el("div", { class: "note note-warn" }, [el("p", { text: "The admin server is not answering: " + e.message }), el("p", { text: "If it was only just set up, the worker or its route may not be in place yet." })])); });
  }

  // first set-up / reset
  var setupCode = "";
  function startSetup(reset) {
    show("setup");
    $("setup-h").textContent = reset ? "Reset the password and app" : "Set up the admin panel";
    $("setup-back").hidden = !reset;
    $("setup-nohook").hidden = !STATE || STATE.discord;
    $("s1-send").hidden = false; $("s1-box").hidden = $("s1-next").hidden = true;
    $("s2").hidden = $("s3").hidden = true; msg("setup-msg", "");
  }
  $("s1-send").addEventListener("click", function () {
    var b = this; b.disabled = true; msg("setup-msg", "Sending…");
    api("code", { method: "POST" }).then(function () {
      msg("setup-msg", "Sent. Look in your Discord reports channel.", "good");
      $("s1-box").hidden = $("s1-next").hidden = false; $("s1-code").focus();
      b.textContent = "Send another code";
    }).catch(function (e) { msg("setup-msg", e.message, "bad"); }).then(function () { b.disabled = false; });
  });
  $("s1-next").addEventListener("click", function () {
    var code = $("s1-code").value.replace(/\D/g, "");
    if (code.length !== 6) { msg("setup-msg", "The code is six digits.", "bad"); return; }
    api("setup/start", { method: "POST", body: { code: code } }).then(function (j) {
      setupCode = code;
      $("s2-key").textContent = j.secret.replace(/(.{4})/g, "$1 ").trim();
      $("s2-link").href = j.uri;
      $("s2").hidden = $("s3").hidden = false; $("s1-next").hidden = true; $("s1-send").hidden = true;
      msg("setup-msg", ""); $("s3-pw").focus();
    }).catch(function (e) { msg("setup-msg", e.message, "bad"); });
  });
  $("s3-done").addEventListener("click", function () {
    var pw = $("s3-pw").value;
    if (pw.length < 12) { msg("setup-msg", "Use at least 12 characters for the password.", "bad"); return; }
    if (pw !== $("s3-pw2").value) { msg("setup-msg", "The two passwords are not the same.", "bad"); return; }
    api("setup/finish", { method: "POST", body: { code: setupCode, password: pw, totp: $("s3-totp").value } }).then(function () {
      $("s3-pw").value = $("s3-pw2").value = $("s3-totp").value = ""; setupCode = "";
      STATE.setUp = true; show("app");
    }).catch(function (e) { msg("setup-msg", e.message, "bad"); });
  });
  $("setup-back").addEventListener("click", function (e) { e.preventDefault(); show("login"); });
  $("to-reset").addEventListener("click", function (e) { e.preventDefault(); startSetup(true); });

  $("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    msg("login-msg", "Checking…");
    api("login", { method: "POST", body: { password: $("l-pw").value, totp: $("l-totp").value }, quiet: true }).then(function () {
      $("l-pw").value = $("l-totp").value = ""; msg("login-msg", ""); show("app");
    }).catch(function (err) { msg("login-msg", err.message, "bad"); $("l-totp").value = ""; });
  });
  $("sign-out").addEventListener("click", function () {
    api("logout", { method: "POST", quiet: true }).catch(function () {}).then(function () { show("login"); });
  });

  // ------------------------------------------------------------ tabs
  var TABS = { overview: drawOverview, inbox: drawInbox, stats: drawStats, releases: drawReleases, site: drawSite, security: drawSecurity };
  function openTab() {
    var t = location.hash.replace(/^#/, "");
    if (!TABS[t]) t = "overview";
    Object.keys(TABS).forEach(function (k) { $("tab-" + k).hidden = k !== t; });
    Array.prototype.forEach.call(document.querySelectorAll("[data-tab]"), function (a) {
      if (a.getAttribute("data-tab") === t) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    TABS[t]();
  }
  window.addEventListener("hashchange", function () { if (!$("app").hidden) openTab(); });
  function chips(groupId, attr, onPick) {
    $(groupId).addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      Array.prototype.forEach.call(this.querySelectorAll("button"), function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      onPick(b.getAttribute(attr));
    });
  }
  function errorBox(box, e) { fill(box, el("p", { class: "adm-msg bad", text: e.message })); }

  // ------------------------------------------------------------ overview
  var KIND = { bug: "Bug", idea: "Idea", question: "Question" };
  var STATUS = { new: "New", open: "Working on it", done: "Done", ignored: "Ignored" };
  function reportRow(r, onPick) {
    return el("li", { "data-id": r.id }, el("button", { type: "button", class: "adm-pick", on: { click: onPick } }, [
      el("strong", null, [r.status === "new" ? el("span", { class: "tag tag-new", text: "new" }) : null, el("span", { class: "tag tag-" + r.kind, text: KIND[r.kind] || r.kind }), r.title || r.what || r.id]),
      el("small", { text: [r.id, ago(r.created), r.status !== "new" ? STATUS[r.status] : ""].filter(Boolean).join("  ·  ") })
    ]));
  }
  function drawOverview() {
    api("overview").then(function (j) {
      var c = {}; (j.counts || []).forEach(function (x) { c[x.status] = x.n; });
      var views = 0, visitors = 0, dls = 0;
      (j.week || []).forEach(function (d) { views += d.views; visitors += d.visitors; dls += d.downloads; });
      setNew(c.new || 0);
      fill($("ov-cards"), [
        el("a", { class: "adm-card" + (c.new ? " warn" : ""), href: "#inbox" }, [el("b", { text: n(c.new) }), el("span", { text: "new in the inbox" })]),
        el("a", { class: "adm-card", href: "#inbox" }, [el("b", { text: n(c.open) }), el("span", { text: "being worked on" })]),
        el("a", { class: "adm-card", href: "#stats" }, [el("b", { text: n(visitors) }), el("span", { text: "visitors this week" })]),
        el("a", { class: "adm-card", href: "#stats" }, [el("b", { text: n(views) }), el("span", { text: "pages viewed this week" })]),
        el("a", { class: "adm-card", href: "#stats" }, [el("b", { text: n(dls) }), el("span", { text: "download clicks this week" })])
      ]);
      var warn = [], s = j.secrets || {};
      if (!s.discord) warn.push("The Discord webhook is not set on the server: reports are kept here but do not reach Discord.");
      if (!s.github) warn.push("The GitHub token is not set on the server: Releases is limited, and making issues and editing the site do not work yet.");
      if (!s.files) warn.push("The picture store (FILES) is not connected: screenshots in reports are not kept here.");
      fill($("ov-warn"), warn.length ? el("div", { class: "note note-warn" }, warn.map(function (w) { return el("p", { text: w }); })) : null);
      fill($("ov-latest"), (j.latest || []).length ? j.latest.map(function (r) { return reportRow(r, function () { location.hash = "inbox"; pickAfter = r.id; }); }) : el("li", { class: "empty", text: "Nothing yet." }));
    }).catch(function (e) { errorBox($("ov-cards"), e); });
    loadReleases().then(function (j) {
      var off = j.addons.filter(function (a) { return a.problems.length; });
      fill($("ov-rel"), off.length
        ? el("div", { class: "note note-warn" }, off.map(function (a) { return el("p", null, [el("strong", { text: a.name + ": " }), a.problems.join(" ")]); }))
        : el("p", { class: "hint", text: "All " + j.addons.length + " look right: " + j.addons.map(function (a) { return a.name + " " + ((a.release && a.release.tag) || a.main || "?"); }).join(", ") + "." }));
    }).catch(function (e) { errorBox($("ov-rel"), e); });
  }
  function setNew(k) { var b = $("nav-new"); b.textContent = k; b.hidden = !k; }

  // ------------------------------------------------------------ inbox
  var inbox = { status: "new", q: "", pick: "" }, pickAfter = "";
  chips("in-status", "data-s", function (s) { inbox.status = s; loadInbox(); });
  var qTimer;
  $("in-q").addEventListener("input", function () { clearTimeout(qTimer); qTimer = setTimeout(function () { inbox.q = $("in-q").value.trim(); loadInbox(); }, 250); });
  function drawInbox() {
    if (pickAfter) {   // came from the overview: show everything so the one picked is in the list
      inbox.status = ""; Array.prototype.forEach.call($("in-status").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-s") === "" ? "true" : "false"); });
    }
    loadInbox();
  }
  function loadInbox() {
    var qs = "?status=" + encodeURIComponent(inbox.status) + "&q=" + encodeURIComponent(inbox.q);
    api("reports" + qs).then(function (j) {
      var list = j.reports || [];
      fill($("in-list"), list.length ? list.map(function (r) { return reportRow(r, function () { openReport(r.id); }); })
        : el("li", { class: "empty", text: inbox.status === "new" ? "Nothing new. All caught up." : "Nothing here." }));
      var want = pickAfter || inbox.pick; pickAfter = "";
      if (want && list.some(function (r) { return r.id === want; })) openReport(want);
      else fill($("in-detail"), list.length ? el("p", { class: "hint", text: "Pick one on the left." }) : null);
    }).catch(function (e) { errorBox($("in-list"), e); });
  }
  var REPOS = [["zacui", "ZacUI"], ["readycheck", "Readycheck"], ["defaultframes", "DefaultFrames"], ["stacked", "Stacked Raid Groups"], ["wowtiler", "WowTiler"], ["multilauncher", "MultiLauncher"]];
  function openReport(id) {
    inbox.pick = id;
    Array.prototype.forEach.call($("in-list").children, function (li) { li.classList.toggle("on", li.getAttribute("data-id") === id); });
    api("reports/" + encodeURIComponent(id)).then(function (j) {
      var r = j.report, box = $("in-detail"), fields = [];
      try { fields = JSON.parse(r.fields || "[]"); } catch (e) { fields = []; }
      var note = el("textarea", { rows: 3, placeholder: "Notes for yourself" }); note.value = r.note || "";
      var statusBtns = Object.keys(STATUS).map(function (s) {
        return el("button", { type: "button", class: "btn" + (r.status === s ? " btn-go" : ""), text: STATUS[s], on: { click: function () { save({ status: s }); } } });
      });
      function save(change) {
        api("reports/" + encodeURIComponent(id), { method: "POST", body: change }).then(function () {
          if (change.status && change.status !== r.status && inbox.status && change.status !== inbox.status) { inbox.pick = ""; loadInbox(); }
          else openReport(id);
          if (change.status) api("overview").then(function (o) { var c = 0; o.counts.forEach(function (x) { if (x.status === "new") c = x.n; }); setNew(c); }).catch(function () {});
        }).catch(function (e) { msg("rep-msg", e.message, "bad"); });
      }
      var issueRepo = el("select", null, REPOS.map(function (x) { return el("option", { value: x[0], text: x[1], selected: x[0] === r.addon ? "selected" : null }); }));
      var asKnown = el("input", { type: "checkbox" });
      var del = el("button", { type: "button", class: "btn btn-bad", text: "Delete", on: { click: function () {
        if (del.dataset.sure !== "1") { del.dataset.sure = "1"; del.textContent = "Press again to delete it for good"; return; }
        api("reports/" + encodeURIComponent(id), { method: "DELETE" }).then(function () { inbox.pick = ""; loadInbox(); }).catch(function (e) { msg("rep-msg", e.message, "bad"); });
      } } });
      fill(box, [
        el("h2", null, [el("span", { class: "tag tag-" + r.kind, text: KIND[r.kind] || r.kind }), r.title || r.id]),
        el("dl", { class: "adm-facts" }, [].concat(
          [el("dt", { text: "Reference" }), el("dd", { text: r.id })],
          [el("dt", { text: "Sent" }), el("dd", { text: when(r.created) + (r.country ? "  ·  from " + r.country : "") })],
          r.contact ? [el("dt", { text: "Discord" }), el("dd", { text: r.contact })] : [],
          [el("dt", { text: "Reached Discord" }), el("dd", { text: r.discord ? "yes" : "no" })]
        )),
        el("p", { class: "what", text: r.what || "" }),
        fields.length ? el("dl", { class: "adm-facts" }, [].concat.apply([], fields.map(function (f) { return [el("dt", { text: f.name }), el("dd", { text: String(f.value || "").replace(/^```\n?|\n?```$/g, "") })]; }))) : null,
        r.shot ? el("a", { href: "/admin/api/reports/" + encodeURIComponent(r.id) + "/shot", target: "_blank", rel: "noopener" }, el("img", { src: "/admin/api/reports/" + encodeURIComponent(r.id) + "/shot", alt: "The screenshot sent with it", loading: "lazy" })) : null,
        r.text ? el("details", null, [el("summary", { text: "The full report as text" }), el("pre", { text: r.text })]) : null,
        el("div", { class: "adm-acts" }, statusBtns),
        note,
        el("div", { class: "adm-acts" }, [el("button", { type: "button", class: "btn", text: "Save note", on: { click: function () { save({ note: note.value }); } } })]),
        r.issue
          ? el("p", null, ["On GitHub: ", el("a", { href: r.issue, target: "_blank", rel: "noopener", text: r.issue.replace(/^https:\/\/github\.com\//, "") })])
          : el("div", { class: "adm-fs" }, [
              el("p", { class: "hint", text: r.kind === "idea" ? "Make it a GitHub issue labelled idea and it shows on the site's Suggestions list." : "Make it a GitHub issue to track it. Tick the box and it shows on the site as a known problem, so people stop sending it." }),
              el("div", { class: "adm-acts" }, [issueRepo, r.kind !== "idea" ? el("label", { class: "check" }, [asKnown, el("span", { text: "Show as a known problem" })]) : null,
                el("button", { type: "button", class: "btn", text: "Make a GitHub issue", on: { click: function () {
                  var labels = r.kind === "idea" ? ["idea"] : ["bug"]; if (asKnown.checked) labels.push("known");
                  var body = (r.what || "") + "\n\n" + fields.map(function (f) { return "**" + f.name + ":** " + f.value; }).join("\n") + "\n\nFrom the site, reference " + r.id + ".";
                  msg("rep-msg", "Asking GitHub…");
                  api("reports/" + encodeURIComponent(id) + "/issue", { method: "POST", body: { addon: issueRepo.value, labels: labels, title: String(r.what || r.title || r.id).split("\n")[0].slice(0, 100), body: body } })
                    .then(function () { openReport(id); }).catch(function (e) { msg("rep-msg", e.message, "bad"); });
                } } })])
            ]),
        el("div", { class: "adm-acts" }, [del]),
        el("p", { class: "adm-msg", id: "rep-msg" })
      ]);
    }).catch(function (e) { errorBox($("in-detail"), e); });
  }

  // ------------------------------------------------------------ stats
  var statDays = 30;
  chips("st-days", "data-d", function (d) { statDays = Number(d); drawStats(); });
  function drawStats() {
    api("stats?days=" + statDays).then(function (j) {
      var v = 0, u = 0, d = 0;
      j.days.forEach(function (x) { v += x.views; u += x.visitors; d += x.downloads; });
      var sent = {}; (j.reports || []).forEach(function (x) { sent[x.kind] = x.n; });
      fill($("st-cards"), [
        el("div", { class: "adm-card" }, [el("b", { text: n(u) }), el("span", { text: "visitors (counted once a day)" })]),
        el("div", { class: "adm-card" }, [el("b", { text: n(v) }), el("span", { text: "pages viewed" })]),
        el("div", { class: "adm-card" }, [el("b", { text: n(d) }), el("span", { text: "download clicks" })]),
        el("div", { class: "adm-card" }, [el("b", { text: n(sent.bug) }), el("span", { text: "bug reports" })]),
        el("div", { class: "adm-card" }, [el("b", { text: n(sent.idea) }), el("span", { text: "suggestions" })])
      ]);
      fill($("st-chart"), chart(j.days));
      var NAMES = { "/#/": "Addons (front page)", "/#/changelog": "What changed", "/#/report": "Report a problem", "/#/suggest": "Suggestions", "/#/help": "Help" };
      function table(cap, rows, label) {
        return el("table", null, [el("caption", { text: cap }), el("tbody", null, rows.length ? rows.map(function (r) { return el("tr", null, [el("td", { text: label ? label(r[0]) : r[0] }), el("td", { text: n(r[1]) })]); }) : el("tr", null, el("td", { class: "hint", text: "Nothing yet." })))]);
      }
      fill($("st-tables"), [
        table("Pages", j.pages, function (p) { return NAMES[p] || p; }),
        table("Came from", j.from),
        table("Countries", j.countries),
        table("Download clicks", j.downloads, function (k) { var p = k.split(":"); return (REPOS.filter(function (x) { return x[0] === p[0]; })[0] || [0, p[0]])[1] + (p[1] ? " (" + p[1] + ")" : ""); })
      ]);
    }).catch(function (e) { errorBox($("st-cards"), e); });
  }
  function chart(days) {
    var W = 720, H = 200, pad = 28, max = 1;
    days.forEach(function (d) { max = Math.max(max, d.views, d.visitors); });
    var bw = (W - pad) / days.length, ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + (H + 22)); svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Pages viewed and visitors per day");
    function add(tag, a, text) { var e = document.createElementNS(ns, tag); Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); }); if (text != null) e.textContent = text; svg.appendChild(e); return e; }
    [0, 0.5, 1].forEach(function (f) {
      var y = H - f * (H - 10);
      add("line", { x1: pad, x2: W, y1: y, y2: y, stroke: "rgba(255,255,255,0.08)" });
      add("text", { x: pad - 4, y: y + 4, "text-anchor": "end", fill: "#737373", "font-size": 11 }, String(Math.round(max * f)));
    });
    days.forEach(function (d, i) {
      var x = pad + i * bw, hv = (d.views / max) * (H - 10), hu = (d.visitors / max) * (H - 10);
      var t = add("rect", { x: x + bw * 0.12, y: H - hv, width: Math.max(1, bw * 0.42), height: hv, fill: "#d9a640" });
      add("rect", { x: x + bw * 0.5, y: H - hu, width: Math.max(1, bw * 0.38), height: hu, fill: "#80cc80" });
      var tip = document.createElementNS(ns, "title"); tip.textContent = d.day + ": " + d.views + " pages, " + d.visitors + " visitors, " + d.downloads + " download clicks"; t.appendChild(tip);
      if (days.length <= 31 ? i % Math.ceil(days.length / 8) === 0 : i % 30 === 0) add("text", { x: x + bw / 2, y: H + 16, "text-anchor": "middle", fill: "#737373", "font-size": 11 }, d.day.slice(5));
    });
    return [svg, el("figcaption", null, [el("span", { class: "k1", text: "Pages viewed" }), el("span", { class: "k2", text: "Visitors" })])];
  }

  // ------------------------------------------------------------ releases
  var relCache = null;
  function loadReleases(force) {
    if (relCache && !force && Date.now() - relCache.t < 120000) return Promise.resolve(relCache.j);
    return api("releases").then(function (j) { relCache = { t: Date.now(), j: j }; return j; });
  }
  $("rel-reload").addEventListener("click", function () { fill($("rel-box"), el("p", { class: "hint", text: "Asking GitHub…" })); loadReleases(true).then(drawRel).catch(function (e) { errorBox($("rel-box"), e); }); });
  function drawReleases() { loadReleases().then(drawRel).catch(function (e) { errorBox($("rel-box"), e); }); }
  function drawRel(j) {
    var gh = "https://github.com/Zac175/";
    fill($("rel-box"), [
      j.token ? null : el("div", { class: "note note-warn" }, el("p", { text: "No GitHub token on the server yet: GitHub allows only a few questions an hour without one, so some rows may be empty." })),
      el("div", { class: "adm-rel" }, j.addons.map(function (a) {
        var rel = a.release;
        return el("div", { class: "adm-rel-row " + (a.problems.length ? "off" : "ok") }, [
          el("h3", { text: a.name }),
          el("div", { class: "facts" }, [
            a.main ? el("span", null, ["On main: ", el("b", { text: a.main })]) : null,
            rel ? el("span", null, ["Newest release: ", el("b", { text: rel.tag }), " (" + ago(rel.date) + ")"]) : null,
            a.snapshot ? el("span", null, ["Site history: ", el("b", { text: a.snapshot })]) : null,
            a.run ? el("span", null, ["Last run: ", el("b", { text: a.run.conclusion || a.run.status }), " (" + ago(a.run.date) + ")"]) : null,
            a.downloads != null ? el("span", null, ["GitHub downloads: ", el("b", { text: n(a.downloads) })]) : null,
            a.issues != null ? el("span", null, ["Open issues: ", el("b", { text: n(a.issues) }), a.ideas ? " (" + a.ideas + " ideas)" : "", a.known ? " (" + a.known + " known problems)" : ""]) : null
          ]),
          a.problems.length ? el("ul", null, a.problems.map(function (p) { return el("li", { text: p }); })) : null,
          el("p", { class: "adm-links" }, [
            el("a", { href: gh + a.repo, target: "_blank", rel: "noopener", text: "Repository" }),
            el("a", { href: gh + a.repo + "/actions", target: "_blank", rel: "noopener", text: "Release runs" }),
            el("a", { href: gh + a.repo + "/issues", target: "_blank", rel: "noopener", text: "Issues" }),
            a.curse ? el("a", { href: a.curse, target: "_blank", rel: "noopener", text: "CurseForge" }) : null,
            el("a", { href: "/#/changelog/" + a.id, target: "_blank", rel: "noopener", text: "On the site" })
          ])
        ]);
      }))
    ]);
  }

  // ------------------------------------------------------------ site: front page and notice
  var sitePane = "front";
  chips("site-sub", "data-p", function (p) { sitePane = p; drawSite(); });
  function drawSite() {
    ["front", "addons", "files"].forEach(function (p) { $("site-" + p).hidden = p !== sitePane; });
    if (sitePane === "front") loadFront();
    if (sitePane === "addons") loadAddons();
    if (sitePane === "files") loadFiles();
  }
  var front = null;
  function loadFront() {
    msg("front-msg", "Reading data/site.json…");
    api("file?path=" + encodeURIComponent("data/site.json")).then(function (j) {
      var d = {}; try { d = j.content ? JSON.parse(j.content) : {}; } catch (e) { d = {}; }
      front = { sha: j.sha };
      var nt = d.notice || {};
      $("f-headline").value = d.headline || ""; $("f-lede").value = d.lede || "";
      $("f-notice").value = nt.text || ""; $("f-kind").value = nt.kind === "warn" ? "warn" : "info";
      $("f-until").value = nt.until ? String(nt.until).slice(0, 10) : ""; $("f-link").value = nt.link || ""; $("f-linktext").value = nt.linkText || "";
      msg("front-msg", "");
    }).catch(function (e) { msg("front-msg", e.message, "bad"); });
  }
  $("front-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!front) return;
    var d = {};
    if ($("f-headline").value.trim()) d.headline = $("f-headline").value.trim();
    if ($("f-lede").value.trim()) d.lede = $("f-lede").value.trim();
    if ($("f-notice").value.trim()) {
      d.notice = { text: $("f-notice").value.trim(), kind: $("f-kind").value };
      if ($("f-until").value) d.notice.until = $("f-until").value + "T23:59:59";
      var link = $("f-link").value.trim();
      if (link) { if (!/^(https:\/\/|#\/)/.test(link)) { msg("front-msg", "A link starts with https:// or #/.", "bad"); return; } d.notice.link = link; d.notice.linkText = $("f-linktext").value.trim() || "Read more"; }
    }
    msg("front-msg", "Saving…");
    api("file", { method: "PUT", body: { path: "data/site.json", content: JSON.stringify(d, null, 2) + "\n", sha: front.sha, message: "Admin panel: front page and notice" } }).then(function (j) {
      front.sha = j.sha; msg("front-msg", "Saved. The site shows it in about a minute.", "good");
    }).catch(function (err) { msg("front-msg", err.message, "bad"); });
  });

  // ------------------------------------------------------------ site: the addons list (data/addons.js)
  var addonsFile = null, addonsPick = 0;
  // data/addons.js is a JavaScript list, not JSON: unquoted names, trailing commas, comments.
  // This page may not run code it fetches, so the list is read with a small reader of its own.
  function literal(src) {
    var out = "", i = 0, c;
    while (i < src.length) {
      c = src[i];
      if (c === '"' || c === "'") {                                   // a string: copy it as JSON
        var q = c, s = ""; i++;
        while (i < src.length && src[i] !== q) { if (src[i] === "\\") { s += src[i] + src[i + 1]; i += 2; } else s += src[i++]; }
        i++;
        out += q === '"' ? '"' + s + '"' : JSON.stringify(s.replace(/\\'/g, "'"));
      } else if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; }
      else if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2); i = i < 0 ? src.length : i + 2; }
      else if (/[A-Za-z_$]/.test(c)) {                               // a bare word: a name, true, false or null
        var w = ""; while (i < src.length && /[\w$]/.test(src[i])) w += src[i++];
        out += /^(true|false|null)$/.test(w) ? w : '"' + w + '"';
      } else if (c === ",") {                                         // drop a comma before ] or }
        var j = i + 1; while (j < src.length && /\s/.test(src[j])) j++;
        if (src[j] !== "]" && src[j] !== "}") out += c; i++;
      } else { out += c; i++; }
    }
    return JSON.parse(out);
  }
  function readAddons(src) {
    var at = src.indexOf("window.ZAC_ADDONS");
    if (at < 0) throw new Error("no list");
    var start = src.indexOf("[", at), end = src.lastIndexOf("]");
    return { head: src.slice(0, at), list: literal(src.slice(start, end + 1)) };
  }
  function js(v, ind) {   // write the list back in the file's own style
    ind = ind || "";
    var next = ind + "  ";
    if (Array.isArray(v)) {
      if (!v.length) return "[]";
      if (v.every(function (x) { return typeof x !== "object" || x === null; })) return "[" + v.map(function (x) { return js(x); }).join(", ") + "]";
      return "[\n" + v.map(function (x) { return next + js(x, next) + ","; }).join("\n") + "\n" + ind + "]";
    }
    if (v && typeof v === "object") {
      return "{\n" + Object.keys(v).map(function (k) { return next + (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)) + ": " + js(v[k], next) + ","; }).join("\n") + "\n" + ind + "}";
    }
    return JSON.stringify(v);
  }
  function loadAddons() {
    msg("ad-msg", "Reading data/addons.js…");
    api("file?path=" + encodeURIComponent("data/addons.js")).then(function (j) {
      var parsed = readAddons(j.content);
      addonsFile = { sha: j.sha, head: parsed.head, list: parsed.list };
      msg("ad-msg", ""); drawAddonList(); drawAddonForm();
    }).catch(function (e) { msg("ad-msg", "Could not read the addons list: " + e.message, "bad"); });
  }
  function drawAddonList() {
    fill($("ad-list"), addonsFile.list.map(function (a, i) {
      return el("li", { class: i === addonsPick ? "on" : null }, el("button", { type: "button", class: "adm-pick", on: { click: function () { addonsPick = i; drawAddonList(); drawAddonForm(); } } }, [el("strong", { text: a.name }), el("small", { text: a.kind === "app" ? "Windows program" : (a.games || []).join(", ") })]));
    }));
  }
  var FIELDS = [
    ["name", "Name", "text"], ["line", "One line about it", "area"], ["curse", "CurseForge page", "text"], ["repo", "GitHub repository", "text"],
    ["version", "Where players find their version", "area"], ["errorHint", "What to paste into a report (programs)", "area"]
  ];
  var GAMES = [["era", "Classic Era"], ["tbc", "Burning Crusade Anniversary"], ["forever", "WoW Forever"], ["retail", "Retail"]];
  function drawAddonForm() {
    var a = addonsFile.list[addonsPick], f = $("ad-form");
    if (!a) { fill(f, el("p", { class: "hint", text: "Pick an addon." })); return; }
    var inputs = {};
    var kids = [el("h2", { text: a.name })];
    FIELDS.forEach(function (fd) {
      if (fd[0] === "errorHint" && a.kind !== "app") return;
      if (fd[0] === "curse" && a.kind === "app") return;
      var inp = fd[2] === "area" ? el("textarea", { rows: 2 }) : el("input", { type: "text" });
      inp.value = a[fd[0]] || ""; inputs[fd[0]] = inp;
      kids.push(el("label", { class: "block" }, [el("span", { text: fd[1] }), inp]));
    });
    var games = {};
    if (a.kind !== "app") kids.push(el("fieldset", { class: "adm-fs" }, [el("legend", { text: "Runs on" })].concat(GAMES.map(function (g) {
      var c = el("input", { type: "checkbox" }); c.checked = (a.games || []).indexOf(g[0]) >= 0; games[g[0]] = c;
      return el("label", { class: "check" }, [c, el("span", { text: g[1] })]);
    }))));
    function rows(title, list, a1, a2) {
      var box = el("div", { class: "adm-cmds" });
      function add(x, y) {
        var r = el("div", { class: "adm-cmd" }); var i1 = el("input", { type: "text", placeholder: a1 }), i2 = el("input", { type: "text", placeholder: a2 });
        i1.value = x || ""; i2.value = y || "";
        r.appendChild(i1); r.appendChild(i2);
        r.appendChild(el("button", { type: "button", class: "btn", text: "Remove", on: { click: function () { r.remove(); } } }));
        box.appendChild(r);
      }
      (list || []).forEach(function (c) { add(c[0], c[1]); });
      return { node: el("fieldset", { class: "adm-fs" }, [el("legend", { text: title }), box, el("button", { type: "button", class: "btn", text: "Add a row", on: { click: function () { add("", ""); } } })]),
        read: function () { return Array.prototype.map.call(box.children, function (r) { var i = r.querySelectorAll("input"); return [i[0].value.trim(), i[1].value.trim()]; }).filter(function (x) { return x[0] && x[1]; }); } };
    }
    var cmds = rows("Commands on the Help page", a.commands, "/command", "What it does");
    var links = rows("Extra links on its row", a.links, "Link text", "https://...");
    kids.push(cmds.node, links.node);
    kids.push(el("div", { class: "adm-acts" }, [el("button", { type: "submit", class: "btn btn-go", text: "Save to the site" })]));
    fill(f, kids);
    f.onsubmit = function (e) {
      e.preventDefault();
      var copy = JSON.parse(JSON.stringify(addonsFile.list)), b = copy[addonsPick];
      Object.keys(inputs).forEach(function (k) { var v = inputs[k].value.trim(); if (v) b[k] = v; else delete b[k]; });
      if (!b.name) { msg("ad-msg", "It needs a name.", "bad"); return; }
      if (a.kind !== "app") { b.games = GAMES.map(function (g) { return g[0]; }).filter(function (g) { return games[g].checked; }); if (!b.games.length) { msg("ad-msg", "Tick at least one game version.", "bad"); return; } }
      var c = cmds.read(); if (c.length) b.commands = c; else delete b.commands;
      var l = links.read();
      if (l.some(function (x) { return !/^https:\/\//.test(x[1]); })) { msg("ad-msg", "Links start with https://.", "bad"); return; }
      if (l.length) b.links = l; else delete b.links;
      var src = addonsFile.head + "window.ZAC_ADDONS = " + js(copy) + ";\n";
      try { if (readAddons(src).list.length !== copy.length) throw new Error("check"); } catch (err) { msg("ad-msg", "That would break the file; nothing was saved.", "bad"); return; }
      msg("ad-msg", "Saving…");
      api("file", { method: "PUT", body: { path: "data/addons.js", content: src, sha: addonsFile.sha, message: "Admin panel: " + b.name + " on the addons list" } }).then(function (j) {
        addonsFile.sha = j.sha; addonsFile.list = copy; drawAddonList();
        msg("ad-msg", "Saved. The site shows it in about a minute.", "good");
      }).catch(function (err) { msg("ad-msg", err.message, "bad"); });
    };
  }

  // ------------------------------------------------------------ site: any file
  function loadFiles() {
    api("files").then(function (j) {
      fill($("fi-list"), j.files.map(function (f) {
        return el("li", null, el("button", { type: "button", class: "adm-pick", on: { click: function () { openFile(f.path, this.parentNode); } } }, [el("strong", { text: f.path }), el("small", { text: Math.max(1, Math.round(f.size / 1024)) + " KB" })]));
      }));
    }).catch(function (e) { errorBox($("fi-list"), e); });
  }
  function openFile(path, li) {
    Array.prototype.forEach.call($("fi-list").children, function (x) { x.classList.toggle("on", x === li); });
    var box = $("fi-edit");
    fill(box, el("p", { class: "hint", text: "Reading " + path + "…" }));
    api("file?path=" + encodeURIComponent(path)).then(function (j) {
      var ta = el("textarea", { class: "adm-code", spellcheck: "false" }); ta.value = j.content;
      var note = el("input", { type: "text", placeholder: "What you changed (for the history)" });
      var sha = j.sha, start = j.content;
      var warn = path === "CNAME" ? "This file keeps the site on zacaddons.com. Changing it takes the site off the address."
        : /^admin\//.test(path) ? "This is the admin panel itself. A mistake here can lock the panel; GitHub Desktop can still fix it."
        : path === "config.js" ? "Once the site's own server sends reports, the webhook address in here is not needed any more: empty it so it is not public."
        : "";
      fill(box, [
        el("h2", { text: path }),
        warn ? el("div", { class: "note note-warn" }, el("p", { text: warn })) : null,
        ta, note,
        el("div", { class: "adm-acts" }, [el("button", { type: "button", class: "btn btn-go", text: "Save to the site", on: { click: function () {
          if (ta.value === start) { msg("fi-msg", "Nothing changed."); return; }
          msg("fi-msg", "Saving…");
          api("file", { method: "PUT", body: { path: path, content: ta.value, sha: sha, message: "Admin panel: " + (note.value.trim() || "edit " + path) } }).then(function (r) {
            sha = r.sha; start = ta.value; msg("fi-msg", "Saved. The site shows it in about a minute.", "good");
          }).catch(function (e) { msg("fi-msg", e.message, "bad"); });
        } } }), el("a", { href: "https://github.com/Zac175/Zac175.github.io/commits/main/" + path, target: "_blank", rel: "noopener", text: "Its history on GitHub" })]),
        el("p", { class: "adm-msg", id: "fi-msg" })
      ]);
    }).catch(function (e) { errorBox(box, e); });
  }

  // ------------------------------------------------------------ security
  function drawSecurity() {
    api("security").then(function (j) {
      fill($("sec-sessions"), j.sessions.map(function (s) {
        var dev = /iPhone|Android|Mobile/.test(s.agent || "") ? "Phone" : /Windows/.test(s.agent || "") ? "Windows PC" : /Mac/.test(s.agent || "") ? "Mac" : "A browser";
        return el("li", null, [el("strong", { text: dev + (s.current ? " (this one)" : "") }), el("br"), el("small", { text: "Signed in " + ago(s.created) + ", last seen " + ago(s.seen) + (s.country ? ", " + s.country : "") })]);
      }));
      fill($("sec-log"), j.log.length ? j.log.map(function (l) {
        return el("li", null, [el("small", { text: when(l.ts) }), el("span", { class: l.ok ? "" : "bad", text: l.what }), el("small", { text: (l.country || "") + (l.iph ? "  ·  " + l.iph : "") })]);
      }) : el("li", { class: "empty", text: "Nothing yet." }));
    }).catch(function (e) { errorBox($("sec-log"), e); });
    api("state").then(function (s) {
      fill($("sec-secrets"), [
        ["Discord webhook (DISCORD_WEBHOOK)", s.discord, "Reports reach Discord, and set-up codes can be sent."],
        ["GitHub token (GITHUB_TOKEN)", s.github, "Lets this panel edit the site, make issues and read release details."],
        ["Picture store (FILES)", s.files, "Keeps the screenshots sent with reports."]
      ].map(function (x) { return el("li", null, [el("strong", { text: (x[1] ? "Set: " : "Missing: ") + x[0] }), el("br"), el("small", { text: x[2] })]); }));
    }).catch(function () {});
  }
  $("sec-all").addEventListener("click", function () {
    var b = this;
    if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Press again: every device, this one too"; return; }
    api("logout-all", { method: "POST" }).then(function () { show("login"); }).catch(function (e) { alertBad(e); });
  });
  function alertBad(e) { msg("pw-msg", e.message, "bad"); }
  $("pw-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if ($("pw-new").value !== $("pw-new2").value) { msg("pw-msg", "The two new passwords are not the same.", "bad"); return; }
    api("password", { method: "POST", body: { password: $("pw-old").value, newPassword: $("pw-new").value } }).then(function () {
      $("pw-old").value = $("pw-new").value = $("pw-new2").value = ""; msg("pw-msg", "Changed.", "good");
    }).catch(alertBad);
  });
  $("sec-test").addEventListener("click", function () {
    msg("sec-test-msg", "Sending…");
    api("test-discord", { method: "POST" }).then(function () { msg("sec-test-msg", "Sent. Look in Discord.", "good"); }).catch(function (e) { msg("sec-test-msg", e.message, "bad"); });
  });

  boot();
})();
