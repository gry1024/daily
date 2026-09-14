# AutoTreehole Daily 开发计划

> 目标域名：`autotreehole.cn/daily`
> 计划时间：2026-09
> 文档版本：v0.1（待你修改）

---

## 0. 阅读清单（已读完）

| 文件 | 关键信息 |
|---|---|
| `重要密钥信息开发可用.txt` | 阿里云 root@118.178.145.162:13522 / GitHub `gry1024` + PAT / QQ 邮箱 2430347329@qq.com + 授权码 / 全站 LLM 用 minimax-m3 |
| `VibeCoding-Scaffold/dev-workflow.md` | 三阶段流程（立项→本地 MVP→迭代循环）/ AGENT.md 模板 / Spec 模板 / 部署哲学（推代码→重启→验证→监控） |
| `VibeCoding-Scaffold/frontend-design-system.md` | Apple 极简设计系统（CSS 变量、13 个组件、响应式、暗色、动效），**这是 AutoTreehole 既有项目的设计资产** |
| 本地环境 | Python 3.10.12、Node v24.19.0、git、cron 均可用 |

> ⚠️ **待确认事项（不影响动笔，写代码前请给我一句话答复）**
> 1. `autotreehole.cn/daily` 是作为**既有 AutoTreehole 的子路径**（设计系统已经为它存在），还是作为**全新独立站点**部署在同一台服务器上？我默认按"独立站点、单独一个 repo、单独一个 nginx location + 反代后端"来做，因为 9 个模块逻辑独立、不与树洞共享用户体系。
> 2. 服务器上是否已有 Python 3.11+ / Node 18+ / nginx / SQLite CLI？没有的话我用 apt + pip 全装。

---

## 1. 项目定位

### 一句话
> 给北大信科智能专业、对量化/LLM 有研究兴趣的高年级学生做的**每日信息中枢**：每天凌晨自动汇总他需要看的 9 类信息（算法题 / 量化题 / 羊毛 / 英语 / AI 新闻 / 校内活动 / 财经 / 论文 / GitHub），白天只需打开一个页面就能扫完。

### 为什么值得做
- 公开 API + 公开新闻流已经被各种脚本抓烂，但**没有任何一个工具把"信科生每天要看的东西"打包**——他要自己刷 GitHub trending、自己翻 arxiv、自己盯学生福利、自己翻学校通知，碎片化极严重。
- 这个站点把"信息获取 → 过滤 → 去重 → 时效管理 → 摘要"全交给后端，把"按个人兴趣排序"这一层用 LLM 做掉，最终只剩"打开 → 扫一眼 → 关掉"。

### 不做的事（防画蛇添足）
- ❌ 不做用户体系（个人站，cookie 存偏好即可）
- ❌ 不做评论 / 点赞 / 关注 / 推送
- ❌ 不做付费墙、广告、统计埋点
- ❌ 不做"猜你喜欢"算法（他不需要被算法调教）
- ❌ 不做移动 App（PWA 足够，浏览器加桌面即可）
- ❌ 不做深度的实时行情（财经模块只要"今日要闻 + 关键价"）

### 核心闭环
```
05:00  cron 唤醒 9 个抓取脚本
  ↓ 并行执行（每模块一个 Python 脚本）
  ↓ WebSearch / 官方 API / RSS
  ↓ 内容去重 + 时效校验
  ↓ minimax-m3 摘要 / 翻译 / 重组
  ↓ 写入 SQLite
06:00  邮件推送（可选）当日摘要
  ↓
全天    浏览器打开 autotreehole.cn/daily，侧边栏 9 个模块，刷新即看
```

---

## 2. 模块排序（个人向价值评分）

> 不是按你列的顺序。评分维度：**与研究方向相关度 × 日常使用频次 × 信息获取门槛**。

| # | 模块 | 排序依据 | 在侧边栏的位置 |
|---|------|---------|--------------|
| 1 | **Quant 每日一题** | 他的研究方向是 LLM 因子挖掘，量化是核心场景；外部题库碎片化严重，自建题库价值极高 | 顶部第 1 位 |
| 2 | **AI News** | LLM 行业每日变动剧烈，是研究选题与职业雷达 | 第 2 位 |
| 3 | **Arxiv 论文** | 直接对接他的研究（因子挖掘 / agent / LLM 前沿）；自己刷太累 | 第 3 位 |
| 4 | **School Info（PKU）** | 大三正处保研关键期 + 留学交换 + 校内活动窗口；公众号/官网分散 | 第 4 位 |
| 5 | **LeetCode Hot 100** | 算法基础 + 求职 / 推免机考通用；价值稳定 | 第 5 位 |
| 6 | **English** | 读 paper / 留学交换 / 推免面试都需要；CET-6 583 中等偏上，需要持续输入 | 第 6 位 |
| 7 | **Finance Daily** | 量化背景日常关注（含 XAUUSD / BTCUSD 行情）；不必深入 | 第 7 位 |
| 8 | **GitHub Trending** | 技术雷达 + 工具发现；频次低不必天天刷 | 第 8 位 |
| 9 | **羊毛 Deals** | 实用但频次低；放最下面作为"工具箱" | 第 9 位（可折叠） |

**侧边栏交互**：默认展开前 5 个，后 4 个折叠为"更多"，避免视觉过载。模块可拖拽排序，结果写 `localStorage`。

---

## 3. 模块详细设计

> 每个模块给出：**数据源 → 抓取策略 → LLM 处理 → 存储 → 展示 → 去重 / 过期 → API**。

### 通用约定

