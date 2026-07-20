(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  if (reducedMotion || !finePointer) return;

  let current = window.scrollY;
  let target = current;
  let frame = 0;

  const maximumScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  const animate = () => {
    current += (target - current) * 0.095;

    if (Math.abs(target - current) < 0.2) {
      current = target;
      frame = 0;
      window.scrollTo(0, current);
      return;
    }

    window.scrollTo(0, current);
    frame = window.requestAnimationFrame(animate);
  };

  const startAnimation = () => {
    if (!frame) frame = window.requestAnimationFrame(animate);
  };

  window.addEventListener("wheel", (event) => {
    if (event.ctrlKey || event.defaultPrevented) return;

    const interactive = event.target.closest("input, textarea, select, [contenteditable='true']");
    if (interactive) return;

    event.preventDefault();
    target = Math.max(0, Math.min(maximumScroll(), target + event.deltaY * 1.05));
    startAnimation();
  }, { passive: false });

  window.addEventListener("scroll", () => {
    if (!frame) {
      current = window.scrollY;
      target = current;
    }
  }, { passive: true });

  window.addEventListener("resize", () => {
    target = Math.min(target, maximumScroll());
    current = Math.min(current, maximumScroll());
  }, { passive: true });

  document.addEventListener("click", (event) => {
    const anchor = event.target.closest("a[href^='#']");
    if (!anchor) return;

    const destination = document.querySelector(anchor.getAttribute("href"));
    if (!destination) return;

    event.preventDefault();
    target = Math.max(0, Math.min(maximumScroll(), destination.offsetTop));
    startAnimation();
    history.replaceState(null, "", anchor.getAttribute("href"));
  });
})();
