"""Browser UI check; Telegram proof validation is exercised by account.test.mjs."""
import json
import os
from urllib.parse import parse_qs, urlsplit
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('SITE_URL', 'http://127.0.0.1:8080').rstrip('/')
ORIGIN = f'{urlsplit(BASE).scheme}://{urlsplit(BASE).netloc}'
KEY = 'dw-account-session-v1'
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    users = {123: {'id': 123, 'first_name': 'Иван <script>', 'last_name': 'Петров', 'username': 'test_client'},
             456: {'id': 456, 'first_name': 'Анна', 'last_name': '', 'username': ''}}
    def mock_api(route):
        request = route.request
        headers = {'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'}
        if request.method == 'OPTIONS': route.fulfill(status=204, headers=headers); return
        import time
        expires = int(time.time()) + 3600
        path = urlsplit(request.url).path
        status = 200
        if path.endswith('/config'): body = {'auth_enabled': True}
        elif path.endswith('/login'):
            data = json.loads(request.post_data)['data']
            uid = data.get('id')
            if data.get('hash') == 'valid-test-proof' and uid in users:
                body = {'token': f'test-session-{uid}', 'profile': users[uid], 'expires_at': expires}
            else: status = 401; body = {'error': 'Не удалось проверить подпись Telegram.'}
        elif path.endswith('/me'):
            auth = request.headers.get('authorization', '')
            uid = next((uid for uid in users if auth == f'Bearer test-session-{uid}'), None)
            if uid: body = {'profile': users[uid], 'expires_at': expires}
            else: status = 401; body = {'error': 'Сессия недействительна.'}
        else: status = 404; body = {'error': 'Not found'}
        route.fulfill(status=status, headers=headers, content_type='application/json', body=json.dumps(body))
    page.route('https://tigransite.trofimmokrov.workers.dev/api/account/**', mock_api)
    page.goto(BASE + '/account.html', wait_until='networkidle')
    expect(page.locator('#load-login')).to_be_enabled()
    expect(page.locator('#account-dashboard')).to_be_hidden()
    page.evaluate("window.onDeviceWorkshopLogin({id:123,hash:'forged'})")
    expect(page.locator('#account-status')).to_contain_text('подпись')
    expect(page.locator('#account-dashboard')).to_be_hidden()
    page.evaluate("window.onDeviceWorkshopLogin({id:123,hash:'valid-test-proof'})")
    expect(page.locator('#account-dashboard')).to_be_visible()
    expect(page.locator('#profile-name')).to_have_text('Иван <script> Петров')
    assert page.locator('#profile-name script').count() == 0
    page.locator('#draft-service').select_option('phone')
    page.locator('#draft-device').fill('iPhone 13')
    page.locator('#draft-details').fill('Не работает зарядка')
    page.get_by_role('button', name='Сохранить черновик', exact=True).click()
    expect(page.locator('.account-draft')).to_have_count(1)
    page.reload(wait_until='networkidle')
    expect(page.locator('#account-dashboard')).to_be_visible()
    expect(page.locator('.account-draft')).to_have_count(1)
    page.locator('.account-draft').get_by_role('button', name='Редактировать').click()
    page.locator('#draft-device').fill('iPhone 14')
    page.get_by_role('button', name='Сохранить черновик', exact=True).click()
    expect(page.locator('.account-draft')).to_have_count(1)
    expect(page.locator('.account-draft')).to_contain_text('iPhone 14')
    page.evaluate('window.open = (url) => { window.openedMaster = url; return null; }')
    page.locator('.account-draft').get_by_role('button', name='Сообщение мастеру').click()
    link = urlsplit(page.evaluate('window.openedMaster'))
    assert link.hostname == 't.me' and link.path == '/DeviceWorkshop'
    assert 'iPhone 14' in parse_qs(link.query)['text'][0]
    page.locator('.account-draft').get_by_role('button', name='Удалить', exact=True).click()
    expect(page.locator('.account-draft')).to_have_count(0)
    page.get_by_role('button', name='Отменить удаление').click()
    expect(page.locator('.account-draft')).to_have_count(1)
    # A previous user's undo state must not expose their draft to a different profile.
    page.locator('.account-draft').get_by_role('button', name='Удалить', exact=True).click()
    page.get_by_role('button', name='Выйти', exact=True).click()
    expect(page.locator('#account-dashboard')).to_be_hidden()
    assert page.evaluate(f'sessionStorage.getItem({json.dumps(KEY)})') is None
    page.evaluate("window.onDeviceWorkshopLogin({id:456,hash:'valid-test-proof'})")
    expect(page.locator('#profile-name')).to_have_text('Анна')
    expect(page.locator('.account-draft')).to_have_count(0)
    expect(page.locator('#draft-undo')).to_be_hidden()
    page.evaluate("localStorage.setItem('dw-text-size','large')")
    page.reload(wait_until='networkidle')
    expect(page.locator('#account-dashboard')).to_be_visible()
    for width in (320, 390, 768, 1120, 1440):
        page.set_viewport_size({'width': width, 'height': 900})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Account overflow at {width}'
    page.evaluate(f'sessionStorage.setItem({json.dumps(KEY)},"forged-local-token")')
    page.reload(wait_until='networkidle')
    expect(page.locator('#account-dashboard')).to_be_hidden()
    expect(page.locator('#account-guest')).to_be_visible()
    assert page.evaluate(f'sessionStorage.getItem({json.dumps(KEY)})') is None
    assert not errors, errors
    browser.close()
print('PASS: API-verified login UI, rejection of invalid session, safe profile rendering, local draft editing and undo, Telegram handoff, logout, profile isolation and responsive large text')
