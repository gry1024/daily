#!/usr/bin/env python3
"""
测试 AI-Search 项目的所有 RSS 源在当前服务器的可达性
"""
import re
import subprocess
import json

SOURCES = """[1] https://openai.com/news/rss.xml
[1] https://news.google.com/rss/search?q=site:anthropic.com&hl=en-US&gl=US&ceid=US:en
[1] https://news.google.com/rss/search?q=site:ai.meta.com&hl=en-US&gl=US&ceid=US:en
[1] https://blog.google/technology/ai/rss/
[1] https://deepmind.google/blog/rss.xml
[1] https://research.google/blog/rss/
[1] https://blogs.nvidia.com/feed/
[1] https://huggingface.co/blog/feed.xml
[1] https://mistral.ai/rss.xml
[1] https://cohere.com/blog/rss.xml
[1] https://qwenlm.github.io/blog/index.xml
[1] https://machinelearning.apple.com/rss.xml
[1] https://bair.berkeley.edu/blog/feed.xml
[1] https://news.mit.edu/topic/mitartificial-intelligence2-rss.xml
[1] https://www.microsoft.com/en-us/research/feed/
[2] https://aws.amazon.com/blogs/machine-learning/feed/
[2] https://www.theverge.com/rss/ai-artificial-intelligence/index.xml
[2] https://techcrunch.com/category/artificial-intelligence/feed/
[2] https://venturebeat.com/category/ai/feed/
[2] https://arstechnica.com/ai/feed/
[2] https://www.technologyreview.com/topic/artificial-intelligence/feed
[2] https://www.wired.com/feed/tag/ai/latest/rss
[2] https://the-decoder.com/feed/
[2] https://www.marktechpost.com/feed/
[2] https://semianalysis.com/feed/
[2] https://news.smol.ai/rss.xml
[2] https://tldr.tech/api/rss/ai
[2] https://simonwillison.net/atom/everything/
[2] https://lilianweng.github.io/index.xml
[2] https://magazine.sebastianraschka.com/feed
[2] https://thegradient.pub/rss/
[2] https://jack-clark.net/feed/
[2] https://www.interconnects.ai/feed
[2] https://www.latent.space/feed
[2] https://www.oneusefulthing.org/feed
[2] https://www.bensbites.com/feed
[3] https://www.qbitai.com/feed
[3] https://36kr.com/feed
[3] https://www.infoq.cn/feed
[3] https://sspai.com/feed
[3] https://www.ithome.com/rss/"""

results = {"ok": [], "blocked": [], "timeout": [], "404": [], "other": []}

for line in SOURCES.strip().split("\n"):
    m = re.match(r"\[(\d)\] (.+)", line)
    if not m:
        continue
    tier = m.group(1)
    url = m.group(2)
    try:
        import os
        if os.path.exists("/tmp/probe_out"):
            os.remove("/tmp/probe_out")
        r = subprocess.run(
            ["curl", "-sL", "-m", "8", "-A", "Mozilla/5.0", "-o", "/tmp/probe_out", "-w", "%{http_code}", url],
            capture_output=True, text=True, timeout=10
        )
        code = int(r.stdout.strip()) if r.stdout.strip().isdigit() else 0
        # 检查 body 长度
        try:
            import os
            size = os.path.getsize("/tmp/probe_out")
            # 检查是否像 RSS (含 <rss 或 <feed)
            with open("/tmp/probe_out", "rb") as f:
                head = f.read(500).decode("utf-8", errors="ignore").lower()
            is_rss = "<rss" in head or "<feed" in head or "atom" in head
        except:
            size = 0
            is_rss = False

        if 200 <= code < 300 and is_rss and size > 500:
            results["ok"].append((tier, url, f"{code}/{size}B"))
        elif code == 404:
            results["404"].append((tier, url, code))
        elif code in (403, 401):
            results["blocked"].append((tier, url, code))
        else:
            results["other"].append((tier, url, f"{code}/{size}B"))
    except subprocess.TimeoutExpired:
        results["timeout"].append((tier, url, 0))
    except Exception as e:
        results["other"].append((tier, url, str(e)[:20]))

print(f"\n✓ 可用 ({len(results['ok'])}):")
for t, u, c in results["ok"]:
    print(f"  [{t}] {c} {u}")

print(f"\n✗ 超时 ({len(results['timeout'])}):")
for t, u, c in results["timeout"]:
    print(f"  [{t}]    {u}")

print(f"\n✗ 404 ({len(results['404'])}):")
for t, u, c in results["404"]:
    print(f"  [{t}] {c} {u}")

print(f"\n✗ 被墙/拒绝 ({len(results['blocked'])}):")
for t, u, c in results["blocked"]:
    print(f"  [{t}] {c} {u}")

print(f"\n✗ 其它 ({len(results['other'])}):")
for t, u, c in results["other"]:
    print(f"  [{t}] {c} {u}")
