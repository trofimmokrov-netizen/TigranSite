import os
import unittest
from unittest.mock import patch
from bot import COMMANDS, handle_update, keyboard, text_for


class BotTests(unittest.TestCase):
    def test_catalog_prices_and_contact(self):
        text = text_for('prices')
        self.assertIn('от 25 ₽', text)
        self.assertIn('от 1 300 ₽', text)
        self.assertIn('+7 977 997-76-77', text_for('contacts'))
        self.assertEqual(len(COMMANDS), 8)

    @patch.dict(os.environ, {'PUBLIC_URL': 'https://example.com/TigranSite'})
    def test_miniapp_supports_pages_subpath(self):
        self.assertEqual(keyboard()['inline_keyboard'][0][0]['web_app']['url'], 'https://example.com/TigranSite/miniapp.html')

    @patch('bot.telegram')
    def test_start_prices_and_callback(self, api):
        handle_update({'message': {'chat': {'id': 42, 'type': 'private'}, 'text': '/start'}})
        self.assertIn('мастерская Тиграна', api.call_args.args[1]['text'])
        handle_update({'callback_query': {'id': 'test', 'data': 'prices', 'message': {'chat': {'id': 42, 'type': 'private'}}}})
        self.assertIn('от 25 ₽', api.call_args.args[1]['text'])
        self.assertEqual(api.call_args_list[-2].args[0], 'answerCallbackQuery')

    @patch('bot.telegram')
    def test_no_forwarding_or_group_replies(self, api):
        handle_update({'message': {'chat': {'id': 42, 'type': 'private'}, 'text': 'Мой телефон сломался'}})
        self.assertIn('не переслано', api.call_args.args[1]['text'])
        api.reset_mock()
        handle_update({'message': {'chat': {'id': -42, 'type': 'group'}, 'text': '/start'}})
        api.assert_not_called()


if __name__ == '__main__': unittest.main()
