"""Apply or verify Telegram settings. Never prints token-bearing HTTP errors."""
import argparse
import hashlib
import json
import os
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from common import ROOT, config, telegram
from bot_settings import COMMANDS, NAME, DESCRIPTION, SHORT_DESCRIPTION


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, new_url):
        raise ValueError('Worker must respond directly without redirects.')


def read_worker_json(request):
    with build_opener(NoRedirect).open(request, timeout=20) as response:
        raw = response.read(65537)
    if len(raw) > 65536:
        raise ValueError('Worker response is too large.')
    return json.loads(raw)


def connect_worker(worker_url, token, check_only=False):
    base = worker_url.rstrip('/')
    parsed = urlsplit(base)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.query or parsed.fragment:
        raise ValueError('Worker URL must be a public HTTPS address without query parameters.')
    health = read_worker_json(Request(base + '/health'))
    if health.get('service') != 'device-workshop-bot' or not health.get('configured'):
        raise ValueError('Worker is not ready. Deploy the file and add TELEGRAM_BOT_TOKEN in Worker settings.')
    secret = hashlib.sha256(('device-workshop:webhook:v1:' + token).encode()).hexdigest()
    target = base + '/telegram/webhook'
    # Harmless signed probe: no message or callback, so no messages are sent.
    probe = read_worker_json(Request(target, data=b'{"update_id":0}', headers={
        'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret}))
    if probe.get('ok') is not True:
        raise ValueError('Worker did not accept the verification request.')
    if not check_only:
        telegram('setWebhook', {'url': target, 'secret_token': secret,
                                'allowed_updates': ['message', 'callback_query']})
    return target


def configure(check_only=False, worker_url=None):
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
    if worker_url is None:
        saved = json.loads((ROOT / 'data/bot-hosting.json').read_text())
        worker_url = os.environ.get('BOT_WORKER_URL') or saved.get('worker_url', '')
    target = connect_worker(worker_url, settings['token'], check_only) if worker_url else None
    webhook = telegram('getWebhookInfo', {})
    if target and webhook.get('url') != target:
        raise RuntimeError('Telegram webhook URL verification failed.')
    return {'username': identity.get('username'), 'miniapp_url': miniapp_url, 'commands': len(COMMANDS),
            'webhook_configured': bool(webhook.get('url')), 'pending_updates': webhook.get('pending_update_count', 0)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Only read and verify existing settings')
    parser.add_argument('--worker-url', help='Published Worker base URL; connects it after a signed readiness probe')
    args = parser.parse_args()
    try:
        result = configure(check_only=args.check, worker_url=args.worker_url)
    except ValueError as error:
        raise SystemExit(str(error)) from None
    except Exception as error:
        raise SystemExit(f'Telegram configuration failed ({type(error).__name__}). No credentials printed.') from None
    print(f"Verified @{result['username']}: profile, description, {result['commands']} commands and Mini App menu.")
    print('Mini App URL:', result['miniapp_url'])
    print('Webhook configured:', result['webhook_configured'], '; pending updates:', result['pending_updates'])
    if result['webhook_configured']:
        print('Hosted webhook is registered. Test /start in the Telegram chat.')
    else:
        print('No hosted webhook yet. Publish the Worker and provide its URL, or run backend/bot.py for polling.')


if __name__ == '__main__':
    main()
