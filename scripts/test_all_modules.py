"""全面测试所有模块的新功能"""
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173"
ROUTES = ["today", "quant", "news", "arxiv", "school", "leetcode", "english", "finance", "github", "deals"]

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 1600})
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))

    for route in ROUTES:
        errs.clear()
        try:
            page.goto(f"{BASE}/#{route}", wait_until="networkidle", timeout=15000)
            page.wait_for_selector(".view:not([hidden]) .module-title", timeout=5000)
            page.wait_for_function(
                "() => { const v = document.querySelector('.view:not([hidden]) .view-content'); return v && v.children.length > 0 && !v.querySelector('.skeleton'); }",
                timeout=8000,
            )
            title = page.text_content(".view:not([hidden]) .module-title").strip()
            # 检查各模块特有元素
            stats = page.eval_on_selector_all(".stat-group", "els => els.length")
            chips = page.eval_on_selector_all(".filter-chip", "els => els.length")
            lists = page.eval_on_selector_all(
                ".view:not([hidden]) .list-item, .view:not([hidden]) .q-card, .view:not([hidden]) .section-card, .view:not([hidden]) .word-card, .view:not([hidden]) .phrase-card, .view:not([hidden]) .stat-card, .view:not([hidden]) .flashcard",
                "els => els.length"
            )
            print(f"  {route:10s} title='{title.strip()}' stats={stats} chips={chips} items={lists} err={len(errs)}")
            if errs:
                for e in errs[:2]: print(f"     ! {e[:80]}")
        except Exception as e:
            print(f"  {route:10s} FAILED: {e}")

    # 截图各模块
    print("\n--- Screenshots ---")
    for route in ["today", "quant", "leetcode", "english", "finance"]:
        page.goto(f"{BASE}/#{route}", wait_until="networkidle")
        page.wait_for_selector(".view:not([hidden]) .module-title")
        page.wait_for_timeout(1500)
        page.screenshot(path=f"/tmp/{route}_v2.png", full_page=True)
        print(f"  /tmp/{route}_v2.png")

    browser.close()
print("done")
