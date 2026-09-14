"""测试 School + Quant MD 渲染"""
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173"

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 1900})
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append(f"console:{m.type}:{m.text[:80]}") if m.type == "error" else None)

    # School page
    print("=== School ===")
    page.goto(f"{BASE}/#school", wait_until="networkidle")
    page.wait_for_selector(".view:not([hidden]) .module-title", timeout=5000)
    page.wait_for_timeout(2000)
    page.screenshot(path="/tmp/school_v3.png", full_page=True)
    items = page.eval_on_selector_all(".list-item", "els => els.length")
    print(f"  list items: {items}")

    # Click "添加活动"
    page.click("#add-event")
    page.wait_for_selector(".detail-overlay.detail-show", timeout=3000)
    page.screenshot(path="/tmp/school_add.png", full_page=False)
    print("  add form opened")
    page.click(".detail-close")
    page.wait_for_timeout(300)

    # Open one event detail
    page.click(".list-item")
    page.wait_for_selector(".detail-overlay.detail-show", timeout=3000)
    page.wait_for_timeout(500)
    page.screenshot(path="/tmp/school_detail.png", full_page=False)
    print("  event detail opened")
    page.click(".detail-close")
    page.wait_for_timeout(300)

    # Quant detail with MD
    print("\n=== Quant detail (MD render) ===")
    page.goto(f"{BASE}/#quant", wait_until="networkidle")
    page.wait_for_timeout(1500)
    page.click(".q-card .q-action-reveal")
    page.wait_for_selector(".detail-overlay.detail-show", timeout=3000)
    page.wait_for_timeout(1000)
    page.screenshot(path="/tmp/quant_md.png", full_page=False)
    print("  quant detail opened")
    # 检查 markdown 渲染
    pre_count = page.eval_on_selector_all(".detail-body pre", "els => els.length")
    code_count = page.eval_on_selector_all(".detail-body code", "els => els.length")
    h3_count = page.eval_on_selector_all(".detail-body h3", "els => els.length")
    print(f"  pre={pre_count} code={code_count} h3={h3_count}")

    if errs:
        print(f"\nERRORS:")
        for e in errs[:5]: print(f"  {e[:100]}")

    browser.close()
print("done")