- **日期字段**：每条内容带 `publish_date`（数据源时间）和 `fetched_at`（抓取时间），前端只显示 `publish_date`。
- **去重键**：模块级 `dedup_key`（hash 标题+URL 或固定 ID），同 key 不重复入库。
- **过期策略**：每模块独立 TTL（详见各节），cron 第一步 `DELETE WHERE expires_at < now()`。
- **展示分页**：每模块首页只显示最近 3-7 条，看历史走"更多"。

---

### 模块 1 · Quant 每日一题

**定位**：每天 1 题，覆盖绿宝书（《Heard on the Street》）、红宝书（《A Practical Guide to Quantitative Finance Interviews》）、绿皮书数理统计、brain teaser、概率/统计硬题。

**数据源**
- **题库优先**：把红宝书 / 绿宝书的题目录入到 `quant_questions` 表（题目、答案、解析、难度、来源、原始页码），约 200-400 题，是 1 年的存量。
- **网络补充**：每周 3 次（周一/三/五）WebSearch `"quant interview brain teaser" "Mark Joshi" "Paul Wilmott"` 拉新题，LLM 改写为中文+配解析。
- **冷启动**：从 GitHub 开源题库（如 `wilsonfreitas/awesome-quant`、知名 repo 的 md 文件）一次性灌入一批。

**抓取策略**
- `cron/daily_quant.py`：
  1. 选今天要出的题：`SELECT * FROM quant_questions ORDER BY last_shown_at ASC NULLS FIRST LIMIT 1`（最少出现的优先），用确定性伪随机（`hash(date+seed)`）打散顺序。
  2. 若今日是周一/三/五，补搜 1 题入库：`INSERT INTO quant_questions (...)`。
  3. 写入 `daily_quant`（date 唯一）。

**LLM 处理**
- 每次 `INSERT` 时调用 minimax-m3 生成：中文题目、英文原文、答案、3 段解析（思路 → 数学推导 → 拓展），避免手敲答案。
- 已存在的题目不再调 LLM。

**存储**
```sql
CREATE TABLE quant_questions (
  id INTEGER PRIMARY KEY,
  source TEXT,                  -- 'red_book' / 'green_book' / 'web'
  difficulty INTEGER,           -- 1-5
  question_en TEXT,
  question_zh TEXT,
  answer TEXT,
  solution_md TEXT,             -- markdown
  tags TEXT,                    -- 'probability,brain_teaser'
  last_shown_at DATE,
  created_at TIMESTAMP
);

CREATE TABLE daily_quant (
  date DATE PRIMARY KEY,
  question_id INTEGER REFERENCES quant_questions(id),
  user_attempts INTEGER DEFAULT 0,  -- 留作未来扩展
  user_score INTEGER DEFAULT 0
);
```

**展示**
- 默认折叠答案：题目卡片 → 点击"展开解析"。
- 显示来源徽章（红宝书 / 绿宝书 / web）、难度星级、tags。
- 支持"再来一题"（手动换一道，不影响 daily_quant）。

**去重 / 过期**
- 不过期；题库循环展示，但保证相邻 7 天不重复。

**API**
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/quant/today` | GET | 今日题（不返回答案字段） |
| `/api/quant/<id>/reveal` | GET | 答案+解析 |
| `/api/quant/random` | GET | 换一题 |

---

### 模块 2 · AI News

**定位**：每天 8-12 条，覆盖产品发布 / 融资 / 论文级技术 / 大牛观点。

**数据源（混合策略，时效为先）**
- **官方 RSS / changelog**：OpenAI Blog RSS、Anthropic News、Google DeepMind Blog、X.AI Blog、Hugging Face Blog、Meta AI Blog。
- **二手聚合**：机器之心 SOTA 资讯 RSS、量子位首页抓取、The Decoder RSS、VentureBeat AI 板块。
- **搜索补盲**：WebSearch `AI 新闻 2026-XX-XX`（中英文各 1 次），LLM 提取事件级条目。
- **大牛 X (Twitter)**：通过 `nitter.net/<user>/rss` 抓取（如果挂了换其他 mirror）。关注列表：sama / DarioA / demishassabis / ylecun / karpathy / AndrewYNg / 极客公园 等。

**抓取策略**
- `cron/daily_ai_news.py`：
  1. 拉所有 RSS（feedparser）。
  2. WebSearch 中英文各 1 次（仅取当日）。
  3. 每条原始 item 喂 minimax-m3 抽取 5 字段：标题（中文）、摘要（50-100 字）、分类（产品/融资/技术/观点）、重要度（1-3 星）、情绪（看多/中性/看空）。
  4. 写库 + 去重（url hash）。

**存储**
```sql
CREATE TABLE ai_news (
  id INTEGER PRIMARY KEY,
  publish_date DATE,
  source TEXT,            -- 'openai_blog' / 'qbitai' / 'web_search' / 'twitter'
  url TEXT UNIQUE,        -- 去重键
  title_zh TEXT,
  summary_zh TEXT,
  category TEXT,          -- product/funding/research/opinion
  importance INTEGER,     -- 1-3
  sentiment TEXT,
  raw_title TEXT,
  raw_content TEXT,
  created_at TIMESTAMP
);
```

**展示**
- 列表项：标题 + 摘要 + 来源 + 重要度徽章 + 时间（相对）。
- 重要度 3 星置顶；过滤栏：分类 / 来源 / 重要度。
- 默认显示最近 3 天。

**去重 / 过期**
- TTL = 30 天；过期不入展示（保留表中用于统计）。
- 同 URL 永不重复。

**API**
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/news?days=3&category=&importance=` | GET | 列表 |
| `/api/news/<id>` | GET | 详情（原始正文） |

---

### 模块 3 · Arxiv 论文

**定位**：每天 5-10 篇，按他感兴趣的方向过滤：**quant / factor mining / LLM / agent**，可选次级方向 time-series / RL / 多模态。

