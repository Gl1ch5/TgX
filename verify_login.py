from playwright.sync_api import sync_playwright

def verify(page):
    page.goto("http://localhost:8081/")
    page.wait_for_timeout(2000)
    page.screenshot(path="verification_login.png", full_page=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    verify(page)
    browser.close()
