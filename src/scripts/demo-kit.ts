// Runs the terminal-screen demos: frame loops that only run while a demo can be
// seen, and a repaint helper for the <pre> each screen draws into.

export const reducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Calls tick(dt) once a frame while the element is on screen, the tool screen
 * holding it is not hidden by the tools index, and the tab is visible.
 */
export function whileVisible(el: Element, tick: (dt: number) => void): void {
  let raf = 0;
  let last = 0;
  let inView = false;
  const screen = el.closest('[data-screen]');
  const active = () => inView && !document.hidden && !screen?.hasAttribute('data-hidden');
  const loop = (t: number) => {
    const dt = last ? Math.min(t - last, 50) : 16;
    last = t;
    tick(dt);
    raf = requestAnimationFrame(loop);
  };
  const update = () => {
    if (active()) {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
  new IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting;
      update();
    },
    { threshold: 0.15 },
  ).observe(el);
  document.addEventListener('visibilitychange', update);
  if (screen) {
    new MutationObserver(update).observe(screen, { attributes: true, attributeFilter: ['data-hidden'] });
  }
}

/** Steps a screen's state every frame and repaints its <pre> at most 30 times a second. */
export function animate<S>(
  root: Element,
  pre: HTMLElement,
  state: S,
  step: (s: S, dt: number) => void,
  render: (s: S) => string,
): void {
  let since = 0;
  whileVisible(root, (dt) => {
    step(state, dt);
    since += dt;
    if (since >= 33) {
      since = 0;
      pre.innerHTML = render(state);
    }
  });
}