**数据源**
- **arxiv API**：`http://export.arxiv.org/api/query?search_query=...&sortBy=submittedDate&sortOrder=descending`
- **关键词组合**（构造搜索串）：
  - 主：`cat:q-fin.ST OR cat:q-fin.GN OR cat:q-fin.TR`（因子挖掘/统计金融）
  - 主：`abs:"large language model" AND (abs:factor OR abs:alpha OR abs:trading OR abs:portfolio)`
  - 主：`abs:"LLM agent" OR abs:"multi-agent" AND abs:tool OR abs:reasoning`
  - 主：`abs:"factor mining" OR abs:"alpha mining" OR abs:"stock selection"`
  - 次：`abs:"time series forecasting" AND (abs:foundation model OR abs:LLM)`
- **顶会兜底**：ICML / NeurIPS / ACL / ICLR RSS（但 arxiv 已基本覆盖 preprint）。

**抓取策略**
- `cron/daily_arxiv.py`：
  1. 拉过去 48h 的 arxiv 摘要（多组关键词）。
  2. 每篇喂 minimax-m3：判断是否属于他的兴趣方向（0/1）、一句话中文摘要、3 个核心贡献、关键术语、与"大模型因子挖掘"的相关度（0-5）。
  3. 过滤掉相关度 < 3 的。
  4. 同 arxiv id 永不重复。

**存储**
```sql
CREATE TABLE arxiv_papers (
  arxiv_id TEXT PRIMARY KEY,   -- '2401.12345'
  published DATE,
  title TEXT,
  authors TEXT,                -- JSON array
  abstract TEXT,
  abs_url TEXT,                -- https://arxiv.org/abs/...
  pdf_url TEXT,                -- https://arxiv.org/pdf/...
  category TEXT,               -- quant/llm/agent/multimodal
  relevance_score INTEGER,     -- 0-5
  one_line_zh TEXT,
  contributions TEXT,          -- markdown
  fetched_at TIMESTAMP
);

CREATE INDEX idx_arxiv_pub ON arxiv_papers(published);
```

**展示**
- 卡片：标题 + 中文一行摘要 + 相关度徽章 + tags + 论文日期。
- 展开：完整摘要（英文原文）+ 3 贡献 + 两个跳转按钮（abs / pdf）。
- 顶部过滤器：category 切换；只显示最近 7 天。

**去重 / 过期**
- 不删除；只过滤时间窗。

**API**
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/arxiv?days=7&category=` | GET | 列表 |
| `/api/arxiv/<id>` | GET | 详情 |

---

### 模块 4 · School Info（PKU）

**定位**：北大 + 清华 + 信科 + AIIC + 量化基地相关的当日 / 未来 7 天活动 / 通知 / 讲座 / 奖学金。

**数据源**
- **WebSearch 每日一次**：
  - 关键词 A：`北京大学 通知 2026-XX-XX`
  - 关键词 B：`北京大学 信息科学学院 活动`
  - 关键词 C：`北京大学 人工智能研究院 AIIC 通知`
  - 关键词 D：`北京大学 保研 推免 通知`
  - 关键词 E：`北京大学 量化 金融 讲座`
  - 关键词 F：`清华大学 讲座 / 通知`
- **公众号兜底**（微信公众号搜索接口，可能需要 RSSHub 桥接）：
  - "北大未名"、"北京大学"、"PKU信科"、"北大AI研究院"、"北大国发院"、"清华清新时报"
- **官方 RSS / 列表页**：
  - `https://www.pku.edu.cn/` 首页 / 通知公告 RSS（如有）
  - `https://eecs.pku.edu.cn/` 信科通知
  - `https://www.aidb.pku.edu.cn/` AIIC
  - `https://career.pku.edu.cn/` 就业中心

**抓取策略**
- `cron/daily_school.py`：
  1. 6 组 WebSearch（中文，限定"site:pku.edu.cn"）。
  2. 每个结果 WebFetch → LLM 抽取：标题、时间、地点（线上/线下/燕园）、类型（讲座/通知/比赛/招生）、截止日期、目标人群、本科生相关性（0-3）。
  3. 命中关键词（保研 / 推免 / 交换 / 量化 / 因子 / 智能 / 算法 / 实习）的，重要度 +1。
  4. URL 去重入库。

**存储**
```sql
CREATE TABLE school_events (
  id INTEGER PRIMARY KEY,
  publish_date DATE,
  event_date DATE,            -- 活动当天，可能为空
  expire_date DATE,           -- 报名截止或通知过期
  title TEXT,
  summary TEXT,
  url TEXT UNIQUE,
  source TEXT,                -- 'pku_eecs' / 'pku_main' / 'aic' / 'wechat:pkuxinx' / 'web_search'
  event_type TEXT,            -- notice/lecture/contest/admission/scholarship/exchange
  location TEXT,
  relevance INTEGER,          -- 0-3
  created_at TIMESTAMP
);

CREATE INDEX idx_school_expire ON school_events(expire_date);
```

**展示**
- 顶部"未来 7 天活动"通栏 + 下方"近期通知"列表。
- 过期项灰色 + "已过期"标签。
- 过滤器：类型 / 来源 / 是否含保研 / 含量化 / 含留学。

**去重 / 过期**
- TTL：当天过期；过期后 7 天内仍可见（标注"已过期"），之后移入冷库。

