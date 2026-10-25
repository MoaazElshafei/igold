// If a phone shows the page at desktop width (Chrome "Desktop site" mode),
// scale it so the layout looks exactly like the mobile one.
(function () {
  function fit() {
    var sw = Math.min(screen.width, screen.height);
    var iw = window.innerWidth;
    var touch = navigator.maxTouchPoints > 0;
    var root = document.documentElement;
    if (touch && sw < 700 && iw > sw * 1.4) {
      root.style.zoom = (iw / sw).toFixed(3);
    } else {
      root.style.zoom = "";
    }
  }
  fit();
  window.addEventListener("resize", fit);
  window.addEventListener("orientationchange", fit);
})();
