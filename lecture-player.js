/* CXLP: lecture completion tracking, in-page player, recently watched lectures */
(function () {
  "use strict";
  var DONE = "cx-done", RECENT = "codex-studys-recent-lectures", TOTALS = "cx-batch-totals", MAX = 10;
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12.5 10 17.5 19 7"/></svg>';
  var CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  var FALLBACK = "assets/codex-telegram.png";

  function jget(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function num(k) { try { return Number(localStorage.getItem(k)) || 0; } catch (e) { return 0; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]; }); }
  function key(b, i) { return b + "-" + i; }
  function fmt(s) {
    s = Math.max(0, Math.floor(s || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return [h, m, x].map(function (n) { return String(n).padStart(2, "0"); }).join(":");
  }

  /* ---- completion ---- */
  function isDone(b, i) { return !!jget(DONE, {})[key(b, i)]; }
  function setDone(b, i, on) {
    var d = jget(DONE, {}), k = key(b, i);
    if (on) d[k] = 1; else delete d[k];
    jset(DONE, d);
  }
  function setTotal(b, n) { var t = jget(TOTALS, {}); if (t[b] !== n) { t[b] = n; jset(TOTALS, t); } }
  function doneCount(b, total) {
    var d = jget(DONE, {}), c = 0;
    for (var i = 0; i < total; i++) if (d[key(b, i)]) c++;
    return c;
  }
  function progressHTML(b, total, extra) {
    var c = doneCount(b, total), p = total ? Math.round(c * 100 / total) : 0;
    return '<div class="lp-prog ' + (extra || "") + (p >= 100 ? " full" : "") + '" data-lp-prog="' + esc(b) + '" data-total="' + total + '">' +
      '<div class="lp-prog-top"><span class="lp-prog-txt">' + c + "/" + total + ' lectures done</span><span class="lp-prog-pct">' + p + '%</span></div>' +
      '<div class="lp-bar"><i style="width:' + p + '%"></i></div></div>';
  }
  function cardProgress(b) {
    var total = jget(TOTALS, {})[b];
    return total ? progressHTML(b, total, "lp-prog-card") : "";
  }
  function refresh(root) {
    (root || document).querySelectorAll("[data-lp-prog]").forEach(function (el) {
      var b = el.dataset.lpProg, total = Number(el.dataset.total) || 0, c = doneCount(b, total), p = total ? Math.round(c * 100 / total) : 0;
      el.classList.toggle("full", p >= 100);
      el.querySelector(".lp-prog-txt").textContent = c + "/" + total + " lectures done";
      el.querySelector(".lp-prog-pct").textContent = p + "%";
      el.querySelector(".lp-bar>i").style.width = p + "%";
    });
  }
  function checkBtn(b, i) {
    var on = isDone(b, i);
    return '<button type="button" class="lp-check' + (on ? " done" : "") + '" data-lp-check="' + i + '" aria-pressed="' + on + '" aria-label="Mark lecture complete">' + CHECK + "</button>";
  }
  /* wire check buttons + keyboard inside a lecture list; onOpen(row) opens the lecture */
  function bindRows(root, b, onOpen) {
    root.querySelectorAll(".lp-row[data-lec]").forEach(function (row) {
      var i = Number(row.dataset.lec), btn = row.querySelector(".lp-check");
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var on = !isDone(b, i);
        setDone(b, i, on);
        btn.classList.toggle("done", on); btn.setAttribute("aria-pressed", on);
        row.classList.toggle("done", on);
        row.querySelector(".row-ico").innerHTML = on ? CHECK : row.dataset.ico;
        refresh();
      });
      btn.addEventListener("keydown", function (e) { e.stopPropagation(); });
      row.addEventListener("click", function () { if (!row.classList.contains("disabled")) onOpen(row); });
      row.addEventListener("keydown", function (e) {
        if (e.target !== row) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); row.click(); }
      });
    });
  }

  /* ---- recent lectures ---- */
  function recent() { return jget(RECENT, []); }
  function addRecent(e) {
    var list = recent().filter(function (x) { return !(x.bid === e.bid && x.idx === e.idx); });
    list.unshift(e);
    jset(RECENT, list.slice(0, MAX));
  }
  function clearRecent() { try { localStorage.removeItem(RECENT); } catch (e) {} }
  function pd(e) { return { pos: num("lp:pos:" + key(e.bid, e.idx)), dur: num("lp:dur:" + key(e.bid, e.idx)) }; }

  var expanded = false;
  function renderRecent(section, onChange) {
    if (!section) return;
    var list = recent();
    if (!list.length) { section.style.display = "none"; section.innerHTML = ""; return; }
    section.style.display = "block";
    var shown = expanded && list.length > 1 ? list : list.slice(0, 1);
    section.className = "lp-rc";
    section.innerHTML =
      '<div class="lp-rc-head">' + CLOCK + '<span class="lp-rc-title">Recently Watched</span>' +
      (list.length > 1 ? '<button type="button" class="lp-rc-all" data-rc-all>' + (expanded ? "Show Less" : "View All ›") + "</button>" : "") +
      '<button type="button" class="lp-rc-x" data-rc-clear aria-label="Clear history">✕</button></div>' +
      shown.map(function (e, n) {
        var x = pd(e), done = isDone(e.bid, e.idx) || (x.dur && x.pos >= x.dur - 3);
        var dur = x.dur, pos = done && dur ? dur : Math.min(x.pos, dur || x.pos);
        var pct = dur ? Math.min(100, Math.round(pos * 100 / dur)) : 0;
        if (done && dur) pct = 100;
        return '<button type="button" class="lp-rc-item" data-rc="' + n + '">' +
          '<img class="lp-rc-thumb" src="' + esc(e.thumb || FALLBACK) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'' + FALLBACK + '\'">' +
          '<span class="lp-rc-info"><span class="lp-rc-name">' + esc(e.title) + "</span>" +
          '<span class="lp-rc-meta"><span>' + fmt(pos) + " / " + fmt(dur) + "</span><em>Watched: " + pct + "%</em></span>" +
          '<span class="lp-rc-bar"><i style="width:' + pct + '%"></i></span></span></button>';
      }).join("");
    var all = section.querySelector("[data-rc-all]");
    if (all) all.addEventListener("click", function () { expanded = !expanded; renderRecent(section, onChange); });
    section.querySelector("[data-rc-clear]").addEventListener("click", function () { clearRecent(); expanded = false; renderRecent(section, onChange); if (onChange) onChange(); });
    section.querySelectorAll("[data-rc]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var e = shown[Number(btn.dataset.rc)];
        location.href = "batch.html?id=" + encodeURIComponent(e.bid) + "&lec=" + e.idx;
      });
    });
  }

  /* ---- player ---- */
  var ov = null, hls = null;
  function close() {
    if (!ov) return;
    var v = ov.querySelector("video"); try { v.pause(); } catch (e) {}
    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
    ov.remove(); ov = null; document.body.style.overflow = "";
    document.dispatchEvent(new CustomEvent("cxlp:closed"));
  }
  function loadHls(cb) {
    if (window.Hls) return cb();
    var s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
    s.onload = cb; s.onerror = function () { cb(); };
    document.head.appendChild(s);
  }
  /* info: {bid, idx, title, thumb, url, onEnded} */
  function play(info) {
    close();
    var k = key(info.bid, info.idx);
    ov = document.createElement("div"); ov.className = "lp-ov";
    ov.innerHTML = '<div class="lp-ov-top"><button class="lp-ov-x" type="button" aria-label="Close">✕</button><b>' + esc(info.title) + '</b></div><video controls playsinline autoplay referrerpolicy="no-referrer"></video>';
    document.body.appendChild(ov); document.body.style.overflow = "hidden";
    ov.querySelector(".lp-ov-x").addEventListener("click", close);
    var v = ov.querySelector("video"), lastSave = 0;
    addRecent({ bid: info.bid, idx: info.idx, title: info.title, thumb: info.thumb || "", ts: Date.now() });
    function save(force) {
      var now = Date.now();
      if (!force && now - lastSave < 2000) return;
      lastSave = now;
      if (isFinite(v.duration) && v.duration > 0) { try { localStorage.setItem("lp:dur:" + k, String(v.duration)); } catch (e) {} }
      try { localStorage.setItem("lp:pos:" + k, String(v.currentTime || 0)); } catch (e) {}
    }
    v.addEventListener("loadedmetadata", function () {
      save(true);
      var p = num("lp:pos:" + k), d = v.duration;
      if (p > 5 && (!isFinite(d) || p < d - 5)) { try { v.currentTime = p; } catch (e) {} }
    });
    v.addEventListener("timeupdate", function () { save(false); });
    v.addEventListener("pause", function () { save(true); });
    v.addEventListener("ended", function () {
      try { localStorage.setItem("lp:dur:" + k, String(v.duration)); localStorage.setItem("lp:pos:" + k, String(v.duration)); } catch (e) {}
      setDone(info.bid, info.idx, true);
      if (info.onEnded) info.onEnded();
    });
    window.addEventListener("pagehide", function () { if (ov) save(true); }, { once: true });
    var url = info.url;
    if (/\.m3u8(\?|$)/i.test(url) && !v.canPlayType("application/vnd.apple.mpegurl")) {
      loadHls(function () {
        if (window.Hls && window.Hls.isSupported()) { hls = new window.Hls(); hls.loadSource(url); hls.attachMedia(v); }
        else v.src = url;
      });
    } else v.src = url;
  }

  window.CXLP = { CHECK: CHECK, isDone: isDone, setDone: setDone, setTotal: setTotal, progressHTML: progressHTML, cardProgress: cardProgress, refresh: refresh, checkBtn: checkBtn, bindRows: bindRows, recent: recent, renderRecent: renderRecent, play: play, close: close, fmt: fmt };
})();