**API**
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/school?type=&relevant_only=true` | GET | 列表 |
| `/api/school/upcoming?days=7` | GET | 未来 7 天 |

---

### 模块 5 · LeetCode Hot 100

**定位**：每天 1 题，100 题循环，每天附完整解析 + 复杂度 + 推荐练习路径。

**数据源**
- **题库**：把 LeetCode Hot 100 全部录入（约 100 题），字段：题号、英文标题、中文标题、难度、tags、LeetCode URL、题解（中文，markdown）、复杂度。
- **冷启动**：一次性从 GitHub 公开题解库（如 `azl397985856/leetcode`、`doocs/leetcode`）批量导入 100 题的解析，让 LLM 统一改写为统一格式。

**抓取策略**
- `cron/daily_leetcode.py`：每天从 100 题中按 `(day_of_year % 100)` 取题，同一天永远同一题；首日从第 1 题开始。无需联网（已离线）。

**存储**
```sql
CREATE TABLE leetcode_questions (
  id INTEGER PRIMARY KEY,
  lc_id INTEGER,              -- 1, 2, 3...
  title_en TEXT,
  title_zh TEXT,
  difficulty TEXT,            -- easy/medium/hard
  tags TEXT,
  url TEXT,
  solution_md TEXT,
  complexity TEXT,
  order_in_hot100 INTEGER     -- 1-100
);

CREATE TABLE daily_leetcode (
  date DATE PRIMARY KEY,
  question_id INTEGER REFERENCES leetcode_questions(id)
);
```

**展示**
- 顶部：题号 / 难度 / tags。
- 题干（markdown）。
- 折叠"题解"（默认折叠）；题解包含思路 + 代码 + 复杂度。

**去重 / 过期**
- 题库无过期；36 天循环。

**API**
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/leetcode/today` | GET | 今日题 |
| `/api/leetcode/<id>` | GET | 单题详情 |

---

### 模块 6 · English

**定位**：每天 10 个词 + 5 个短语 + 2 段表达，难度在 CET-6 583 与雅思之间，不出题（用户明确要求）。

**数据源**
- **词库**：从 `TOEFL` / `IELTS` 词表（如 `wordset/TOEFL`、`mohammad-ali/ielts-vocab-list`）开源数据集灌入，按词频+难度分级。
- **短语 / 表达**：每日从英文新闻（Reuters / BBC / The Economist RSS）拉 2 段 ~150 词短文（科技 / 商业 / 金融方向，匹配他兴趣），LLM 提取 5 个地道短语或表达。

**抓取策略**
- `cron/daily_english.py`：
  1. 从词库按"上次出现时间升序"选 10 个词（保证长期覆盖）。
  2. 拉 3 篇英文新闻 → LLM 提取短语（每篇 ≤ 3 个）。
  3. 写 `daily_english`。

**LLM 处理**
- 单词：音标 + 释义（英英释义优先）+ 1 句学术 / 商业场景例句 + 搭配 + 同近义词辨析（≤ 30 字）。
- 短语：来源短句上下文 + 中文释义 + 同义表达替换 + 1 句使用场景说明。

**存储**
```sql
CREATE TABLE english_words (
  id INTEGER PRIMARY KEY,
  word TEXT,
  phonetic TEXT,
  definition TEXT,
  example TEXT,
  collocations TEXT,
  synonyms_note TEXT,
  difficulty TEXT,            -- 'cet4'/'cet6'/'ielts'/'toefl'/'gre'
  last_shown_at DATE
);

CREATE TABLE english_phrases (
  id INTEGER PRIMARY KEY,
  phrase TEXT,
  source_sentence TEXT,      -- 来自原文的上下文
  source_url TEXT,
  meaning_zh TEXT,
  meaning_en TEXT,
  alternatives TEXT,         -- 同义表达
  usage_note TEXT,
  last_shown_at DATE
);

CREATE TABLE daily_english (
  date DATE PRIMARY KEY,
  word_ids TEXT,             -- JSON array
  phrase_ids TEXT            -- JSON array
);
```

**展示**
- 两栏：左 10 单词（折叠展开），右 5 短语（每条带原文出处链接）。
- 每条目卡片有"加入生词本"按钮（写 `localStorage`，不入库）。
- 顶部进度条：累计学习词数（基于 daily_english）。

**去重 / 过期**
- 单词：180 天内不重复。
- 短语：一旦原文已展示即不重复展示。

**API**
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/english/today` | GET | 今日单词+短语 |

---

### 模块 7 · Finance Daily（财经要闻 + 关键价）

**定位**：今日宏观要闻 + 重点股票 / 商品 / 加密当日行情。

**数据源**
- **行情**：Yahoo Finance API（`query1.finance.yahoo.com/v7/finance/quote`，无需 key）抓 XAUUSD、BTCUSD、USD/CNH、A 股大盘（000001.SS）、纳指（^IXIC）。
- **新闻**：
  - 华尔街见闻 RSS / 财新 RSS / FT 中文网 RSS
  - WebSearch `财经 要闻 中文 2026-XX-XX`
  - WebSearch `gold XAU news today`、`bitcoin BTC news today`（英文）

**抓取策略**
- `cron/daily_finance.py`：
  1. 拉行情 5 项 → 写 `finance_quotes`（按 date 覆盖最新）。
  2. 拉新闻 → LLM 摘要（标题中文 + 100 字摘要 + 影响方向 商品/股票/汇率/加密）。
  3. 重点过滤：影响 XAUUSD 或 BTCUSD 的事件标"黄金 / 加密"。

**存储**
```sql
CREATE TABLE finance_quotes (
  symbol TEXT,
  date DATE,
  price REAL,
  change_pct REAL,
  PRIMARY KEY (symbol, date)
);

