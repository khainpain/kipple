// Kipple landing: download hints, scroll reveals and the hero's "tame the pile" animation.
// Without script, or with reduced motion, the hero is simply the tidy board.
(function () {
  var win = /Windows/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.userAgent);
  document.querySelectorAll("[data-download]").forEach(function (a) {
    var id = a.getAttribute("data-download");
    if (!win) document.querySelector('[data-notwin="' + id + '"]').hidden = false;
    a.addEventListener("click", function () {
      document.querySelector('[data-started="' + id + '"]').hidden = false;
    });
  });

  // The language menu closes on a click outside it or on Escape.
  var langs = document.querySelector(".langs");
  if (langs) {
    document.addEventListener("click", function (e) {
      if (langs.open && !langs.contains(e.target)) langs.open = false;
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && langs.open) {
        langs.open = false;
        langs.querySelector("summary").focus();
      }
    });
  }

  // "What's new": the dot goes away once this version's notes were opened.
  var news = document.querySelector(".news");
  if (news) {
    var KEY = "kipple.news.seen";
    var ver = news.getAttribute("data-ver");
    try {
      if (localStorage.getItem(KEY) === ver) news.classList.add("seen");
    } catch (e) {}
    news.addEventListener("toggle", function () {
      if (!news.open) return;
      news.classList.add("seen");
      try {
        localStorage.setItem(KEY, ver);
      } catch (e) {}
    });
    news.querySelector(".news-x").addEventListener("click", function () {
      news.open = false;
      news.querySelector("summary").focus();
    });
    document.addEventListener("click", function (e) {
      if (news.open && !news.contains(e.target)) news.open = false;
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && news.open) news.open = false;
    });
  }

  var root = document.documentElement;
  if (!root.classList.contains("motion") || !Element.prototype.animate) return;

  // Sections rise in as they scroll into view.
  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    },
    { rootMargin: "0px 0px -10% 0px" },
  );
  document.querySelectorAll(".reveal").forEach(function (el) {
    io.observe(el);
  });

  // Kipple's easter eggs, as in the app (src/lib/mascot.ts): quick clicks in a row make it flip
  // on the 7th and sulk on the 13th; a pause longer than 1.5 s starts the count again.
  // Every click throws a few sparks (the app's ClickSpark: 8 sparks, radius 36, 550 ms).
  var accent = getComputedStyle(root).getPropertyValue("--accent").trim() || "#d9573b";
  function spark(x, y) {
    var R = 36, S = 10, size = (R + S) * 2, dpr = window.devicePixelRatio || 1;
    var c = document.createElement("canvas");
    c.className = "spark";
    c.width = c.height = size * dpr;
    c.style.cssText = "width:" + size + "px;height:" + size + "px;left:" + (x - size / 2) + "px;top:" + (y - size / 2) + "px";
    document.body.appendChild(c);
    var ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    var t0 = performance.now();
    (function frame(now) {
      var t = Math.min(1, (now - t0) / 550), e = 1 - Math.pow(1 - t, 3), len = S * (1 - e);
      ctx.clearRect(0, 0, size, size);
      for (var i = 0; i < 8; i++) {
        var a = (i * Math.PI) / 4, d = e * R, cx = size / 2, cy = size / 2;
        ctx.strokeStyle = i % 2 ? "#f2a58f" : accent;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
        ctx.lineTo(cx + Math.cos(a) * (d + len), cy + Math.sin(a) * (d + len));
        ctx.stroke();
      }
      if (t < 1) requestAnimationFrame(frame);
      else c.remove();
    })(t0);
  }
  document.querySelectorAll(".kp").forEach(function (kp) {
    var body = kp.querySelector(".kp-body");
    var count = 0, last = -Infinity, angryUntil = -Infinity, timer;
    kp.addEventListener("click", function (ev) {
      spark(ev.clientX, ev.clientY);
      var now = Date.now();
      if (now < angryUntil) return;
      count = now - last > 1500 ? 1 : count + 1;
      last = now;
      if (count >= 13) {
        clearTimeout(timer);
        count = 0;
        angryUntil = now + 2600;
        body.classList.remove("flip");
        body.classList.add("angry");
        timer = setTimeout(function () {
          body.classList.remove("angry");
        }, 2600);
      } else if (count === 7) {
        clearTimeout(timer);
        body.classList.remove("flip");
        void body.offsetWidth; // restart the animation
        body.classList.add("flip");
        timer = setTimeout(function () {
          body.classList.remove("flip");
        }, 1100);
      }
    });
  });

  var stage = document.querySelector(".stage");
  if (!stage) return;
  var kip = stage.querySelector(".kip");
  var cards = [].slice.call(stage.querySelectorAll(".card"));
  var junk = [].slice.call(stage.querySelectorAll(".junk"));
  var replay = document.querySelector(".replay");
  var running = [];
  var BOUNCE = "cubic-bezier(.34,1.56,.64,1)";
  var OUT = "cubic-bezier(.2,.8,.2,1)";

  function anim(el, frames, opts) {
    var a = el.animate(frames, Object.assign({ fill: "both" }, opts));
    running.push(a);
    return a;
  }
  /** Offset from where the element sits now to its pile spot (% of the stage), with a tilt. */
  function pileOf(el) {
    var p = el.getAttribute("data-pile").split(" ").map(Number);
    var s = stage.getBoundingClientRect();
    var b = el.getBoundingClientRect();
    var dx = s.left + (p[0] / 100) * s.width - (b.left + b.width / 2);
    var dy = s.top + (p[1] / 100) * s.height - (b.top + b.height / 2);
    return "translate(" + dx + "px," + dy + "px) rotate(" + p[2] + "deg)";
  }
  /** Offset from the element to Kipple's mouth. */
  function mouth(el) {
    var k = kip.getBoundingClientRect();
    var b = el.getBoundingClientRect();
    return "translate(" + (k.left + k.width * 0.5 - (b.left + b.width / 2)) + "px," + (k.top + k.height * 0.68 - (b.top + b.height / 2)) + "px) rotate(0deg) scale(.05)";
  }

  function play() {
    running.forEach(function (a) {
      a.cancel();
    });
    running = [];
    if (replay) replay.hidden = true;
    var all = cards.concat(junk);
    var piles = all.map(pileOf);
    var mouths = junk.map(mouth);

    // 1. Everything tumbles in from above and lands in a heap.
    all.forEach(function (el, i) {
      var from = piles[i].replace("translate(", "translate(0px,-60px) translate(").replace(/rotate\(([-\d.]+)deg\)/, function (_, d) {
        return "rotate(" + d * 2.2 + "deg)";
      });
      anim(el, [{ transform: from + " scale(.9)", opacity: 0 }, { transform: piles[i], opacity: 1 }], { duration: 520, delay: 60 * i, easing: BOUNCE });
    });
    // 2. The heap wobbles a little while it waits.
    all.forEach(function (el, i) {
      var p = piles[i];
      anim(el, [{ transform: p }, { transform: p + " rotate(" + (i % 2 ? 3 : -3) + "deg)" }, { transform: p }], {
        duration: 420,
        delay: 1000 + 30 * i,
        easing: "ease-in-out",
        fill: "none",
        composite: "replace",
      });
    });
    // 3. Kipple pops in.
    anim(kip, [{ transform: "scale(0) rotate(-20deg)", opacity: 0 }, { transform: "scale(1.15) rotate(6deg)", opacity: 1, offset: 0.7 }, { transform: "scale(1)", opacity: 1 }], {
      duration: 520,
      delay: 1300,
      easing: OUT,
    });
    // 4. It eats the junk, one bite each.
    junk.forEach(function (el, i) {
      var t = 1900 + i * 330;
      anim(el, [{ transform: piles[cards.length + i], opacity: 1 }, { transform: mouths[i], opacity: 0 }], { duration: 300, delay: t, easing: "cubic-bezier(.55,0,.75,.2)" });
      kip.animate([{ transform: "scale(1)" }, { transform: "scale(1.14,.9)" }, { transform: "scale(1)" }], { duration: 240, delay: t + 240, composite: "add" });
    });
    // 5. The rest line up on the board.
    var tidy = 1900 + junk.length * 330 + 150;
    cards.forEach(function (el, i) {
      anim(el, [{ transform: piles[i] }, { transform: "none" }], { duration: 620, delay: tidy + i * 70, easing: BOUNCE });
    });
    var end = tidy + cards.length * 70 + 620;
    anim(kip, [{ transform: "translateY(0)" }, { transform: "translateY(-10px)" }, { transform: "translateY(0)" }], { duration: 500, delay: end, easing: OUT, fill: "none", composite: "add" });
    setTimeout(function () {
      if (replay) replay.hidden = false;
    }, end);
  }

  if (replay) replay.addEventListener("click", play);
  // Start once the stage is on screen (it is, on load, for most visitors).
  var started = false;
  new IntersectionObserver(function (e, o) {
    if (!started && e[0].isIntersecting) {
      started = true;
      o.disconnect();
      requestAnimationFrame(play);
    }
  }).observe(stage);
})();
