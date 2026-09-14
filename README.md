# AutoTreehole Daily

> 个人每日信息中枢。每天凌晨自动汇总 9 类信息（量化题 / AI 新闻 / Arxiv / 北大动态 / LeetCode / 英语 / 财经 / GitHub / 羊毛），打开 `autotreehole.cn/daily` 一页扫完。

🌐 <https://autotreehole.cn/daily>

---

## 理念

量化 / LLM 研究生的每天早上，要刷的东西实在太多：arxiv 邮件、AI 新闻推特、LeetCode 每日一题、北大通知、量化面试题、学生羊毛、GitHub trending、英语单词……每个都是孤岛，每个都散在各处，**信息过载但信息密度低**。

这个站点的存在意义：**把"该看的"和"值得看的"做一次集中过滤**，把"信噪比"提到极限。每天凌晨 5 点，后台自动跑完所有抓取 + LLM 摘要 + 去重 + 时效校验；早上 8 点邮件推一份摘要；白天任何时候打开浏览器，每个模块都已经按你的研究方向排好序、按"今天最相关"过滤完毕。

不做用户系统、不做评论、不做推荐算法、不做社交分享。**纯净的个人信息流。**

---

## 功能模块

| 模块 | 功能 |
|------|------|
| **今日** | 最新一轮所有模块新增内容聚合 |
| **Quant 每日一题** | 来自红宝书 / 绿宝书的量化面试题 + 解析 |
| **AI News** | OpenAI / Anthropic / DeepMind / 机器之心 等每日新闻摘要 |
| **Arxiv 论文** | 量化 / LLM / agent 方向每日筛选论文 + 中文摘要 |
| **School Info** | 北大 / 清华 / 信科 / AIIC 的当日通知与活动 |
| **LeetCode Hot 100** | 每日一题 + 完整题解 |
| **English** | 10 词 + 5 短语，按 CET-6 ~ 雅思 难度 |
| **Finance Daily** | XAUUSD / BTCUSD 等关键行情 + 财经要闻 |
| **GitHub Trending** | 当日热门项目 + 智能精选 |
| **羊毛 Deals** | 当日可领的学生福利 / 免费额度 / 限时活动 |

> 数据每凌晨 5:00 自动更新，邮件摘要每早 8:00 推送。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 抓取 | RSS + arxiv API + requests scrape |
| 后端 | Python 3.10 + FastAPI + SQLite |
| LLM | minimax-m3（内容摘要 / 过滤 / 翻译） |
| 前端 | 原生 HTML / CSS / JS（Apple 极简） |
| 调度 | cron + shell 并发 |
| 邮件 | QQ 邮箱 SMTP |
| 部署 | nginx `/daily/` 子路径 + PM2 + Let's Encrypt |

> 完整设计逻辑、接口契约、数据架构见 [PLAN.md](./PLAN.md)。

---

## 本地复现

```bash
git clone https://github.com/gry1024/daily.git
cd daily
cp .env.example .env
# 编辑 .env，至少填入：MINIMAX_API_KEY、QQ_EMAIL、QQ_EMAIL_AUTH_CODE
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# 初始化数据库 + 灌种子数据
python scripts/init_db.py

# 起后端
uvicorn backend.app:app --reload --port 8001

# 起前端（另一个终端）
cd frontend && python3 -m http.server 5173
```

打开 `http://127.0.0.1:5173/`，前端会通过 CORS 调 `127.0.0.1:8001` 的 API。

---

## 项目结构

```
daily/
├── backend/          # FastAPI 后端
├── frontend/         # 单页应用
├── cron/             # 9 个抓取脚本 + 主调度
├── data/             # SQLite + 种子数据
├── nginx/            # nginx 配置片段
├── scripts/          # 部署 / 备份 / 邮件 / 初始化
├── PLAN.md           # 完整开发计划
├── QUESTIONS.md      # 设计决策记录
└── VibeCoding-Scaffold/  # 开发流程与设计系统参考
```

---

## 安全设计

- 所有密钥存 `.env`，已被 `.gitignore` 忽略
- 后端监听 127.0.0.1，仅 nginx 反代可达
- SQL 全部参数化（sqlite3 命名占位符）
- 用户内容渲染走 DOMPurify
- API 限流（slowapi，60 req/min/IP）
- 邮件授权码独立（不与登录密码共用）

---

## 许可

仅供个人学习与生活使用。