CREATE TABLE finance_news (
  id INTEGER PRIMARY KEY,
  publish_date DATE,
  source TEXT,
  url TEXT UNIQUE,
  title_zh TEXT,
  summary_zh TEXT,
  affects TEXT,              -- 'gold'/'btc'/'fx'/'equity'
  importance INTEGER,
  created_at TIMESTAMP
);
```

**展示**
- 顶部：5 个行情卡片（XAUUSD / BTCUSD / USDCNH / 上证 / 纳指），含价格 + 当日涨跌幅（颜色：涨绿跌红，**降饱和度**）。
- 下方：今日要闻列表（带"影响"徽章）。

**去重 / 过期**
- 行情：永久保留。
- 新闻：TTL 14 天。

**API**
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/finance/quotes` | GET | 当日 5 个行情 |
| `/api/finance/news?days=3` | GET | 要闻列表 |

---

### 模块 8 · GitHub Trending

**定位**：当天 trending top 20 + 精选 3-5 个深度解读（按他兴趣方向筛）。

**数据源**
- **Trending 页面**：`https://github.com/trending` 按 daily / weekly 抓（用 requests + 正则）。
- **Trending 过滤**：按 stars ≥ 100 + 与他兴趣相关关键词（agent / LLM / factor / trading / quant / RL / agent / 论文 / 学术 / 工具 / workflow）粗筛。
- **README 解析**：抓每个候选 repo 的 README.md（用 raw.githubusercontent.com），LLM 提炼 1 句中文介绍、tags、推荐理由（为什么对 PKU 智能专业学生有用）。

**抓取策略**
- `cron/daily_github.py`：
  1. 抓 trending daily 列表。
  2. 前 20 都入库，但只对前 5 调 LLM 写深度介绍（控成本）。
  3. repo full_name 唯一。

**存储**
```sql
CREATE TABLE github_repos (
  full_name TEXT PRIMARY KEY,    -- 'owner/repo'
  url TEXT,
  description TEXT,
  language TEXT,
  stars_total INTEGER,
  stars_today INTEGER,
  first_seen_at DATE,
  last_seen_at DATE,
  current_rank INTEGER,
  brief_zh TEXT,                 -- LLM 生成的 1 句中文介绍
  tags TEXT,
  created_at TIMESTAMP
);

CREATE INDEX idx_github_last ON github_repos(last_seen_at);
```

**展示**
- 列表：star 数、当日新增 star、语言、tags、链接。
- 展开：1 句中文简介 + GitHub 跳转。
- "我关注的方向"过滤器。

**去重 / 过期**
- 永久保留（用于历史查询）；前端只显示 last_seen_at ≥ 7 天内出现过的。

**API**
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/github/trending?period=daily&interest=1` | GET | 列表 |

---

### 模块 9 · 羊毛 Deals

**定位**：当天可薅的羊毛 / 学生福利 / 免费额度，每条带过期日和领取链接。

**数据源**
- **WebSearch 每日一次**（中文，按你列的 6 类各跑一次）：
  - `阿里云 腾讯云 华为云 学生 优惠 2026`
  - `ChatGPT Claude Gemini DeepSeek 学生 免费 2026`
  - `GitHub Copilot JetBrains 学生 2026`
  - `Coursera edX 极客时间 免费 课程 2026`
  - `免费 域名 SSL 2026`
  - `互联网 福利 限时 2026`
- **官方页面兜底**：每月 1 号额外抓一次云厂商 / AI 大厂的"学生计划"官方页面，更新到 `deals_static`。

**抓取策略**
- `cron/daily_deals.py`：
  1. 6 组 WebSearch。
  2. 每个结果 WebFetch → LLM 抽取：标题、分类、来源、过期时间、领取条件、链接、备注。
  3. 同 URL 永不重复。
  4. 过期项自动标记失效（前端灰色）。

**LLM 处理**
- LLM 二次确认"活动是否对学生有效 / 是否仍可领取 / 是否过期"；过期直接不入库。

**存储**
```sql
CREATE TABLE deals (
  id INTEGER PRIMARY KEY,
  publish_date DATE,
  expire_date DATE,
  category TEXT,            -- cloud/ai_api/devtool/edu/hosting/misc
  title TEXT,
  source TEXT,
  url TEXT UNIQUE,
  requirements TEXT,        -- 学生认证、新用户等
  note TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP
);

CREATE INDEX idx_deals_expire ON deals(expire_date);
CREATE INDEX idx_deals_category ON deals(category);
```

**展示**
- 按类别分组的卡片；每卡片显眼显示"剩余 X 天"，过期变灰。
- 顶部过滤器：仅学生可领 / 仅免费 / 仅今日新增。

**去重 / 过期**
- expire_date 当天自动 `is_active = 0`；前端默认隐藏非 active。

**API**
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/deals?category=&active_only=true` | GET | 列表 |

---

## 4. 技术架构

### 4.1 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 后端 | **Python 3.11 + FastAPI** | 抓取 + LLM 调用 + SQLite 都顺手；异步适合并行抓；自动 OpenAPI 文档 |
| 前端 | **原生 HTML/CSS/JS + 一份 design-tokens.css** | 设计系统就是为单文件 SPA 设计的；不引框架减少维护成本 |
| 数据库 | **SQLite**（文件 `data/daily.db`） | 单机、单用户、读多写少；不需要 PG |
| 定时任务 | **系统 cron + Python 脚本**（不用 Celery） | 个人站杀鸡用牛刀 |
| 进程管理 | **PM2**（管理 FastAPI + 前端静态服务两个进程） | 比 supervisor 简单，比裸跑稳 |
| 反代 | **Nginx**（监听 443，转发 /daily 到 127.0.0.1:8001） | 已有域名解析；Let's Encrypt 证书 |
| LLM | **minimax-m3**（按 OpenAI 兼容协议调用） | 已配置 key；统一内容生成 |

### 4.2 目录结构

