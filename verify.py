from playwright.sync_api import sync_playwright

def verify(page):
    page.goto("http://localhost:8081/html/index.html")
    page.wait_for_timeout(3000) # Wait a bit for JS to load
    page.screenshot(path="verification.png", full_page=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    verify(page)
    browser.close()
