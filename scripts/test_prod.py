"""
测试生产环境 https://autotreehole.cn/daily/ 全部路由
"""
import sys
from playwright.sync_api import sync_playwright

BASE = "https://autotreehole.cn/daily"
ROUTES = ["today", "quant", "news", "arxiv", "school", "leetcode", "english", "finance", "github", "deals"]

def main():
    issues = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))

        for route in ROUTES:
            errs.clear()
            try:
                page.goto(f"{BASE}/#{route}", wait_until="networkidle", timeout=15000)
                page.wait_for_selector(".view:not([hidden]) .module-title", timeout=5000)
                title = page.text_content(".view:not([hidden]) .module-title")
                page.wait_for_function(
                    "() => { const v = document.querySelector('.view:not([hidden]) .view-content'); return v && v.children.length > 0 && !v.querySelector('.skeleton'); }",
                    timeout=8000,
                )
                items = page.eval_on_selector_all(
                    ".view:not([hidden]) .list-item, .view:not([hidden]) .q-card, .view:not([hidden]) .section-card, .view:not([hidden]) .word-card, .view:not([hidden]) .phrase-card, .view:not([hidden]) .stat-card",
                    "els => els.length",
                )
                print(f"  {route:10s} title='{title.strip()}' items={items} err={len(errs)}")
                if errs:
                    for e in errs[:3]: print(f"     ! {e}")
                    issues.append(route)
            except Exception as e:
                print(f"  {route:10s} FAILED: {e}")
                issues.append(route)

        # 移动端
        print("\n--- Mobile (375x812) ---")
        m = ctx.new_page()
        for route in ["today", "quant", "leetcode", "deals"]:
            try:
                m.set_viewport_size({"width": 375, "height": 812})
                m.goto(f"{BASE}/#{route}", wait_until="networkidle", timeout=15000)
                m.wait_for_selector(".view:not([hidden]) .module-title", timeout=5000)
                title = m.text_content(".view:not([hidden]) .module-title")
                print(f"  {route:10s} title='{title.strip()}'")
            except Exception as e:
                print(f"  {route:10s} FAILED: {e}")
                issues.append(f"mobile-{route}")

        # 暗色
        print("\n--- Dark theme ---")
        page.goto(f"{BASE}/#today", wait_until="networkidle")
        page.evaluate("document.documentElement.dataset.theme = 'dark'")
        bg = page.evaluate("getComputedStyle(document.body).backgroundColor")
        print(f"  body bg: {bg}")

        # 截图首页
        print("\n--- Screenshot today ---")
        page.evaluate("document.documentElement.dataset.theme = 'light'")
        page.set_viewport_size({"width": 1280, "height": 1600})
        page.goto(f"{BASE}/#today", wait_until="networkidle")
        page.wait_for_selector(".view:not([hidden]) .module-title", timeout=5000)
        page.wait_for_timeout(1000)
        page.screenshot(path="/tmp/daily_today.png", full_page=True)
        print("  saved /tmp/daily_today.png")

        browser.close()

    if issues:
        print(f"\n❌ 失败: {issues}")
        sys.exit(1)
    print("\n✓ 全部通过")


if __name__ == "__main__":
    main()