```
~/daily/
├── AGENT.md                     # 入职手册（不入 git）
├── README.md
├── .env                         # 密钥（不入 git）
├── .env.example                 # 模板
├── requirements.txt
├── package.json                 # 仅记录 pm2 配置文件
├── data/
│   ├── daily.db                 # SQLite
│   └── seeds/
│       ├── leetcode_hot100.json
│       ├── quant_red_book.json
│       ├── quant_green_book.json
│       └── english_words.json
├── backend/
│   ├── app.py                   # FastAPI 入口
│   ├── config.py
│   ├── db.py
│   ├── llm.py                   # minimax-m3 客户端
│   ├── search.py                # WebSearch / WebFetch 封装
│   ├── modules/
│   │   ├── quant.py
│   │   ├── ai_news.py
│   │   ├── arxiv.py
│   │   ├── school.py
│   │   ├── leetcode.py
│   │   ├── english.py
│   │   ├── finance.py
│   │   ├── github.py
│   │   └── deals.py
│   └── api/
│       ├── quant.py
│       ├── news.py
│       ├── arxiv.py
│       ├── school.py
│       ├── leetcode.py
│       ├── english.py
│       ├── finance.py
│       ├── github.py
│       ├── deals.py
│       └── health.py
├── cron/
│   ├── run_all.sh               # 主调度
│   ├── daily_quant.py
│   ├── daily_ai_news.py
│   ├── daily_arxiv.py
│   ├── daily_school.py
│   ├── daily_leetcode.py
│   ├── daily_english.py
│   ├── daily_finance.py
│   ├── daily_github.py
│   └── daily_deals.py
├── frontend/
│   ├── index.html               # 单页应用
│   ├── css/
│   │   ├── design-tokens.css    # 从 frontend-design-system.md 抄
│   │   ├── layout.css
│   │   └── components.css
│   ├── js/
│   │   ├── app.js               # 路由 + 侧边栏
│   │   ├── api.js
│   │   └── render/
│   │       ├── quant.js
│   │       ├── news.js
│   │       ├── arxiv.js
│   │       ├── school.js
│   │       ├── leetcode.js
│   │       ├── english.js
│   │       ├── finance.js
│   │       ├── github.js
│   │       └── deals.js
│   └── assets/
│       ├── logo.svg
│       └── icons/                # 9 个模块 icon
├── nginx/
│   └── daily.conf                # nginx 配置片段
├── scripts/
│   ├── deploy.sh                 # 部署一键脚本
│   ├── init_db.py                # 灌种子数据
│   └── backup.sh                 # 每日 03:00 备份 db
└── logs/
    └── .gitkeep
```

### 4.3 数据流（单模块一次抓取）

```
cron/daily_xxx.py
   │
   ├─ 1. 拉原始数据（RSS / WebSearch / arxiv API / GitHub scrape）
   │
   ├─ 2. 对每条原始 item：
   │      ├─ 计算 dedup_key (hash(url) or fixed id)
   │      ├─ SELECT id FROM xxx WHERE dedup_key = ?  → 命中则跳过
   │      └─ 未命中 → 调 minimax-m3 生成结构化字段
   │
   ├─ 3. INSERT INTO xxx (..., expires_at = now + TTL)
   │
   └─ 4. 输出日志到 logs/xxx.YYYY-MM-DD.log
```

### 4.4 并发策略

- 9 个脚本并发执行（每个脚本 `nohup python ... &`，主调度 `wait`）。
- 单脚本内部：批量调 LLM 用 `asyncio.gather`，每批 ≤ 5 并发（防 rate limit）。
- LLM 调用统一走 `backend/llm.py` 的连接池，超时 30s 自动跳过该条。

---

## 5. 数据库 schema 汇总

（各模块表见 §3；额外 2 张全局表）

```sql
-- 抓取日志（监控用）
CREATE TABLE fetch_logs (
  id INTEGER PRIMARY KEY,
  module TEXT,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  status TEXT,            -- 'success' / 'partial' / 'failed'
  items_fetched INTEGER,
  items_inserted INTEGER,
  items_skipped INTEGER,
  error TEXT
);

-- 用户偏好（仅前端用 localStorage，后端不依赖）
-- 不入库
```

---

## 6. 定时任务设计

### 6.1 cron 表达式（服务器本地时间 = Asia/Shanghai）

```cron
# 每日凌晨 3:00 备份数据库
0 3 * * * /home/groy/daily/scripts/backup.sh

# 每日 5:00 - 6:00 并发抓取 9 个模块
0 5 * * * /home/groy/daily/cron/run_all.sh >> /home/groy/daily/logs/run_all.$(date +\%F).log 2>&1

# 每日 6:30 发送邮件摘要（可选）
30 6 * * * /home/groy/daily/scripts/email_digest.sh
```

### 6.2 主调度 `cron/run_all.sh`

```bash
#!/usr/bin/env bash
set -e
cd /home/groy/daily
source venv/bin/activate

MODULES=(quant ai_news arxiv school leetcode english finance github deals)
PIDS=()

for m in "${MODULES[@]}"; do
  python cron/daily_$m.py > logs/${m}.$(date +%F).log 2>&1 &
  PIDS+=($!)
done

# 等待全部完成，最多 50 分钟（5:00 - 5:50），超时 kill
SECONDS=0
for pid in "${PIDS[@]}"; do
  while kill -0 $pid 2>/dev/null; do
    if [ $SECONDS -gt 3000 ]; then
      kill -9 $pid
    fi
    sleep 10
  done
done
```

---

## 7. UI 与交互设计

> 完全复用 `frontend-design-system.md`：Apple 极简、衬线主标、细横线分隔、`--bg #F5F5F7`、蓝色只用在关键 CTA、暗色模式齐全、响应式三档。

