const galleryLinks = Array.from(document.querySelectorAll('[data-gallery]'));
const galleryDialog = document.querySelector('#gallery-dialog');
if (galleryDialog && galleryLinks.length) {
  const image = galleryDialog.querySelector('img');
  const caption = galleryDialog.querySelector('#gallery-caption');
  const count = galleryDialog.querySelector('.gallery-count');
  const original = galleryDialog.querySelector('.gallery-original');
  let current = 0;
  function show(index) {
    current = (index + galleryLinks.length) % galleryLinks.length;
    const link = galleryLinks[current];
    image.src = link.href;
    image.alt = link.querySelector('img').alt;
    caption.textContent = link.dataset.caption;
    count.textContent = `${current + 1} / ${galleryLinks.length}`;
    original.href = link.href;
  }
  galleryLinks.forEach((link, index) => link.addEventListener('click', event => {
    event.preventDefault(); show(index); galleryDialog.showModal();
  }));
  galleryDialog.querySelector('.gallery-close').addEventListener('click', () => galleryDialog.close());
  galleryDialog.querySelector('.gallery-prev').addEventListener('click', () => show(current - 1));
  galleryDialog.querySelector('.gallery-next').addEventListener('click', () => show(current + 1));
  galleryDialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(current - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); show(current + 1); }
  });
  galleryDialog.addEventListener('click', event => {
    if (event.target === galleryDialog) {
      const rect = galleryDialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) galleryDialog.close();
    }
  });
}
