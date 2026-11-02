# Чтобы заработали /start и кнопки

Команды, название, описание и меню уже настроены через GitHub Actions. Остался один этап: опубликовать обработчик, который отвечает Telegram. Постоянно включённый компьютер и VPS не нужны.

## 1. Создать Cloudflare Worker

Войдите в [Cloudflare Dashboard](https://dash.cloudflare.com/) или зарегистрируйтесь. Откройте **Workers & Pages → Create application / Create Worker**, выберите начальный пример Hello World и опубликуйте Worker. Название можно задать `device-workshop-bot`.

Если уже подключён GitHub-репозиторий, как в созданном Worker **tigransite**, вставлять код вручную не нужно. Конфигурация `wrangler.jsonc` использует имя `tigransite`, файл `deploy/worker.mjs` и включает `workers.dev`. Дождитесь успешной production-сборки. Если требуется указать команду публикации — `npx wrangler deploy`, корень проекта — корень репозитория. После успешной публикации ожидаемый адрес созданного Worker: `https://tigransite.trofimmokrov.workers.dev`.

Откройте **Edit code**, полностью замените начальный код содержимым файла:

[deploy/worker.mjs — открыть на GitHub](https://github.com/trofimmokrov-netizen/TigranSite/blob/main/deploy/worker.mjs)

На GitHub кнопка **Raw** открывает чистый текст для копирования. Это готовый один файл, устанавливать пакеты не нужно. Нажмите **Deploy** в редакторе Cloudflare.

## 2. Добавить токен в защищённые настройки Worker

В созданном Worker откройте **Settings → Variables and Secrets → Add**:

- тип — **Secret**;
- имя — `TELEGRAM_BOT_TOKEN`;
- значение — тот же актуальный токен, который сохранён в GitHub Secrets.

Сохраните и примените изменения. Не вставляйте значение токена в код Worker. Отдельный `TELEGRAM_WEBHOOK_SECRET` для этого варианта не нужен — код выводит его из токена на сервере.

## 3. Передать адрес Worker

Скопируйте публичный адрес Worker вида `https://device-workshop-bot.<ваш-поддомен>.workers.dev` и отправьте его в чат с разработчиком. Только адрес, без токена.

Разработчик сохранит его в `data/bot-hosting.json` как `worker_url` и отправит изменение в `main`. Это автоматически запустит **Configure Telegram bot**. Workflow проверит `/health`, отправит безвредный подписанный запрос без сообщения, зарегистрирует Telegram webhook и проверит его адрес. Только после успешного завершения нужно проверять `/start` в Telegram.

Также можно самостоятельно открыть **GitHub → Actions → Configure Telegram bot → Run workflow**, указать адрес в поле **worker_url** и оставить **check_only** выключенным. При таком запуске постоянный адрес в репозитории не изменяется; сохраните его в `data/bot-hosting.json`, чтобы последующие автоматические проверки знали о размещении.

## Проверить результат

Откройте чат бота, отправьте `/start`. Должны появиться приветствие, кнопка Mini App, цены, контакты и связь с Тиграном. `/prices` показывает каталог, `/contacts` — адрес и телефон. Открытие Mini App зависит от доступности сайта на GitHub Pages.

При перевыпуске токена обновите секрет и в GitHub, и в Worker, затем повторите настройку webhook. Не запускайте одновременно polling `backend/bot.py`: после подключения webhook он не нужен.

## Обновление кода

Исходник — `backend/webhook.mjs`, общий каталог — `data/services.json`. После изменений выполните `node scripts/build-worker.mjs` и замените код Worker новой версией `deploy/worker.mjs`. Статический сайт публикуется отдельно через GitHub Pages. Секреты, существующий сервис Ксюши и его токен не затрагиваются.
