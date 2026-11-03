const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const root = document.documentElement;
try {
  root.classList.toggle('large-text', localStorage.getItem('dw-text-size') === 'large');
  root.classList.toggle('motion-paused', localStorage.getItem('dw-motion') === 'paused');
} catch { /* Reading preferences are optional. */ }
const controls = document.createElement('div');
controls.className = 'reading-controls';
controls.setAttribute('role', 'group');
controls.setAttribute('aria-label', 'Настройки чтения');
const textToggle = document.createElement('button');
textToggle.type = 'button';
textToggle.className = 'reading-control';
textToggle.innerHTML = '<span aria-hidden="true">Aa</span> Текст крупнее';
const motionToggle = document.createElement('button');
motionToggle.type = 'button';
motionToggle.className = 'reading-control';
function refreshControls() {
  textToggle.setAttribute('aria-pressed', String(root.classList.contains('large-text')));
  textToggle.setAttribute('aria-label', root.classList.contains('large-text') ? 'Вернуть обычный крупный текст' : 'Сделать текст ещё крупнее');
  const paused = root.classList.contains('motion-paused') || reduceMotion.matches;
  motionToggle.textContent = paused ? 'Анимации выключены' : 'Пауза анимаций';
  motionToggle.setAttribute('aria-pressed', String(paused));
  motionToggle.disabled = reduceMotion.matches;
  motionToggle.title = reduceMotion.matches ? 'Анимации отключены настройкой вашего устройства' : 'Остановить или включить декоративные анимации';
}
textToggle.addEventListener('click', () => {
  root.classList.toggle('large-text');
  try { localStorage.setItem('dw-text-size', root.classList.contains('large-text') ? 'large' : 'default'); } catch { /* Optional storage. */ }
  refreshControls();
});
motionToggle.addEventListener('click', () => {
  root.classList.toggle('motion-paused');
  if (root.classList.contains('motion-paused')) running.forEach(animation => animation.cancel());
  try { localStorage.setItem('dw-motion', root.classList.contains('motion-paused') ? 'paused' : 'auto'); } catch { /* Optional storage. */ }
  refreshControls();
});
controls.append(textToggle, motionToggle);
if (document.querySelector('.mini-header')) document.querySelector('.mini-header').after(controls);
else { controls.classList.add('shell'); document.querySelector('main')?.before(controls); }
refreshControls();
const progress = document.createElement('div');
progress.className = 'reading-progress';
progress.setAttribute('aria-hidden', 'true');
document.body.prepend(progress);
const backTop = document.createElement('button');
backTop.className = 'back-top';
backTop.type = 'button';
backTop.setAttribute('aria-label', 'Вернуться наверх');
backTop.textContent = '↑';
backTop.hidden = true;
backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'instant' : 'smooth' }));
document.body.append(backTop);

let queued = false;
function paintScroll() {
  queued = false;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
  backTop.hidden = window.scrollY < 700;
  document.querySelector('.header')?.classList.toggle('is-scrolled', window.scrollY > 20);
}
window.addEventListener('scroll', () => {
  if (!queued) { queued = true; requestAnimationFrame(paintScroll); }
}, { passive: true });
window.addEventListener('resize', paintScroll);
paintScroll();

const running = new Set();
function enter(element, delay = 0) {
  if (reduceMotion.matches || root.classList.contains('motion-paused') || !element.animate) return;
  const animation = element.animate([
    { opacity: 0, transform: 'translateY(20px)' },
    { opacity: 1, transform: 'translateY(0)' }
  ], { duration: 850, delay, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both' });
  running.add(animation);
  animation.finished.then(() => animation.cancel()).catch(() => {}).finally(() => running.delete(animation));
}
reduceMotion.addEventListener('change', () => {
  if (reduceMotion.matches) running.forEach(animation => animation.cancel());
  refreshControls();
});
document.querySelectorAll('.hero-copy > *').forEach((element, index) => enter(element, index * 85));
if (document.querySelector('.hero-art')) enter(document.querySelector('.hero-art'), 180);
if ('IntersectionObserver' in window) {
  const diagramObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    entry.target.toggleAttribute('data-offscreen', !entry.isIntersecting);
  }), { rootMargin: '100px' });
  document.querySelectorAll('.live-diagram').forEach(element => diagramObserver.observe(element));
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const parent = entry.target.parentElement;
      const index = parent.matches('.service-grid, .review-grid, .article-grid, .workshop-gallery')
        ? Array.from(parent.children).indexOf(entry.target) : 0;
      enter(entry.target, Math.min(index, 3) * 75);
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -15px 0px' });
  document.querySelectorAll('.section-heading, .service-card, .price-panel, .about-grid, .review-card, .award-card, .contact-card, .article-card, .bot-presentation, .gallery-photo, .faq-section, .reading-page article').forEach(element => observer.observe(element));
}

const navLinks = document.querySelectorAll('.desktop-nav a[href^="#"]');
if ('IntersectionObserver' in window && navLinks.length) {
  const navObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      navLinks.forEach(link => {
        if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
  }, { rootMargin: '-15% 0px -65% 0px' });
  navLinks.forEach(link => {
    const section = document.getElementById(link.hash.slice(1));
    if (section) navObserver.observe(section);
  });
}