### 7.1 页面骨架

```
┌──────────────────────────────────────────────────────────┐
│  header（毛玻璃，sticky）                                 │
│  [logo] AutoTreehole Daily        [theme toggle] [github]│
├──────────┬───────────────────────────────────────────────┤
│ sidebar  │  main content                                  │
│ ─────    │  ┌──────────────────────────────────────────┐ │
│ ① Quant  │  │ Module 标题 + 今日日期                    │ │
│ ② News   │  │ ────────────────────────────────────  │ │
│ ③ Arxiv  │  │ 模块内容区（list / cards）                │ │
│ ④ School │  │                                          │ │
│ ⑤ LC     │  │                                          │ │
│ ⑥ Eng    │  │                                          │ │
│ ⑦ Fin    │  │                                          │ │
│ ⑧ GitHub │  └──────────────────────────────────────────┘ │
│ ⑨ Deals  │                                                │
└──────────┴───────────────────────────────────────────────┘
```

### 7.2 侧边栏规则

- 默认桌面宽（> 1024）：左侧 220px 固定宽度侧边栏。
- 平板（640-1024）：顶部横向 tab 滚动条（参考设计系统的 `.header-inner` 模式）。
- 手机（< 640）：顶部下拉菜单（点击展开 9 项）。
- 当前激活模块用 `.tab-btn.active` 样式（底部 1.5px 黑线）。
- 模块 icon 用线性 SVG（stroke 1.5px，`currentColor`）。

### 7.3 模块卡片样式

- **AI News / Arxiv / School / Deals / GitHub**：列表卡片（`.list-item`）。
- **Quant / LeetCode**：题卡片（题目主体 + 折叠答案/题解）。
- **English**：双栏（单词 / 短语），单词可加入生词本。
- **Finance**：顶部 5 个 stat-card（行情），下方新闻列表。

### 7.4 通用交互

- 加载：`.skeleton` 占位（shimmer 动画）。
- 错误：`.flash.error` 顶部 banner。
- 空状态：`.empty-state`（如"今日暂无新增羊毛"）。
- 主题切换：localStorage `theme`；默认跟随系统。

### 7.5 移动端

- 触摸目标 ≥ 44px。
- 字号 14px 起步。
- 间距减半但不为 0。
- 顶部 tab 横向滚动，**不用汉堡菜单**（设计系统明令禁止）。

---

## 8. 部署方案

### 8.1 服务器初始化（一次性）

```bash
# 通过 SSH 连上服务器
ssh -p 13522 root@118.178.162

# 安装基础依赖（Ubuntu 22.04）
apt update
apt install -y python3.11 python3.11-venv nginx sqlite3 git curl

# 创建非 root 用户（推荐但可选，root 也行）
# 这里为简化直接用 root

# 创建项目目录
mkdir -p /home/groy/daily && cd /home/groy/daily

# 拉代码（GitHub PAT 在本机用，不放服务器）
git clone https://github.com/gry1024/daily.git .

# 建虚拟环境
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 复制并填 .env
cp .env.example .env
nano .env   # 填入 MINIMAX_API_KEY / QQ_EMAIL_AUTH_CODE 等
```

### 8.2 nginx 配置

文件 `/etc/nginx/sites-available/daily`：

```nginx
server {
    listen 443 ssl http2;
    server_name autotreehole.cn;

    # 已有站点的 location / 不要动
    location /daily/ {
        alias /home/groy/daily/frontend/;
        try_files $uri $uri/ /daily/index.html;
        index index.html;
    }

    location /daily/api/ {
        proxy_pass http://127.0.0.1:8001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
    }

    # SSL 证书（Let's Encrypt）
    ssl_certificate     /etc/letsencrypt/live/autotreehole.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/autotreehole.cn/privkey.pem;
}
```

启用：
```bash
ln -s /etc/nginx/sites-available/daily /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 8.3 PM2 配置

文件 `ecosystem.config.js`：

```js
module.exports = {
  apps: [
    {
      name: 'daily-api',
      script: 'venv/bin/uvicorn',
      args: 'backend.app:app --host 127.0.0.1 --port 8001',
      cwd: '/home/groy/daily',
      env: { PYTHONUNBUFFERED: '1' },
    },
    {
      name: 'daily-frontend',
      script: 'python3',
      args: '-m http.server 8002 --directory frontend',
      cwd: '/home/groy/daily',
    }
  ]
};
```

> 注：实际上 nginx 直接 serve 静态文件更省事，PM2 只跑 FastAPI 一个进程即可。

### 8.4 SSL 证书

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d autotreehole.cn
# 自动续期：certbot.timer 已自带
```

### 8.5 部署哲学（来自 dev-workflow.md）

> 推代码 → 重启服务 → 验证 → 监控 24h

```bash
# 本机
git add -p                                # 不要 git add .
git commit -m "feat: 新增 deals 模块"
git push origin main

# 服务器
cd /home/groy/daily
git pull origin main
source venv/bin/activate
pip install -r requirements.txt --upgrade
pm2 restart daily-api --update-env

# 验证
curl https://autotreehole.cn/daily/api/health
# 浏览器打开 autotreehole.cn/daily 看 9 个模块
```

---

## 9. 开发路线图（4 周 MVP + 迭代）

> 按 dev-workflow.md 的"先 MVP，后完美"原则。

### 第 1 周 · MVP 内核
- [ ] 项目骨架 + git init + AGENT.md
- [ ] 设计 token CSS + 单页骨架（占位侧边栏 + 路由切换）
- [ ] FastAPI 入口 + `/api/health` + DB 连接
- [ ] 灌入种子数据：LeetCode Hot 100、Quant 红宝书 30 题、English 词库前 500
- [ ] 模块 5（LeetCode）+ 模块 1（Quant）跑通：cron → DB → API → 前端展示
- [ ] 本地 + 服务器双跑通

