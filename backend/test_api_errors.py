import io
import json
import os
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from common import telegram, TelegramAPIError


class SafeErrors(unittest.TestCase):
    @patch.dict(os.environ, {'TELEGRAM_BOT_TOKEN': 'test-private-key'})
    @patch('common.urlopen')
    def test_api_rejection_is_actionable_and_redacts_secret(self, open_url):
        body = json.dumps({'description': 'Bad webhook for test-private-key: host not found'}).encode()
        open_url.side_effect = HTTPError('https://api.telegram.org/private', 400, 'Bad Request', {}, io.BytesIO(body))
        with self.assertRaises(TelegramAPIError) as caught:
            telegram('setWebhook', {'url': 'https://example.org/telegram/webhook'})
        message = str(caught.exception)
        self.assertIn('setWebhook HTTP 400', message)
        self.assertIn('host not found', message)
        self.assertNotIn('test-private-key', message)


if __name__ == '__main__': unittest.main()
