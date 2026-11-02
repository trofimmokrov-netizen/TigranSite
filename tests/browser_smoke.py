"""Run against a local static server: python3 tests/browser_smoke.py."""
import os
from urllib.parse import parse_qs, urlsplit
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('SITE_URL', 'http://127.0.0.1:8080').rstrip('/')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE, wait_until='networkidle')
    expect(page.locator('h1')).to_contain_text('Ваша техника')
    page.locator('#cookie-dismiss').click()
    page.reload()
    expect(page.locator('#cookie-notice')).to_be_hidden()
    page.locator('.menu-toggle').click()
    expect(page.locator('#mobile-nav')).to_be_visible()
    page.locator('#mobile-nav a[href="#services"]').click()
    expect(page.locator('#mobile-nav')).to_be_hidden()
    page.locator('.hero-actions [data-book]').click()
    expect(page.locator('dialog')).to_be_visible()
    page.keyboard.press('Escape')
    expect(page.locator('dialog')).to_be_hidden()
    for width in (320, 390, 768, 1440):
        page.set_viewport_size({'width': width, 'height': 900})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Overflow at {width}'
    page.set_viewport_size({'width': 390, 'height': 844})
    page.goto(BASE + '/miniapp.html', wait_until='networkidle')
    expect(page.locator('.mini-service')).to_have_count(9)
    page.locator('[data-filter="print"]').click()
    expect(page.locator('.mini-service')).to_have_count(1)
    expect(page.locator('.mini-service')).to_contain_text('25')
    page.locator('.mini-service').click()
    page.locator('#order-device').fill('Печать А4')
    page.locator('#order-details').fill('10 страниц')
    page.evaluate('window.open = (url) => { window.openedTelegram = url; return null; }')
    page.locator('#order-submit').click()
    url = urlsplit(page.evaluate('window.openedTelegram'))
    assert url.hostname == 't.me' and url.path == '/DeviceWorkshop'
    text = parse_qs(url.query)['text'][0]
    assert '10 страниц' in text and 'Здравствуйте, Тигран!' in text
    expect(page.locator('#message-fallback')).to_be_visible()
    expect(page.locator('#prepared-message')).to_have_value(text)
    for name in ('miniapp.html', 'articles.html', 'privacy.html'):
        page.goto(BASE + '/' + name, wait_until='networkidle')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), name
    page.goto(BASE + '/articles.html')
    expect(page.locator('article')).to_have_count(4)
    assert not errors, errors
    browser.close()
print('PASS: mobile navigation, dialog, cookie preference, responsive widths, catalog, Telegram draft, articles, privacy; no JavaScript errors')
