"""Telegram assistant for the static site. Run on a computer or server, not Pages."""
import time
from common import SERVICES, config, telegram
from bot_settings import COMMANDS

CONTACTS = ('Москва, проспект Куприна, 34, корпус 2\n'
            'Ежедневно 10:00–20:00\n+7 977 997-76-77\nМастер: @DeviceWorkshop')


def keyboard():
    rows = []
    url = config()['public_url']
    if url.startswith('https://'):
        rows.append([{'text': 'Открыть услуги и заявку', 'web_app': {'url': url + '/miniapp.html'}}])
    rows.extend([
        [{'text': 'Услуги и цены', 'callback_data': 'prices'}, {'text': 'Контакты', 'callback_data': 'contacts'}],
        [{'text': 'Написать мастеру', 'url': 'https://t.me/DeviceWorkshop'}],
        [{'text': 'Маршрут', 'url': 'https://yandex.ru/maps/org/device_workshop/223528800071/'}]
    ])
    return {'inline_keyboard': rows}


def text_for(command):
    if command == 'prices':
        prices = []
        for item in SERVICES:
            price = 'стоимость уточняйте' if item['price'] is None else f"от {item['price']:,} ₽".replace(',', ' ')
            prices.append(f"• {item['name']} — {price}")
        return 'Услуги Device Workshop\n\n' + '\n'.join(prices) + '\n\nЦены ориентировочные. Наличие, стоимость и сроки согласуются до работ. Лицензии на программы — отдельно.'
    if command == 'contacts':
        return CONTACTS
    if command == 'hours':
        return 'Работаем ежедневно, без выходных, с 10:00 до 20:00 (Москва).\nВ праздники график может меняться — уточните перед визитом.\n+7 977 997-76-77'
    if command == 'print':
        return 'Копирование и печать А4\n\nЧёрно-белая — от 25 ₽ за 1 шт.\nЦветная — цену уточните у мастера.\n\nНапишите @DeviceWorkshop: количество страниц, цветность и желаемое время. Не отправляйте конфиденциальные документы без согласования.'
    if command == 'site':
        url = config()['public_url']
        return f'Сайт Device Workshop: {url}\n\nУслуги, цены, контакты и полезные статьи.' if url else 'Адрес сайта будет добавлен после публикации. Пока все цены доступны через /prices, мастер — @DeviceWorkshop.'
    if command == 'repair':
        return 'Выберите услугу в Mini App и опишите задачу. «Написать мастеру» откроет @DeviceWorkshop с готовым текстом — отправьте его самостоятельно. Мастер согласует детали, стоимость и время визита.\n\nИли просто напишите @DeviceWorkshop: модель устройства и что случилось.'
    if command == 'help':
        return ('1. Посмотрите /prices.\n2. Откройте Mini App через меню или /repair.\n'
                '3. Выберите услугу и опишите задачу.\n4. Отправьте подготовленное сообщение в Telegram.\n5. Дождитесь согласования.\n\n'
                'Сообщения этому боту не пересылаются мастеру автоматически. Для разговора нажмите «Написать мастеру». Не отправляйте пароли, коды или данные карты.\n\n' + CONTACTS)
    return ('Здравствуйте! Это Device Workshop — мастерская Тиграна.\n\n'
            'Ремонт Apple и Android, компьютеров и ноутбуков. Защита экрана, настройка программ и печать А4.\n\n'
            'Выберите действие ниже или напишите мастеру.\n\n' + CONTACTS)


def handle_update(update):
    callback = update.get('callback_query')
    message = callback.get('message', {}) if callback else update.get('message', {})
    if not message or message.get('chat', {}).get('type') != 'private':
        return
    chat_id = message['chat']['id']
    if callback:
        telegram('answerCallbackQuery', {'callback_query_id': callback['id']})
        command = callback.get('data', 'start')
    else:
        words = message.get('text', '').split(maxsplit=1)
        command = words[0].split('@')[0].lstrip('/') if words else 'help'
        if command not in {item['command'] for item in COMMANDS}:
            telegram('sendMessage', {'chat_id': chat_id, 'text': 'Это автоматический помощник. Ваше сообщение не переслано мастеру. Для личного разговора нажмите «Написать мастеру».', 'reply_markup': keyboard()})
            return
    telegram('sendMessage', {'chat_id': chat_id, 'text': text_for(command), 'reply_markup': keyboard()})


def run():
    if not config()['token']:
        raise SystemExit('Set TELEGRAM_BOT_TOKEN in the environment; never commit it.')
    from configure_bot import configure
    configure()
    offset = 0
    failures = {}
    print('Bot started. Direct contact mode; no customer database.', flush=True)
    while True:
        try:
            updates = telegram('getUpdates', {'offset': offset, 'timeout': 25, 'allowed_updates': ['message', 'callback_query']})
            for update in updates:
                try:
                    handle_update(update)
                except Exception:
                    update_id = update['update_id']
                    failures[update_id] = failures.get(update_id, 0) + 1
                    if failures[update_id] < 3:
                        raise
                    print('Skipped an undeliverable update after 3 attempts', flush=True)
                failures.pop(update['update_id'], None)
                offset = update['update_id'] + 1
        except KeyboardInterrupt:
            break
        except Exception as error:
            # HTTP error strings can contain the token: log only exception types.
            print(f'Bot operation failed ({type(error).__name__}); retrying in 5 seconds', flush=True)
            time.sleep(5)


if __name__ == '__main__':
    run()
