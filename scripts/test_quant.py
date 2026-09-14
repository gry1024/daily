"""测试 Quant 模块的新功能"""
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 1600})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))

    page.goto(f"{BASE}/#quant", wait_until="networkidle")
    page.wait_for_selector(".view:not([hidden]) .module-title", timeout=5000)
    page.wait_for_function(
        "() => !document.querySelector('.view:not([hidden]) .view-content').querySelector('.skeleton')",
        timeout=8000,
    )

    # 截图
    page.screenshot(path="/tmp/quant_v1.png", full_page=True)

    # 测试功能
    print(f"title: {page.text_content('.view:not([hidden]) .module-title').strip()}")
    print(f"errs: {len(errs)}")

    # 检查统计卡
    stats = page.eval_on_selector_all('.stat-group .stat-card', 'els => els.length')
    print(f"stat cards: {stats}")

    # 检查题目卡
    qcard = page.query_selector('.q-card')
    if qcard:
        title = page.text_content('.q-card .q-body').strip()[:60]
        print(f"question: {title}")
        btns = page.eval_on_selector_all('.q-card .q-actions button', 'els => els.map(e => e.textContent.trim())')
        print(f"buttons: {btns}")

        # 点击"看解析"
        page.click('.q-card .q-action-reveal')
        page.wait_for_selector('.detail-overlay.detail-show', timeout=3000)
        print(f"detail panel opened")
        page.screenshot(path="/tmp/quant_detail.png", full_page=False)

        # 关闭
        page.click('.detail-close')
        page.wait_for_timeout(400)

        # 点击"标记掌握"
        page.click('.q-card .q-action-solve')
        page.wait_for_timeout(500)
        solved_text = page.text_content('.q-card .q-action-solve').strip()
        print(f"after solve: '{solved_text}'")

    # 点击筛选
    chips = page.eval_on_selector_all('.filter-chip', 'els => els.length')
    print(f"filter chips: {chips}")

    browser.close()

print("OK")
