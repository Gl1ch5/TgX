from playwright.sync_api import sync_playwright

def verify(page):
    page.goto("http://localhost:8081/")
    # Force bypass auth for UI preview
    page.evaluate("app.showView('main')")
    page.evaluate("document.getElementById('feed-container').innerHTML = render.feed([{id: 1, channel: {title: 'Test Channel'}, date: Date.now()/1000, text: 'Hello world', replies: 5, views: 100, reactions: {results: [{reaction: '👍', count: 10}]}}])")
    page.wait_for_timeout(1000)
    page.screenshot(path="verification_main.png", full_page=True)

    # Check thread
    page.evaluate("app.openThread(1, 1)")
    page.evaluate("document.getElementById('comments-container').innerHTML = render.comments([{id: 2, author: {title: 'User 1'}, date: Date.now()/1000, text: 'Great post!'}])")
    page.wait_for_timeout(1000)
    page.screenshot(path="verification_thread.png", full_page=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    verify(page)
    browser.close()
