"""Check the real logo, larger text, saved reading preferences and narrow screens."""
import os
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('SITE_URL', 'http://127.0.0.1:8080').rstrip('/')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE, wait_until='networkidle')
    expect(page.locator('.header .brand-name')).to_have_text('Device')
    expect(page.locator('.header .brand-sub')).to_have_text('Workshop')
    assert page.locator('.header .brand-logo').evaluate('(image) => image.complete && image.naturalWidth > 0')
    assert page.locator('.hero-description').evaluate('(element) => parseFloat(getComputedStyle(element).fontSize)') >= 18
    page.get_by_role('button', name='Сделать текст ещё крупнее').click()
    assert page.locator('.hero-description').evaluate('(element) => parseFloat(getComputedStyle(element).fontSize)') >= 21
    page.get_by_role('button', name='Пауза анимаций', exact=True).click()
    assert page.locator('.living-logo img').evaluate('(element) => getComputedStyle(element).animationName') == 'none'
    page.reload(wait_until='networkidle')
    expect(page.locator('html')).to_have_class('large-text motion-paused')
    for name in ['', '/articles.html', '/miniapp.html', '/privacy.html']:
        page.goto(BASE + name, wait_until='networkidle')
        expect(page.locator('html')).to_have_class('large-text motion-paused')
        for width in (320, 390, 768, 1024, 1440):
            page.set_viewport_size({'width': width, 'height': 900})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Large-text overflow: {name or "home"} at {width}'
    page.goto(BASE, wait_until='networkidle')
    page.set_viewport_size({'width': 390, 'height': 844})
    page.get_by_role('button', name='Вернуть обычный крупный текст').click()
    page.get_by_role('button', name='Анимации выключены', exact=True).click()
    page.emulate_media(reduced_motion='reduce')
    expect(page.get_by_role('button', name='Анимации выключены', exact=True)).to_be_disabled()
    assert page.locator('.living-logo img').evaluate('(element) => getComputedStyle(element).animationName') == 'none'
    assert not errors, errors
    browser.close()
print('PASS: supplied logo, larger body text, persistent text size and animation controls, reduced motion, no overflow on 4 pages at 320–1440px')
