const tg = window.Telegram?.WebApp;
if (tg?.initData) { tg.ready(); tg.expand(); }
let services = [];
let selected = null;
const catalog = document.querySelector('#mini-catalog');
const status = document.querySelector('#catalog-status');
const result = document.querySelector('#order-result');
const priceLabel = item => item.price === null ? 'Стоимость уточняйте' : `от ${item.price.toLocaleString('ru-RU')} ₽`;

function render(filter = 'all') {
  catalog.replaceChildren();
  services.filter(item => filter === 'all' || item.category === filter).forEach(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `mini-service${selected?.id === item.id ? ' selected' : ''}`;
    button.setAttribute('aria-pressed', String(selected?.id === item.id));
    const title = document.createElement('strong'); title.textContent = item.name;
    const note = document.createElement('small'); note.textContent = item.note;
    const price = document.createElement('span'); price.className = 'mini-price'; price.textContent = priceLabel(item);
    button.append(title, note, price);
    button.addEventListener('click', () => {
      selected = item;
      document.querySelector('#selected-service').textContent = `${item.name} · ${priceLabel(item)}`;
      result.textContent = '';
      document.querySelector('#message-fallback').hidden = true;
      render(filter);
      document.querySelector('#order-section').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
    catalog.append(button);
  });
}

document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-filter]').forEach(other => {
    other.classList.toggle('active', other === button);
    other.setAttribute('aria-pressed', String(other === button));
  });
  render(button.dataset.filter);
}));

async function load() {
  try {
    const response = await fetch('data/services.json');
    if (!response.ok) throw new Error('catalog');
    services = await response.json();
    status.textContent = ''; render();
  } catch {
    status.textContent = 'Не удалось загрузить услуги. Обновите страницу или напишите мастеру по ссылке ниже.';
  }
}
document.querySelector('#order-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!selected) { result.textContent = 'Выберите услугу в каталоге.'; catalog.scrollIntoView(); return; }
  const device = document.querySelector('#order-device').value.trim();
  const details = document.querySelector('#order-details').value.trim();
  if (!device) { result.textContent = 'Укажите модель устройства или задачу.'; return; }
  const text = `Здравствуйте, Тигран! Хочу обратиться в Device Workshop.\nУслуга: ${selected.name} (${priceLabel(selected)}).\nУстройство / задача: ${device}${details ? `\nПодробности: ${details}` : ''}\nПодскажите, пожалуйста, стоимость и когда можно подойти.`;
  const url = `https://t.me/DeviceWorkshop?text=${encodeURIComponent(text)}`;
  if (tg?.initData) tg.openTelegramLink(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
  result.textContent = 'Сообщение подготовлено. Отправьте его мастеру в Telegram. Если чат не открылся, скопируйте сообщение кнопкой ниже.';
  document.querySelector('#message-fallback').hidden = false;
  document.querySelector('#prepared-message').value = text;
});
document.querySelector('#copy-message').addEventListener('click', async () => {
  const field = document.querySelector('#prepared-message');
  try {
    await navigator.clipboard.writeText(field.value);
    document.querySelector('#copy-status').textContent = 'Скопировано. Вставьте сообщение в чат @DeviceWorkshop.';
  } catch {
    field.focus(); field.select();
    document.querySelector('#copy-status').textContent = 'Выделили текст — скопируйте его через меню устройства.';
  }
});
load();
