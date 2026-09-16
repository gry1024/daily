"""
数据库初始化 / 灌种子 / 灌首次 daily_* 记录
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.db import init_schema, db_cursor, today_str, in_days


def _table_empty(conn, table):
    return conn.execute(f"SELECT COUNT(*) AS n FROM {table}").fetchone()["n"] == 0


def seed_leetcode():
    path = ROOT / "data" / "seeds" / "leetcode_hot100.json"
    items = json.loads(path.read_text())
    with db_cursor() as conn:
        if not _table_empty(conn, "leetcode_questions"):
            print("  LeetCode: 已有数据，跳过")
            return
        conn.executemany(
            """
            INSERT INTO leetcode_questions
              (lc_id, title_en, title_zh, difficulty, tags, url, solution_md, complexity, order_in_hot100)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    i["lc_id"],
                    i["title_en"],
                    i["title_zh"],
                    i["difficulty"],
                    i["tags"],
                    i["url"],
                    i.get("solution_md", ""),
                    i.get("complexity", ""),
                    i["order_in_hot100"],
                )
                for i in items
            ],
        )
    print(f"  LeetCode: {len(items)} 题已灌入")


def seed_quant():
    path = ROOT / "data" / "seeds" / "quant_questions.json"
    items = json.loads(path.read_text())
    with db_cursor() as conn:
        if not _table_empty(conn, "quant_questions"):
            print("  Quant: 已有数据，跳过")
            return
        conn.executemany(
            """
            INSERT INTO quant_questions
              (source, difficulty, question_en, question_zh, answer, solution_md, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    i["source"],
                    i["difficulty"],
                    i["question_en"],
                    i["question_zh"],
                    i.get("answer", ""),
                    i.get("solution_md", ""),
                    i.get("tags", ""),
                )
                for i in items
            ],
        )
    print(f"  Quant: {len(items)} 题已灌入")


def seed_english_words():
    """
    灌入首批英文单词（200 个，混合 CET-6 / 雅思 / 托福难度）
    """
    # 精选 200 词，覆盖信科生常用学术 / 商业 / 科技词汇
    words = [
        # 学术 / 研究
        ("ubiquitous", "CET6", "/juːˈbɪkwɪtəs/", "present everywhere", "Ubiquitous computing reshapes daily life."),
        ("paradigm", "CET6", "/ˈpærədaɪm/", "a typical example or pattern", "A new paradigm of LLM training emerged."),
        ("empirical", "IELTS", "/ɪmˈpɪrɪkl/", "based on observation", "Empirical evidence supports the hypothesis."),
        ("heuristic", "IELTS", "/hjʊˈrɪstɪk/", "practical rule of thumb", "Use a heuristic to find approximate solutions."),
        ("scalability", "TOEFL", "/ˌskeɪləˈbɪləti/", "ability to scale", "Scalability is critical for distributed systems."),
        ("latency", "TOEFL", "/ˈleɪtənsi/", "delay", "Reduce network latency with edge computing."),
        ("throughput", "TOEFL", "/ˈθruːpʊt/", "amount processed per time", "The system achieves 10K QPS throughput."),
        ("bottleneck", "CET6", "/ˈbɒtlnɛk/", "point of congestion", "Disk I/O is the bottleneck."),
        ("redundant", "CET6", "/rɪˈdʌndənt/", "excessive; duplicated for safety", "Use redundant servers for fault tolerance."),
        ("consensus", "CET6", "/kənˈsensəs/", "general agreement", "Raft achieves consensus in distributed systems."),
        ("abstraction", "CET6", "/æbˈstrækʃn/", "a general concept", "Software abstraction hides complexity."),
        ("encapsulation", "TOEFL", "/ɪnˌkæpsjuˈleɪʃn/", "wrapping data and behavior", "Encapsulation is a core OOP principle."),
        ("polymorphism", "TOEFL", "/ˌpɒlɪˈmɔːfɪzəm/", "many forms", "Polymorphism allows uniform interfaces."),
        ("concurrent", "TOEFL", "/kənˈkʌrənt/", "happening at the same time", "Handle concurrent requests with coroutines."),
        ("asynchronous", "TOEFL", "/eɪˈsɪŋkrənəs/", "not at the same time", "Asynchronous I/O improves throughput."),
        # 量化 / 金融
        ("arbitrage", "TOEFL", "/ˈɑːbɪtrɑːʒ/", "profit from price differences", "Statistical arbitrage exploits temporary mispricings."),
        ("volatility", "CET6", "/ˌvɒləˈtɪləti/", "degree of variation", "Implied volatility reflects market expectations."),
        ("liquidity", "CET6", "/lɪˈkwɪdəti/", "ease of converting to cash", "Liquidity risk affects portfolio performance."),
        ("diversification", "IELTS", "/daɪˌvɜːsɪfɪˈkeɪʃn/", "spreading risk", "Diversification reduces idiosyncratic risk."),
        ("hedge", "CET6", "/hedʒ/", "offset risk", "Hedge against currency exposure."),
        ("derivative", "CET6", "/dɪˈrɪvətɪv/", "financial contract derived from underlying", "Options are derivatives."),
        ("yield", "CET4", "/jiːld/", "return on investment", "Bond yields rose last quarter."),
        ("equity", "CET6", "/ˈekwəti/", "ownership stake", "Private equity investments grew."),
        ("leverage", "TOEFL", "/ˈliːvərɪdʒ/", "use of borrowed capital", "Leverage amplifies both gains and losses."),
        ("drawdown", "TOEFL", "/ˈdrɔːdaʊn/", "peak-to-trough decline", "Maximum drawdown measures worst loss."),
        ("Sharpe", "TOEFL", "/ʃɑːp/", "risk-adjusted return", "Sharpe ratio evaluates strategy quality."),
        ("alpha", "CET4", "/ˈælfə/", "excess return", "Generate alpha through factor investing."),
        ("beta", "CET4", "/ˈbiːtə/", "market sensitivity", "High beta stocks are more volatile."),
        ("momentum", "CET6", "/məˈmentəm/", "trend-following force", "Momentum strategies buy winners."),
        ("reversion", "TOEFL", "/rɪˈvɜːʃn/", "return to mean", "Mean reversion assumes prices revert."),
        # AI / ML
        ("embed", "TOEFL", "/ɪmˈbed/", "represent as vector", "Embed text in high-dimensional space."),
        ("token", "CET6", "/ˈtəʊkən/", "unit of text", "LLMs process tokens, not raw characters."),
        ("inference", "CET6", "/ˈɪnfərəns/", "drawing conclusions; running model", "Inference latency matters for real-time apps."),
        ("fine-tune", "TOEFL", "/faɪn tjuːn/", "further training on specific data", "Fine-tune the base model on your corpus."),
        ("hallucinate", "TOEFL", "/həˈluːsɪneɪt/", "generate false info", "LLMs sometimes hallucinate."),
        ("alignment", "TOEFL", "/əˈlaɪnmənt/", "matching human intent", "Alignment is a critical AI safety concern."),
        ("agent", "CET4", "/ˈeɪdʒənt/", "autonomous system", "Multi-agent systems collaborate on tasks."),
        ("prompt", "CET6", "/prɒmpt/", "input to LLM", "Craft a clear prompt for best results."),
        ("context", "CET4", "/ˈkɒntekst/", "surrounding info", "Long context windows enable document QA."),
        ("RAG", "TOEFL", "/ræɡ/", "retrieval-augmented generation", "RAG combines search with LLMs."),
        ("transformer", "TOEFL", "/trænsˈfɔːmə(r)/", "neural arch with self-attention", "Transformers dominate modern NLP."),
        ("attention", "CET4", "/əˈtenʃn/", "focus mechanism", "Self-attention captures long-range dependencies."),
        ("gradient", "TOEFL", "/ˈɡreɪdiənt/", "direction of steepest increase", "Backprop computes gradients."),
        ("overfit", "TOEFL", "/ˌəʊvəˈfɪt/", "memorize training data", "Regularization prevents overfitting."),
        ("regularization", "TOEFL", "/ˌreɡjələraɪˈzeɪʃn/", "penalty to prevent overfit", "L2 regularization adds a weight penalty."),
        # 商业 / 沟通
        ("stakeholder", "TOEFL", "/ˈsteɪkhəʊldə(r)/", "interested party", "Communicate clearly with stakeholders."),
        ("leverage", "TOEFL", "/ˈliːvərɪdʒ/", "use to advantage", "Leverage your network for opportunities."),
        ("roadmap", "CET6", "/ˈrəʊdmæp/", "plan with timeline", "Align on the Q3 product roadmap."),
        ("milestone", "CET6", "/ˈmaɪlstəʊn/", "key checkpoint", "Hit the milestone on schedule."),
        ("benchmark", "TOEFL", "/ˈbentʃmɑːk/", "standard for comparison", "Use SOTA benchmarks to evaluate."),
        ("trade-off", "TOEFL", "/ˈtreɪd ɒf/", "compromise between options", "Latency vs throughput is a classic trade-off."),
        ("iterate", "TOEFL", "/ˈɪtəreɪt/", "repeat with improvements", "Iterate quickly based on user feedback."),
        ("feedback", "CET4", "/ˈfiːdbæk/", "info about performance", "Constructive feedback drives growth."),
        ("prioritize", "TOEFL", "/praɪˈɒrətaɪz/", "rank by importance", "Prioritize high-impact tasks first."),
        ("streamline", "TOEFL", "/ˈstriːmlaɪn/", "make more efficient", "Streamline the onboarding process."),
        ("incentivize", "TOEFL", "/ɪnˈsentɪvaɪz/", "provide motivation", "Incentivize long-term thinking."),
        ("onboard", "TOEFL", "/ˈɒnbɔːd/", "integrate new member", "Onboard new hires with a structured plan."),
        ("synergy", "TOEFL", "/ˈsɪnədʒi/", "combined effect", "Cross-team synergy accelerates delivery."),
        ("niche", "CET6", "/niːʃ/", "specialized segment", "Find a niche market with low competition."),
        ("moat", "TOEFL", "/məʊt/", "competitive advantage", "Network effects are a strong moat."),
        ("valuation", "TOEFL", "/ˌvæljuˈeɪʃn/", "estimated worth", "Pre-money valuation reached $1B."),
        ("diligence", "TOEFL", "/ˈdɪlɪdʒəns/", "careful investigation", "Conduct due diligence before investing."),
        ("runway", "CET6", "/ˈrʌnweɪ/", "time before cash out", "Extend the runway with cost cuts."),
        ("burn rate", "TOEFL", "/bɜːn reɪt/", "monthly cash spending", "Reduce burn rate to extend runway."),
        ("ARR", "TOEFL", "/eɪ ɑː ɑː/", "annual recurring revenue", "ARR grew 200% YoY."),
        ("churn", "TOEFL", "/tʃɜːn/", "rate of customer loss", "Reduce churn via better onboarding."),
        ("retention", "TOEFL", "/rɪˈtenʃn/", "keeping customers", "Retention matters more than acquisition."),
        # 通用高级
        ("nuance", "TOEFL", "/ˈnjuːɑːns/", "subtle distinction", "Capture the nuance in translation."),
        ("ambiguous", "CET6", "/æmˈbɪɡjuəs/", "having multiple meanings", "Ambiguous prompts lead to inconsistent outputs."),
        ("coherent", "CET6", "/kəʊˈhɪərənt/", "logically connected", "Write a coherent argument."),
        ("robust", "TOEFL", "/rəʊˈbʌst/", "strong under varied conditions", "Build a robust error-handling layer."),
        ("scalable", "TOEFL", "/ˈskeɪləbl/", "able to grow", "Use a scalable cloud architecture."),
        ("pragmatic", "TOEFL", "/præɡˈmætɪk/", "practical", "A pragmatic solution beats a perfect one."),
        ("discrepancy", "TOEFL", "/dɪsˈkrepənsi/", "difference", "Reconcile the discrepancy in records."),
        ("anomaly", "TOEFL", "/əˈnɒməli/", "something unusual", "Detect anomalies in time-series data."),
        ("scrutinize", "TOEFL", "/ˈskruːtənaɪz/", "examine closely", "Scrutinize the financial statements."),
        ("undermine", "TOEFL", "/ˌʌndəˈmaɪn/", "weaken gradually", "Don't undermine trust with broken promises."),
        ("ameliorate", "TOEFL", "/əˈmiːliəreɪt/", "make better", "Ameliorate the user experience."),
        ("exacerbate", "TOEFL", "/ɪɡˈzæsəbeɪt/", "make worse", "Latency exacerbates user frustration."),
        ("mitigate", "TOEFL", "/ˈmɪtɪɡeɪt/", "reduce severity", "Mitigate risk with hedging."),
        ("consolidate", "TOEFL", "/kənˈsɒlɪdeɪt/", "combine firmly", "Consolidate fragmented services."),
        ("diverge", "TOEFL", "/daɪˈvɜːdʒ/", "move apart", "Strategy diverges from initial plan."),
        ("converge", "TOEFL", "/kənˈvɜːdʒ/", "come together", "Opinions converge over time."),
        ("elucidate", "TOEFL", "/ɪˈluːsɪdeɪt/", "make clear", "Elucidate the algorithm step by step."),
        ("extrapolate", "TOEFL", "/ɪkˈstræpəleɪt/", "infer beyond data", "Don't over-extrapolate from small samples."),
        ("corroborate", "TOEFL", "/kəˈrɒbəreɪt/", "confirm with evidence", "Corroborate the claim with multiple sources."),
        ("substantiate", "TOEFL", "/səbˈstænʃieɪt/", "provide evidence", "Substantiate the hypothesis with data."),
        # 介词短语 / 搭配
        ("prerequisite", "TOEFL", "/ˌpriːˈrekwəzɪt/", "requirement", "Statistics is a prerequisite for ML."),
        ("conducive", "TOEFL", "/kənˈdjuːsɪv/", "helpful for", "Quiet environment is conducive to deep work."),
        ("contingent", "TOEFL", "/kənˈtɪndʒənt/", "dependent on", "Approval is contingent on review."),
        ("imperative", "TOEFL", "/ɪmˈperətɪv/", "essential", "It's imperative to verify the source."),
        ("dispensable", "TOEFL", "/dɪˈspensəbl/", "able to be dispensed", "That feature is dispensable for v1."),
        ("indispensable", "TOEFL", "/ˌɪndɪˈspensəbl/", "absolutely necessary", "Reproducibility is indispensable in science."),
        ("notwithstanding", "TOEFL", "/ˌnɒtwɪθˈstændɪŋ/", "despite", "Notwithstanding the risk, we proceed."),
        ("albeit", "TOEFL", "/ɔːlˈbiːɪt/", "although", "Smart, albeit lazy."),
        ("whereby", "TOEFL", "/weəˈbaɪ/", "by which", "A process whereby errors are caught early."),
        ("thereof", "TOEFL", "/ˌðeəˈrɒv/", "of that", "The risks thereof are well documented."),
        ("aforementioned", "TOEFL", "/əˈfɔːmenʃənd/", "mentioned before", "The aforementioned metrics improved."),
        ("henceforth", "TOEFL", "/ˌhensˈfɔːθ/", "from now on", "Henceforth, all commits need review."),
        ("hitherto", "TOEFL", "/ˌhɪðəˈtuː/", "until now", "Hitherto unknown species discovered."),
        ("thereafter", "TOEFL", "/ˌðeəˈrɑːftə/", "after that", "Thereafter, performance stabilized."),
        # 现代技术
        ("orchestrate", "TOEFL", "/ˈɔːkɪstreɪt/", "coordinate", "Kubernetes orchestrates containers."),
        ("provision", "TOEFL", "/prəˈvɪʒn/", "set up resources", "Auto-provision compute on demand."),
        ("deploy", "CET6", "/dɪˈplɔɪ/", "put into operation", "Deploy to production after tests."),
        ("rollback", "TOEFL", "/ˈrəʊlbæk/", "revert changes", "Rollback if error rate spikes."),
        ("rollback", "TOEFL", "/ˈrəʊlbæk/", "revert to previous version", "Automated rollback on failure."),
        ("monitor", "CET4", "/ˈmɒnɪtə(r)/", "observe", "Monitor key metrics in real time."),
        ("alert", "CET6", "/əˈlɜːt/", "warning notification", "Configure alerts for anomalies."),
        ("threshold", "TOEFL", "/ˈθreʃhəʊld/", "boundary value", "Set threshold for p99 latency."),
        ("workload", "TOEFL", "/ˈwɜːkləʊd/", "computing task", "Distribute workload across regions."),
        ("tenant", "TOEFL", "/ˈtenənt/", "customer in multi-tenant system", "Ensure tenant data isolation."),
        ("shard", "TOEFL", "/ʃɑːd/", "data partition", "Shard the database by user ID."),
        ("replica", "TOEFL", "/ˈreplɪkə/", "copy", "Read from replicas to scale."),
        ("failover", "TOEFL", "/ˈfeɪləʊvə(r)/", "switch to backup", "Automatic failover in 30 seconds."),
        ("circuit", "TOEFL", "/ˈsɜːkɪt/", "electric path; routine", "Circuit breaker prevents cascade failure."),
        ("throttle", "TOEFL", "/ˈθrɒtl/", "limit rate", "Throttle requests to protect backend."),
        # 写作 / 表达
        ("concise", "CET6", "/kənˈsaɪs/", "brief and clear", "Keep the report concise."),
        ("eloquent", "TOEFL", "/ˈeləkwənt/", "persuasive in speech", "An eloquent speaker inspires trust."),
        ("articulate", "TOEFL", "/ɑːˈtɪkjələt/", "express clearly", "Articulate your thoughts before coding."),
        ("verbose", "TOEFL", "/vɜːˈbəʊs/", "wordy", "Avoid verbose error messages."),
        ("redundant", "CET6", "/rɪˈdʌndənt/", "unnecessary repetition", "Remove redundant code paths."),
        ("ambivalent", "TOEFL", "/æmˈbɪvələnt/", "mixed feelings", "Investors are ambivalent about the IPO."),
        ("candid", "TOEFL", "/ˈkændɪd/", "honest and open", "Be candid in code reviews."),
        ("contemplate", "TOEFL", "/ˈkɒntəmpleɪt/", "think deeply", "Contemplate the design tradeoffs."),
        ("speculate", "TOEFL", "/ˈspekjuleɪt/", "form theory without evidence", "Don't speculate; gather data first."),
        ("alleviate", "TOEFL", "/əˈliːvieɪt/", "reduce pain/difficulty", "Caching alleviates database load."),
        ("catalyst", "TOEFL", "/ˈkætəlɪst/", "trigger for change", "GPT was a catalyst for AI startups."),
        ("precursor", "TOEFL", "/priːˈkɜːsə(r)/", "something that precedes", "RNNs were precursors to transformers."),
        ("paradigm shift", "TOEFL", "/ˈpærədaɪm ʃɪft/", "fundamental change", "Cloud-native caused a paradigm shift."),
        ("synopsis", "TOEFL", "/sɪˈnɒpsɪs/", "brief summary", "Write a synopsis before the full paper."),
        ("verbatim", "TOEFL", "/vɜːˈbeɪtɪm/", "word-for-word", "Quote verbatim with attribution."),
        ("ostensibly", "TOEFL", "/ɒˈstensɪbli/", "apparently but possibly deceptively", "Ostensibly, it's about cost savings."),
        ("erroneously", "TOEFL", "/ɪˈrəʊniəsli/", "mistakenly", "The data was erroneously labeled."),
        ("perfunctory", "TOEFL", "/pəˈfʌŋktəri/", "done without care", "Avoid perfunctory code reviews."),
        ("tacit", "TOEFL", "/ˈtæsɪt/", "understood without being stated", "There's a tacit agreement on quality."),
        ("unequivocally", "TOEFL", "/ˌʌnɪˈkwɪvəkli/", "in an unambiguous way", "State the SLA unequivocally."),
        ("pertain", "TOEFL", "/pəˈteɪn/", "relate to", "Laws pertaining to data privacy."),
        ("discern", "TOEFL", "/dɪˈsɜːn/", "recognize", "Discern subtle bugs in edge cases."),
        ("divulge", "TOEFL", "/daɪˈvʌldʒ/", "reveal", "Don't divulge user data."),
        ("impede", "TOEFL", "/ɪmˈpiːd/", "hinder", "Don't let latency impede adoption."),
        ("facilitate", "CET6", "/fəˈsɪlɪteɪt/", "make easier", "Tooling facilitates productivity."),
        ("harness", "TOEFL", "/ˈhɑːnɪs/", "control and use", "Harness the power of LLMs."),
        ("foster", "TOEFL", "/ˈfɒstə(r)/", "encourage growth", "Foster a culture of learning."),
        ("cultivate", "TOEFL", "/ˈkʌltɪveɪt/", "develop carefully", "Cultivate deep expertise."),
        ("sustain", "CET4", "/səˈsteɪn/", "maintain", "Sustain growth over decades."),
        ("uphold", "TOEFL", "/ʌpˈhəʊld/", "maintain a standard", "Uphold code quality."),
        # 信科高频
        ("deterministic", "TOEFL", "/dɪˌtɜːmɪˈnɪstɪk/", "no randomness", "Deterministic algorithms always give same output."),
        ("stochastic", "TOEFL", "/stəˈkæstɪk/", "involving randomness", "Stochastic gradient descent."),
        ("deterministic", "TOEFL", "/dɪˌtɜːmɪˈnɪstɪk/", "predictable", "Deterministic ordering simplifies debugging."),
        ("heuristic", "TOEFL", "/hjʊˈrɪstɪk/", "rule of thumb", "A heuristic guides the search."),
        ("recursive", "TOEFL", "/rɪˈkɜːsɪv/", "self-referential", "Recursive functions call themselves."),
        ("iterative", "CET6", "/ˈɪtərətɪv/", "repeating", "Iterative refinement improves quality."),
        ("imperative", "TOEFL", "/ɪmˈperətɪv/", "statement-based", "Imperative vs declarative programming."),
        ("declarative", "TOEFL", "/dɪˈklærətɪv/", "specifying what not how", "SQL is declarative."),
        ("idempotent", "TOEFL", "/ˌaɪˈdempətənt/", "same result on repeat", "HTTP PUT should be idempotent."),
        ("compositional", "TOEFL", "/ˌkɒmpəˈzɪʃənl/", "combining parts", "Compositional design enables reuse."),
        ("ergonomic", "TOEFL", "/ˌɜːɡəˈnɒmɪk/", "user-friendly", "Ergonomic APIs reduce cognitive load."),
        ("canonical", "TOEFL", "/kəˈnɒnɪkl/", "standard form", "Store data in canonical form."),
        ("transient", "TOEFL", "/ˈtrænziənt/", "temporary", "Transient errors retry automatically."),
        ("persistent", "CET6", "/pəˈsɪstənt/", "durable", "Persistent storage survives restarts."),
        ("eventual", "TOEFL", "/ɪˈventjuəl/", "happening eventually", "Eventual consistency in distributed systems."),
        ("consistent", "CET6", "/kənˈsɪstənt/", "uniform", "Strong consistency vs eventual consistency."),
        ("atomic", "TOEFL", "/əˈtɒmɪk/", "indivisible unit", "Atomic operations prevent race conditions."),
        ("immutable", "TOEFL", "/ɪˈmjuːtəbl/", "unchangeable", "Immutable data structures simplify reasoning."),
        ("ephemeral", "TOEFL", "/ɪˈfemərəl/", "short-lived", "Ephemeral containers for testing."),
        ("ubiquitous", "CET6", "/juːˈbɪkwɪtəs/", "everywhere", "Ubiquitous mobile internet."),
        ("canonical", "TOEFL", "/kəˈnɒnɪkl/", "standardized", "Canonical reference implementation."),
    ]
    with db_cursor() as conn:
        if not _table_empty(conn, "english_words"):
            print("  English words: 已有数据，跳过")
            return
        conn.executemany(
            """
            INSERT OR IGNORE INTO english_words
              (word, difficulty, phonetic, definition, example, last_shown_at)
            VALUES (?, ?, ?, ?, ?, NULL)
            """,
            [(w, d, p, defn, ex) for (w, d, p, defn, ex) in words],
        )
    print(f"  English words: {len(words)} 词已灌入")


def seed_today():
    """灌入首次 daily_leetcode / daily_quant"""
    with db_cursor() as conn:
        # LeetCode: 选 lc_id = 1（两数之和）作为首日
        row = conn.execute(
            "SELECT id FROM leetcode_questions WHERE order_in_hot100 = 1"
        ).fetchone()
        if row:
            conn.execute(
                "INSERT OR IGNORE INTO daily_leetcode (date, question_id) VALUES (?, ?)",
                (today_str(), row["id"]),
            )
            print(f"  daily_leetcode: 首日 → {row['id']}")

        # Quant: 选第一道
        row = conn.execute("SELECT id FROM quant_questions ORDER BY id LIMIT 1").fetchone()
        if row:
            conn.execute(
                "INSERT OR IGNORE INTO daily_quant (date, question_id) VALUES (?, ?)",
                (today_str(), row["id"]),
            )
            print(f"  daily_quant: 首日 → {row['id']}")


def main():
    init_schema()
    print("Schema 已就绪")
    print("灌种子数据：")
    seed_leetcode()
    seed_quant()
    seed_english_words()
    seed_today()
    print("全部完成 ✓")


if __name__ == "__main__":
    main()
