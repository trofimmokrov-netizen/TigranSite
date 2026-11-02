# Как устроен проект Ксюши и что требуется здесь

В предоставленном репозитории `trofimmokrov-netizen/ksusha_epoxy_premium` файл `docs/telegram-mini-app.md` описывает два отдельных размещения: статическую веб-часть в GitHub Pages и сервер команд в Sites. `bot/build/sites-worker.ts` направляет POST `/telegram/webhook` в `bot/server/bot.mjs`. Секреты находятся в окружении сервиса. Это объясняет работу `/start` без включённого компьютера; один GitHub Pages команды не исполняет. Состояние чужого сервера в этой задаче не изменялось и не проверялось.

Для Device Workshop подготовлен аналогичный обработчик: `backend/webhook.mjs`. Это ES-модуль с Fetch-интерфейсом: default export имеет метод `fetch(request, env)`, именованный export `webhook(request, env)` можно подключить в Worker сервиса Sites. Модуль импортирует общий каталог `data/services.json`; при сборке нужны оба файла. Проверки: `node --test backend/webhook.test.mjs`.

## Постоянный сервис

Развернуть обработчик в **отдельном новом** сервисе, не в сервисе Ксюши. Нужные переменные:

- `TELEGRAM_BOT_TOKEN` — секрет бота Тиграна;
- `TELEGRAM_WEBHOOK_SECRET` — отдельный случайный секрет, минимум 32 символа;
- `PUBLIC_URL` — адрес опубликованного сайта с путём `/TigranSite`.

Публичные маршруты: GET `/health` и POST `/telegram/webhook`. Webhook проверяет секретный заголовок Telegram, формат и размер входящего update, обрабатывает только личные сообщения и callback-кнопки. Базы переписки нет. Ошибки Telegram не выводят токен.

После развёртывания зарегистрировать HTTPS webhook через Telegram `setWebhook`: `url` — адрес `/telegram/webhook` нового сервиса, `secret_token` — значение `TELEGRAM_WEBHOOK_SECRET`, `allowed_updates` — `message` и `callback_query`. Секреты передаются только через защищённое серверное окружение. Затем проверить `getWebhookInfo`, `/health` и ответ на реальный `/start`. Не запускать polling `backend/bot.py` параллельно webhook.

В текущем чате отсутствуют инструменты создания и публикации Sites, поэтому публичный сервис для Device Workshop **пока не развёрнут**, webhook не зарегистрирован, ответы на команды в живом Telegram не подтверждены. Файлы конфигурации и ID проекта Ксюши не копировались и её настройки не менялись.

## Настройка профиля через уже добавленный GitHub Secret

Workflow `.github/workflows/configure-telegram.yml` запускается вручную и при изменении файлов настройки в `main`. Он использует repository secret `TELEGRAM_BOT_TOKEN`, устанавливает имя, описание, команды и кнопку Mini App, считывает их обратно, а также сообщает, есть ли у бота webhook. Это разовая настройка профиля, не постоянное размещение обработчика. Результат конкретного запуска нужно проверять в Actions.
