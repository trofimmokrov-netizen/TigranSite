"""Apply or verify Telegram settings. Never prints token-bearing HTTP errors."""
import argparse
from urllib.parse import urlsplit
from common import config, telegram
from bot_settings import COMMANDS, NAME, DESCRIPTION, SHORT_DESCRIPTION


def configure(check_only=False):
    settings = config()
    if not settings['token']:
        raise ValueError('TELEGRAM_BOT_TOKEN is not configured in the process environment.')
    parsed = urlsplit(settings['public_url'])
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.query or parsed.fragment:
        raise ValueError('Set PUBLIC_URL to the published HTTPS site address, including the project path.')
    miniapp_url = settings['public_url'] + '/miniapp.html'
    identity = telegram('getMe', {})
    menu = {'type': 'web_app', 'text': 'Услуги и цены', 'web_app': {'url': miniapp_url}}
    for language in ('', 'ru'):
        common = {'language_code': language}
        if not check_only:
            telegram('setMyName', {**common, 'name': NAME})
            telegram('setMyDescription', {**common, 'description': DESCRIPTION})
            telegram('setMyShortDescription', {**common, 'short_description': SHORT_DESCRIPTION})
            telegram('setMyCommands', {**common, 'commands': COMMANDS})
        expected = [('getMyName', 'name', NAME),
                    ('getMyDescription', 'description', DESCRIPTION),
                    ('getMyShortDescription', 'short_description', SHORT_DESCRIPTION)]
        for method, key, value in expected:
            if telegram(method, common).get(key) != value:
                raise RuntimeError(f'Telegram verification failed: {method} ({language or "default"}).')
        if telegram('getMyCommands', common) != COMMANDS:
            raise RuntimeError('Telegram command verification failed.')
    if not check_only:
        telegram('setChatMenuButton', {'menu_button': menu})
    if telegram('getChatMenuButton', {}) != menu:
        raise RuntimeError('Telegram menu verification failed.')
    return {'username': identity.get('username'), 'miniapp_url': miniapp_url, 'commands': len(COMMANDS)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Only read and verify existing settings')
    args = parser.parse_args()
    try:
        result = configure(check_only=args.check)
    except ValueError as error:
        raise SystemExit(str(error)) from None
    except Exception as error:
        raise SystemExit(f'Telegram configuration failed ({type(error).__name__}). No credentials printed.') from None
    print(f"Verified @{result['username']}: profile, description, {result['commands']} commands and Mini App menu.")
    print('Mini App URL:', result['miniapp_url'])
    print('Profile configuration does not start the bot worker. Run backend/bot.py for command replies.')


if __name__ == '__main__':
    main()
