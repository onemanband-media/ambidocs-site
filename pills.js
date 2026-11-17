// Information pills, shown one at a time. Move between them with the arrows,
// a swipe, the arrow keys, or a mouse wheel once the page is at the stage.

(function () {
  const stage = document.getElementById('stage');
  const pills = document.getElementById('pills');
  const prev = document.getElementById('pill-prev');
  const next = document.getElementById('pill-next');
  const count = document.getElementById('pill-count');
  if (!stage || !pills) return;
  const cards = Array.prototype.slice.call(pills.querySelectorAll('.panel'));

  function index() {
    let best = 0, bestD = Infinity;
    cards.forEach(function (c, i) {
      const d = Math.abs(c.offsetLeft - pills.offsetLeft - pills.scrollLeft);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }
  function go(i) {
    i = Math.max(0, Math.min(cards.length - 1, i));
    pills.scrollTo({ left: cards[i].offsetLeft - pills.offsetLeft, behavior: 'smooth' });
  }
  function sync() {
    const i = index();
    if (prev) prev.disabled = i === 0;
    if (next) next.disabled = i === cards.length - 1;
    if (count) count.textContent = (i + 1) + ' / ' + cards.length;
  }
  if (prev) prev.addEventListener('click', function () { go(index() - 1); });
  if (next) next.addEventListener('click', function () { go(index() + 1); });
  pills.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  sync();

  // One wheel gesture moves one pill. At the first pill, scrolling up goes
  // back into the intro as usual.
  let acc = 0, locked = false, target = -1;
  stage.addEventListener('wheel', function (e) {
    const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (stage.getBoundingClientRect().top > 2) return; // still arriving
    const card = e.target.closest && e.target.closest('.panel');
    if (card && d === e.deltaY && card.scrollHeight > card.clientHeight + 1) {
      const canDown = card.scrollTop < card.scrollHeight - card.clientHeight - 1;
      if ((d > 0 && canDown) || (d < 0 && card.scrollTop > 0)) return;
    }
    const i = locked ? target : index();
    if ((d > 0 && i >= cards.length - 1) || (d < 0 && i <= 0)) { if (!locked) return; }
    e.preventDefault();
    if (locked) return;
    acc += d * (e.deltaMode === 1 ? 32 : 1);
    if (Math.abs(acc) < 40) return;
    target = i + (acc > 0 ? 1 : -1);
    acc = 0;
    locked = true;
    go(target);
    setTimeout(function () { locked = false; }, 550);
  }, { passive: false });

  document.addEventListener('keydown', function (e) {
    if (stage.getBoundingClientRect().top > 2) return;
    if (e.key === 'ArrowRight') go(index() + 1);
    else if (e.key === 'ArrowLeft') go(index() - 1);
  });
})();
