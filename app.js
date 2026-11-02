const menuButton = document.querySelector('.menu-toggle');
const mobileNav = document.querySelector('#mobile-nav');
menuButton.addEventListener('click', () => {
  const expanded = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!expanded));
  menuButton.setAttribute('aria-label', expanded ? 'Открыть меню' : 'Закрыть меню');
  menuButton.textContent = expanded ? '☰' : '×';
  mobileNav.hidden = expanded;
});
mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  mobileNav.hidden = true;
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Открыть меню');
  menuButton.textContent = '☰';
}));

const dialog = document.querySelector('#booking-dialog');
const service = document.querySelector('#service');
document.querySelectorAll('[data-book]').forEach(button => {
  button.addEventListener('click', () => {
    if (button.dataset.book) service.value = button.dataset.book;
    dialog.showModal();
  });
});
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
document.querySelector('#booking-form').addEventListener('submit', event => {
  event.preventDefault();
  const details = document.querySelector('#device').value.trim();
  const text = `Здравствуйте! Интересует: ${service.value}.${details ? `\n${details}` : ''}`;
  const url = `https://t.me/DeviceWorkshop?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
});
document.querySelector('#year').textContent = new Date().getFullYear();

const cookieNotice = document.querySelector('#cookie-notice');
try { cookieNotice.hidden = localStorage.getItem('dw-storage-notice') === 'seen'; }
catch { cookieNotice.hidden = false; }
document.querySelector('#cookie-dismiss').addEventListener('click', () => {
  try { localStorage.setItem('dw-storage-notice', 'seen'); } catch { /* Storage is optional. */ }
  cookieNotice.hidden = true;
});

if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.07 });
  document.querySelectorAll('.section-heading, .service-card, .price-panel, .about-grid, .review-card, .award-card, .contact-card').forEach(element => {
    element.classList.add('reveal');
    observer.observe(element);
  });
}