### 第 2 周 · 内容模块批量上线
- [ ] 模块 3（Arxiv）：arxiv API + LLM 过滤
- [ ] 模块 2（AI News）：RSS + WebSearch
- [ ] 模块 6（English）：完整实现 + 生词本
- [ ] 模块 8（GitHub Trending）：scrape + LLM 精选

### 第 3 周 · 外部信息模块
- [ ] 模块 7（Finance）：Yahoo Finance + 中英文新闻
- [ ] 模块 9（Deals）：6 类 WebSearch
- [ ] 模块 4（School）：北大 / 清华 / 信科 / AIIC 多组 WebSearch

### 第 4 周 · 打磨与上线
- [ ] 暗色模式全站打通
- [ ] 响应式三档验证
- [ ] 错误 / 空 / loading 三态
- [ ] 邮件摘要（可选）
- [ ] 监控：fetch_logs 看板（最简版：API 暴露日志）
- [ ] README + TECH.md

### 之后 · 持续迭代
- 每周回顾：哪个模块数据质量差，调 prompt 或换数据源
- 用户反馈驱动新增功能（如："我想要每个模块的 RSS 输出"）

---

## 10. 自主完成能力确认

| 任务 | 能否自主完成 | 依赖 |
|---|---|---|
| SSH 连服务器（13522 端口，私钥） | ✅ | 本地有私钥（用户机器上的 `~/.ssh/treehole_key`） |
| 在服务器装 Python/nginx/Node/cron/SQLite | ✅ | root 权限已给 |
| 拉 GitHub 仓库 + 推送 | ✅ | PAT 已提供 |
| 配 SSL（Let's Encrypt） | ✅ | 域名已解析 |
| 配 nginx 反代 + 静态托管 | ✅ | — |
| 配 PM2 守护进程 | ✅ | — |
| 配 cron 定时任务 | ✅ | — |
| 用 minimax-m3 生成内容 | ✅ | API key 已在密钥文件 |
| 发邮件（QQ 邮箱 + 授权码） | ✅ | 授权码已给 |
| WebSearch / WebFetch 数据采集 | ✅ | 当前会话工具已可用 |
| arxiv API / GitHub trending 抓取 | ✅ | 公开 API |
| 微信文章抓取 | ⚠️ 部分 | 公众号搜不到时需要 RSSHub 桥接；先用 WebSearch 兜底 |
| 微信公众号文章正文（API 无） | ⚠️ | 受限于微信反爬，只能用 WebSearch 拿标题摘要 |

**需要你做一次性的事**（仅在首次部署）：
1. 在本机生成 SSH 私钥放到服务器，或确认现有私钥路径（`C:\Users\Gao runyu\.ssh\treehole_key` 是 Windows 路径，我会从这台 Linux 本机生成新的 keypair 并把公钥加到服务器）。
2. 第一次 `certbot` 时确认域名解析已生效（已经做了就不需要）。
3. 邮件推送若启用，QQ 邮箱第一次发件会触发"非常用登录"提醒，手动点一次确认即可。

---

## 11. 反模式（明确不做）

按 dev-workflow.md 的精神：
- ❌ 不做用户体系 / 登录 / 注册
- ❌ 不做评论 / 点赞 / 分享
- ❌ 不做 PWA 推送（邮件足够）
- ❌ 不做实时 WebSocket
- ❌ 不做 RSS 输出（先内部用，未来再加）
- ❌ 不重构设计系统
- ❌ 不引 React/Vue（设计系统就是为单文件 SPA 写的）
- ❌ 不上 Docker（单机部署杀鸡用牛刀）
- ❌ 不上 CDN / OSS（个人站流量小）

---

## 12. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| minimax-m3 偶发限流 | 当日某模块缺失 | 单条失败不阻塞整批；fetch_logs 记录；次日补抓 |
| WebSearch 搜不到足够结果 | 模块空 | 模块内部兜底数据源（RSS、官方 API）独立运行 |
| 微信公众号正文抓不到 | School 模块质量降 | 只展示标题+摘要+链接，引导手动点击 |
| GitHub trending 页结构变 | 模块失败 | scrape 用宽松正则 + 异常重试；优先级最低 |
| Yahoo Finance 接口变动 | 行情失败 | 兜底用腾讯财经 / 新浪财经接口 |
| 服务器磁盘满 | cron 失败 | logs 保留 14 天自动清理；备份保留 30 天 |
| 域名 SSL 过期 | 全站不可用 | certbot 自动续期 + 服务器监控 |

---

## 13. 开放问题（不需要现在答，但写代码前需要）

1. **GitHub repo 名**：`gry1024/daily`？还是别的？
2. **学校模块**：你希望"未来 7 天活动"放顶部还是"今日通知"放顶部？我默认前者。
3. **邮件摘要**：你希望每天 6:30 收一封邮件总结 9 个模块的关键 3 条吗？还是只在有重要羊毛 / 重要活动时推？
4. **手机端访问**：你日常用手机看还是电脑看？手机为主我会更激进地折叠侧边栏。
5. **历史归档**：保留多久？默认 90 天新闻 / 永久论文 / 永久题库。
6. **关键词扩展**：school 模块的"量化"具体包括哪些？你心中是否有具体名单（如：量化明珠俱乐部、九坤、幻方在北大办的讲座）？

---

*文档写完，请你在 §0 待确认事项 + §13 开放问题两处给我答复，我即可开始第 1 周 MVP。*
