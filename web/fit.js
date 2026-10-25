// Fits the whole page into the visible screen (no scrolling), on any phone.
// 1) If the phone shows the page at desktop width ("Desktop site" mode), scale it up to mobile size.
// 2) Then shrink everything a little, only if needed, so all content fits the screen height.
(function () {
  var MIN_SHRINK = 0.5;

  function baseZoom() {
    var sw = Math.min(screen.width, screen.height);
    var iw = window.innerWidth;
    var touch = navigator.maxTouchPoints > 0;
    return touch && sw < 700 && iw > sw * 1.4 ? iw / sw : 1;
  }

  // tallest tab decides the size, so both tabs use the same scale
  function tallest() {
    var g = document.getElementById("gold"), f = document.getElementById("fx");
    if (!g || !f) return document.body.offsetHeight;
    var gh = g.hidden, fh = f.hidden, m = 0;
    [[false, true], [true, false]].forEach(function (s) {
      g.hidden = s[0]; f.hidden = s[1];
      m = Math.max(m, document.body.offsetHeight);
    });
    g.hidden = gh; f.hidden = fh;
    return m;
  }

  function fit() {
    var root = document.documentElement;
    var base = baseZoom();
    var avail = window.innerHeight;
    var z = base;
    root.style.zoom = base === 1 ? "" : base;
    for (var i = 0; i < 6; i++) {
      var h = tallest() * z;               // displayed height in viewport px
      if (h <= avail - 1) break;
      var next = Math.max(z * (avail / h) * 0.995, base * MIN_SHRINK);
      if (Math.abs(next - z) < 0.001) break;
      z = next;
      root.style.zoom = z;
    }
  }

  window.igoldFit = fit;
  fit();
  window.addEventListener("resize", fit);
  window.addEventListener("orientationchange", fit);
  window.addEventListener("load", fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
})();
