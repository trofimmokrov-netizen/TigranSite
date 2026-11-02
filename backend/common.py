"""Shared public catalog and Telegram API client. No customer database."""
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import re

ROOT = Path(__file__).resolve().parents[1]
SERVICES = json.loads((ROOT / 'data/services.json').read_text())


class TelegramAPIError(RuntimeError):
    """Telegram error with its token and any token-like strings removed."""


def config():
    return {'token': os.environ.get('TELEGRAM_BOT_TOKEN', ''),
            'public_url': os.environ.get('PUBLIC_URL', '').rstrip('/')}


def telegram(method, payload):
    token = config()['token']
    if not token:
        raise RuntimeError('TELEGRAM_BOT_TOKEN is required')
    request = Request(f'https://api.telegram.org/bot{token}/{method}',
                      data=json.dumps(payload).encode(),
                      headers={'Content-Type': 'application/json'})
    # Never log request URLs: Telegram embeds the credential in the path.
    try:
        with urlopen(request, timeout=40) as response:
            data = json.load(response)
    except HTTPError as error:
        try:
            description = str(json.loads(error.read(8192)).get('description', 'Request rejected'))
        except (ValueError, UnicodeError):
            description = 'Request rejected'
        description = description.replace(token, '[redacted]')
        description = re.sub(r'\b\d{8,12}:[A-Za-z0-9_-]{20,}\b', '[redacted]', description)
        raise TelegramAPIError(f'{method} HTTP {error.code}: {description[:400]}') from None
    if not data.get('ok'):
        raise RuntimeError('Telegram API returned an error')
    return data['result']
