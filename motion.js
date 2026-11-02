const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
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
  if (reduceMotion.matches || !element.animate) return;
  const animation = element.animate([
    { opacity: 0, transform: 'translateY(20px)' },
    { opacity: 1, transform: 'translateY(0)' }
  ], { duration: 850, delay, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both' });
  running.add(animation);
  animation.finished.then(() => animation.cancel()).catch(() => {}).finally(() => running.delete(animation));
}
reduceMotion.addEventListener('change', () => {
  if (reduceMotion.matches) running.forEach(animation => animation.cancel());
});
document.querySelectorAll('.hero-copy > *').forEach((element, index) => enter(element, index * 85));
if (document.querySelector('.hero-art')) enter(document.querySelector('.hero-art'), 180);
if ('IntersectionObserver' in window) {
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
