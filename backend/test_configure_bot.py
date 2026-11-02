import os
import unittest
from unittest.mock import patch
from configure_bot import configure
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
        answers = {'getMe': {'username': 'test_bot'}, 'getMyName': {'name': NAME},
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


if __name__ == '__main__': unittest.main()
