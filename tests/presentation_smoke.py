"""Exercise the animated site, gallery, bot links and indexable metadata."""
import json
import os
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('SITE_URL', 'http://127.0.0.1:8080').rstrip('/')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    page = context.new_page()
    errors = []
    failed_assets = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('response', lambda response: failed_assets.append(response.url) if response.status >= 400 and response.url.startswith(BASE) else None)
    page.goto(BASE, wait_until='networkidle')
    page.locator('#cookie-dismiss').click()
    expect(page.locator('.bot-main-link')).to_have_attribute('href', 'https://t.me/DeviceWorkshop_bot?start=website')
    expect(page.locator('[data-gallery]')).to_have_count(8)
    page.locator('.gallery-photo').first.click()
    expect(page.locator('#gallery-dialog')).to_be_visible()
    expect(page.locator('.gallery-count')).to_have_text('1 / 8')
    expect(page.locator('#gallery-dialog img')).to_have_attribute('src', BASE + '/assets/workshop/interior.jpg')
    page.keyboard.press('ArrowRight')
    expect(page.locator('.gallery-count')).to_have_text('2 / 8')
    page.keyboard.press('Escape')
    expect(page.locator('#gallery-dialog')).to_be_hidden()
    page.locator('.promo-gallery summary').click()
    expect(page.locator('.promo-grid')).to_be_visible()
    page.locator('.promo-grid a').first.click()
    expect(page.locator('.gallery-count')).to_have_text('3 / 8')
    page.locator('.gallery-close').click()
    for width in (320, 390, 768, 1024, 1120, 1200, 1440):
        page.set_viewport_size({'width': width, 'height': 900})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Homepage overflow at {width}'
    page.set_viewport_size({'width': 390, 'height': 844})
    page.locator('#contacts').scroll_into_view_if_needed()
    page.locator('.menu-toggle').click()
    expect(page.locator('#mobile-nav')).to_be_in_viewport()
    page.locator('#mobile-nav a[href="#telegram"]').click()
    expect(page.locator('#mobile-nav')).to_be_hidden()
    business = json.loads(page.locator('script[type="application/ld+json"]').text_content())
    assert business['address']['streetAddress'] == 'проспект Куприна, 34, корпус 2'
    assert len(business['hasOfferCatalog']['itemListElement']) == 9
    assert page.locator('meta[property="og:image"]').get_attribute('content').endswith('/assets/og-cover.png')
    page.goto(BASE + '/articles.html', wait_until='networkidle')
    expect(page.locator('article')).to_have_count(8)
    expect(page.locator('.article-cover')).to_have_count(8)
    schema = json.loads(page.locator('script[type="application/ld+json"]').text_content())
    assert len(schema['hasPart']) == 8
    for article in page.locator('article').all():
        article.scroll_into_view_if_needed()
        assert article.locator('img').evaluate('(image) => image.complete && image.naturalWidth > 0')
    for width in (320, 390, 768, 1440):
        page.set_viewport_size({'width': width, 'height': 900})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Journal overflow at {width}'
    page.emulate_media(reduced_motion='reduce')
    page.goto(BASE, wait_until='networkidle')
    assert page.locator('.phone').evaluate('(element) => getComputedStyle(element).animationName') == 'none'
    assert not errors, errors
    assert not failed_assets, failed_assets
    browser.close()
print('PASS: bot links, 8-image gallery, keyboard controls, sticky mobile menu, responsive layout, local metadata, 8 illustrated articles and reduced motion')
