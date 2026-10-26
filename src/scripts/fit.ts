// Sizes a one-line display element ([data-fit], white-space: nowrap) so its text
// runs exactly from margin to margin, measured in the loaded face.

function fitAll(): void {
  document.querySelectorAll<HTMLElement>('[data-fit]').forEach((box) => {
    box.style.fontSize = '';
    const cs = getComputedStyle(box);
    if (cs.whiteSpace !== 'nowrap') return;
    const tracking = parseFloat(cs.letterSpacing) / parseFloat(cs.fontSize) || 0;
    const probe = document.createElement('span');
    probe.textContent = (box.textContent ?? '').trim();
    probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-size:100px;letter-spacing:${tracking * 100}px`;
    box.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (!width) return;
    let size = (100 * avail) / width;
    box.style.fontSize = `${size}px`;
    // correct against the text as actually rendered (kerning, hidden breaks)
    const range = document.createRange();
    range.selectNodeContents(box);
    const actual = range.getBoundingClientRect().width;
    if (actual) size *= avail / actual;
    box.style.fontSize = `${Math.floor(size * 0.995 * 10) / 10}px`;
  });
}

let started = false;
export function fitText(): void {
  if (started) return;
  started = true;
  document.fonts.ready.then(fitAll);
  let frame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fitAll);
  });
}
