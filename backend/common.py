"""Shared public catalog and Telegram API client. No customer database."""
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SERVICES = json.loads((ROOT / 'data/services.json').read_text())


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
    with urlopen(request, timeout=40) as response:
        data = json.load(response)
    if not data.get('ok'):
        raise RuntimeError('Telegram API returned an error')
    return data['result']
