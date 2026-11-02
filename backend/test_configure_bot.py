import os
import unittest
from unittest.mock import patch
from configure_bot import configure, connect_worker
from bot_settings import COMMANDS, NAME, DESCRIPTION, SHORT_DESCRIPTION


class ConfigureTests(unittest.TestCase):
    @patch.dict(os.environ, {'TELEGRAM_BOT_TOKEN': '', 'PUBLIC_URL': ''})
    @patch('configure_bot.telegram')
    def test_missing_token_does_not_call_telegram(self, api):
        with self.assertRaises(ValueError): configure()
        api.assert_not_called()

    @patch.dict(os.environ, {'TELEGRAM_BOT_TOKEN': 'test-only', 'PUBLIC_URL': 'https://example.org/project'})
    @patch('configure_bot.telegram')
    def test_profile_is_written_and_verified(self, api):
        answers = {'getMe': {'username': 'test_bot'}, 'getMyName': {'name': NAME}, 'getWebhookInfo': {'url': '', 'pending_update_count': 0},
                   'getMyDescription': {'description': DESCRIPTION},
                   'getMyShortDescription': {'short_description': SHORT_DESCRIPTION},
                   'getMyCommands': COMMANDS,
                   'getChatMenuButton': {'type': 'web_app', 'text': 'Услуги и цены',
                                        'web_app': {'url': 'https://example.org/project/miniapp.html'}}}
        api.side_effect = lambda method, payload: answers.get(method, True)
        result = configure()
        self.assertEqual(result['commands'], 8)
        methods = [call.args[0] for call in api.call_args_list]
        self.assertEqual(methods.count('setMyDescription'), 2)
        self.assertIn('setChatMenuButton', methods)
        api.reset_mock()
        configure(check_only=True)
        self.assertFalse(any(call.args[0].startswith('set') for call in api.call_args_list))

    def test_profile_respects_telegram_limits(self):
        self.assertLessEqual(len(NAME), 64)
        self.assertLessEqual(len(DESCRIPTION), 512)
        self.assertLessEqual(len(SHORT_DESCRIPTION), 120)

    @patch('configure_bot.telegram')
    @patch('configure_bot.read_worker_json')
    def test_worker_is_probed_before_setting_webhook(self, read, api):
        read.side_effect = [{'service': 'device-workshop-bot', 'configured': True}, {'ok': True}]
        url = connect_worker('https://test.example', 'test-only')
        self.assertEqual(url, 'https://test.example/telegram/webhook')
        payload = api.call_args.args[1]
        self.assertEqual(api.call_args.args[0], 'setWebhook')
        self.assertEqual(len(payload['secret_token']), 64)
        self.assertEqual(payload['allowed_updates'], ['message', 'callback_query'])
        self.assertNotIn('drop_pending_updates', payload)

    @patch('configure_bot.telegram')
    @patch('configure_bot.read_worker_json')
    def test_unready_worker_cannot_replace_existing_webhook(self, read, api):
        read.return_value = {'service': 'device-workshop-bot', 'configured': False}
        with self.assertRaises(ValueError): connect_worker('https://test.example', 'test-only')
        api.assert_not_called()


if __name__ == '__main__': unittest.main()
