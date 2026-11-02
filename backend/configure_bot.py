"""Apply or verify Telegram settings. Never prints token-bearing HTTP errors."""
import argparse
import hashlib
import json
import os
import time
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError
from common import ROOT, config, telegram, TelegramAPIError
from bot_settings import COMMANDS, NAME, DESCRIPTION, SHORT_DESCRIPTION


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, new_url):
        raise ValueError('Worker must respond directly without redirects.')


def read_worker_json(request):
    endpoint = urlsplit(request.full_url).path
    try:
        with build_opener(NoRedirect).open(request, timeout=20) as response:
            raw = response.read(65537)
    except HTTPError as error:
        raise ValueError(f'Worker {endpoint} returned HTTP {error.code}. Check the public address and Worker secret configuration.') from None
    except URLError:
        raise ValueError(f'Worker {endpoint} is unreachable. Check that production deployment and workers.dev are enabled.') from None
    if len(raw) > 65536:
        raise ValueError('Worker response is too large.')
    return json.loads(raw)


def fail(message):
    # Only call with our own safe diagnostics, never raw HTTP exceptions.
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        safe = message.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
        print('::error title=Telegram bot setup::' + safe, flush=True)
    raise SystemExit(message)


def connect_worker(worker_url, token, check_only=False, readiness_confirmed=False):
    base = worker_url.rstrip('/')
    parsed = urlsplit(base)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.query or parsed.fragment:
        raise ValueError('Worker URL must be a public HTTPS address without query parameters.')
    if not readiness_confirmed:
        health = read_worker_json(Request(base + '/health'))
        if health.get('service') != 'device-workshop-bot' or not health.get('configured'):
            raise ValueError('Worker is not ready. Deploy the file and add TELEGRAM_BOT_TOKEN in Worker settings.')
    secret = hashlib.sha256(('device-workshop:webhook:v1:' + token).encode()).hexdigest()
    target = base + '/telegram/webhook'
    # Harmless signed probe: no message or callback, so no messages are sent.
    if not readiness_confirmed:
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
        expected = [('getMyName', 'setMyName', 'name', NAME),
                    ('getMyDescription', 'setMyDescription', 'description', DESCRIPTION),
                    ('getMyShortDescription', 'setMyShortDescription', 'short_description', SHORT_DESCRIPTION)]
        for getter, setter, key, value in expected:
            if telegram(getter, common).get(key) == value:
                continue
            if check_only:
                raise RuntimeError(f'Telegram verification failed: {getter} ({language or "default"}).')
            telegram(setter, {**common, key: value})
            if telegram(getter, common).get(key) != value:
                raise RuntimeError(f'Telegram verification failed: {getter} ({language or "default"}).')
        if telegram('getMyCommands', common) != COMMANDS:
            if check_only:
                raise RuntimeError('Telegram command verification failed.')
            telegram('setMyCommands', {**common, 'commands': COMMANDS})
            if telegram('getMyCommands', common) != COMMANDS:
                raise RuntimeError('Telegram command verification failed.')
    if telegram('getChatMenuButton', {}) != menu:
        if check_only:
            raise RuntimeError('Telegram menu verification failed.')
        telegram('setChatMenuButton', {'menu_button': menu})
        if telegram('getChatMenuButton', {}) != menu:
            raise RuntimeError('Telegram menu verification failed.')
    readiness_confirmed = False
    if worker_url is None:
        saved = json.loads((ROOT / 'data/bot-hosting.json').read_text())
        worker_url = os.environ.get('BOT_WORKER_URL') or saved.get('worker_url', '')
        readiness_confirmed = saved.get('owner_confirmed_ready') is True and worker_url == saved.get('worker_url')
    before = telegram('getWebhookInfo', {}) if worker_url else {}
    started = int(time.time())
    target = connect_worker(worker_url, settings['token'], check_only, readiness_confirmed) if worker_url else None
    webhook = telegram('getWebhookInfo', {})
    if target and webhook.get('url') != target:
        raise RuntimeError('Telegram webhook URL verification failed.')
    if target and not check_only:
        time.sleep(8)
        webhook = telegram('getWebhookInfo', {})
    delivery_error = webhook.get('last_error_date', 0) >= started
    pending = webhook.get('pending_update_count', 0)
    if os.environ.get('GITHUB_ACTIONS') == 'true' and target:
        summary = (f"Webhook URL verified: {webhook.get('url') == target}. "
                   f"Pending updates before: {before.get('pending_update_count', 0)}; after: {pending}. "
                   f"New Telegram delivery error: {delivery_error}.")
        print('::notice title=Telegram webhook status::' + summary, flush=True)
        if delivery_error:
            # Telegram's standard status code is safe; do not print arbitrary URL-bearing errors.
            import re
            match = re.search(r'\b[45]\d\d\b', webhook.get('last_error_message', ''))
            code = match.group() if match else 'unknown'
            print('::warning title=Telegram delivery::Webhook registered; Telegram reports delivery error code ' + code, flush=True)
    return {'username': identity.get('username'), 'miniapp_url': miniapp_url, 'commands': len(COMMANDS),
            'webhook_configured': bool(webhook.get('url')), 'pending_updates': pending,
            'delivery_error': delivery_error}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Only read and verify existing settings')
    parser.add_argument('--worker-url', help='Published Worker base URL; connects it after a signed readiness probe')
    args = parser.parse_args()
    try:
        result = configure(check_only=args.check, worker_url=args.worker_url)
    except ValueError as error:
        fail(str(error))
    except TelegramAPIError as error:
        fail(str(error))
    except Exception as error:
        fail(f'Telegram configuration failed ({type(error).__name__}). No credentials printed.')
    print(f"Verified @{result['username']}: profile, description, {result['commands']} commands and Mini App menu.")
    print('Mini App URL:', result['miniapp_url'])
    print('Webhook configured:', result['webhook_configured'], '; pending updates:', result['pending_updates'])
    if result['webhook_configured']:
        print('Hosted webhook is registered. Test /start in the Telegram chat.')
    else:
        print('No hosted webhook yet. Publish the Worker and provide its URL, or run backend/bot.py for polling.')


if __name__ == '__main__':
    main()
