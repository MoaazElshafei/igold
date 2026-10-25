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

  // the gold page is the tallest one, so it decides if we must shrink
  function goldHeight() {
    var g = document.getElementById("gold"), x = document.getElementById("fx");
    if (!g || !x) return document.body.offsetHeight;
    var gh = g.hidden, xh = x.hidden;
    g.hidden = false; x.hidden = true;
    var h = document.body.offsetHeight;
    g.hidden = gh; x.hidden = xh;
    return h;
  }

  // currencies page: grow the cards and fonts so the list fills the whole screen
  function fillCurrencies(z) {
    var x = document.getElementById("fx"), grid = document.getElementById("currencies");
    if (!x || !grid || x.hidden || !grid.children.length) return;
    grid.style.height = ""; grid.style.gridTemplateRows = ""; grid.style.removeProperty("--ch");
    var rows = Math.ceil(grid.children.length / 2), gap = 8;
    var free = window.innerHeight / z - (document.body.offsetHeight - grid.offsetHeight) - 2;
    var rowH = (free - gap * (rows - 1)) / rows;
    var natural = (grid.offsetHeight - 6 * (rows - 1)) / rows;
    if (rowH > natural) {
      grid.style.height = free + "px";
      grid.style.gridTemplateRows = "repeat(" + rows + ", 1fr)";
      grid.style.setProperty("--ch", rowH + "px");
    }
  }

  function fit() {
    var root = document.documentElement;
    var base = baseZoom();
    var avail = window.innerHeight;
    var z = base;
    root.style.zoom = base === 1 ? "" : base;
    for (var i = 0; i < 6; i++) {
      var h = goldHeight() * z;               // displayed height in viewport px
      if (h <= avail - 1) break;
      var next = Math.max(z * (avail / h) * 0.995, base * MIN_SHRINK);
      if (Math.abs(next - z) < 0.001) break;
      z = next;
      root.style.zoom = z;
    }
    fillCurrencies(z);
  }

  window.igoldFit = fit;
  fit();
  window.addEventListener("resize", fit);
  window.addEventListener("orientationchange", fit);
  window.addEventListener("load", fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
})();
