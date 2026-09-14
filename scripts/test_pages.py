"""
测试前端各模块页面渲染（用 Playwright headless）
输出每个页面的 console 错误 + 主要 DOM 元素是否存在
"""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173"
ROUTES = ["today", "quant", "news", "arxiv", "school", "leetcode", "english", "finance", "github", "deals"]

def main():
    issues = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        console_errors = []
        page.on("console", lambda msg: console_errors.append(f"[{msg.type}] {msg.text}") if msg.type == "error" else None)
        page.on("pageerror", lambda err: console_errors.append(f"[pageerror] {err}"))

        for route in ROUTES:
            console_errors.clear()
            url = f"{BASE}/#{route}"
            try:
                page.goto(url, wait_until="networkidle", timeout=10000)
                # 用可见 view 的标题
                page.wait_for_selector(".view:not([hidden]) .module-title", timeout=5000)
                title = page.text_content(".view:not([hidden]) .module-title")
                # 等待 view-content 有内容（不是 skeleton）
                page.wait_for_function(
                    "() => { const v = document.querySelector('.view:not([hidden]) .view-content'); return v && v.children.length > 0 && !v.querySelector('.skeleton'); }",
                    timeout=5000,
                )
                # 数渲染出来的元素
                items = page.eval_on_selector_all(".view:not([hidden]) .list-item, .view:not([hidden]) .q-card, .view:not([hidden]) .section-card, .view:not([hidden]) .word-card, .view:not([hidden]) .phrase-card, .view:not([hidden]) .stat-card",
                                                  "els => els.length")
                err_count = len(console_errors)
                print(f"  {route:10s} title='{title.strip()}' items={items} err={err_count}")
                if err_count:
                    for e in console_errors[:5]:
                        print(f"     ! {e}")
                    issues.append(route)
            except Exception as e:
                print(f"  {route:10s} FAILED: {e}")
                issues.append(route)

        # 测试移动端
        print("\n--- Mobile (375x812) ---")
        mobile = context.new_page()
        mobile_errors = []
        mobile.on("pageerror", lambda err: mobile_errors.append(str(err)))
        for route in ["today", "quant", "leetcode"]:
            try:
                mobile.set_viewport_size({"width": 375, "height": 812})
                mobile.goto(f"{BASE}/#{route}", wait_until="networkidle", timeout=10000)
                mobile.wait_for_selector(".view:not([hidden]) .module-title", timeout=5000)
                title = mobile.text_content(".view:not([hidden]) .module-title")
                print(f"  {route:10s} title='{title.strip()}'")
            except Exception as e:
                print(f"  {route:10s} FAILED: {e}")
                issues.append(f"mobile-{route}")

        # 测试暗色
        print("\n--- Dark theme ---")
        page.goto(f"{BASE}/#today", wait_until="networkidle")
        page.evaluate("document.documentElement.dataset.theme = 'dark'")
        bg = page.evaluate("getComputedStyle(document.body).backgroundColor")
        print(f"  body bg in dark mode: {bg}")

        browser.close()

    if issues:
        print(f"\n❌ 失败路由: {issues}")
        sys.exit(1)
    print("\n✓ 全部通过")


if __name__ == "__main__":
    main()
