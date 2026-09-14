"""
FastAPI 入口
- 监听 127.0.0.1:8001（仅 nginx 反代可达）
- 提供 /api/health 和 9 个模块的 GET 接口
- API 限流 60 req/min/IP
"""
import logging
import time
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from .config import APP_HOST, APP_PORT, LOG_LEVEL, ROOT
from .db import init_schema, get_conn, today_str

logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("app")

# 启动时初始化 schema
init_schema()

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

app = FastAPI(
    title="AutoTreehole Daily API",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url=None,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, lambda r, e: JSONResponse(
    status_code=429, content={"detail": "rate limit exceeded"}
))

# CORS：仅允许 autotreehole.cn 与本地
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://autotreehole.cn",
        "https://www.autotreehole.cn",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_timing(request: Request, call_next):
    t0 = time.time()
    resp = await call_next(request)
    resp.headers["X-Response-Time"] = f"{(time.time()-t0)*1000:.1f}ms"
    return resp


# —— 健康检查 ——
@app.get("/api/health")
@limiter.limit("120/minute")
def health(request: Request):
    with get_conn() as conn:
        cur = conn.execute(
            "SELECT COUNT(*) FROM fetch_logs WHERE date(created_at)=date('now','localtime')"
        )
        today_logs = cur.fetchone()[0]
    return {
        "status": "ok",
        "version": "0.1.0",
        "today": today_str(),
        "today_fetch_logs": today_logs,
    }


# —— 各模块路由（占位，本周内逐一接入） ——
from .api import (  # noqa: E402
    quant, news, arxiv, school, leetcode,
    english, finance, github, deals, today as today_api,
)

app.include_router(quant.router, prefix="/api/quant", tags=["quant"])
app.include_router(news.router, prefix="/api/news", tags=["news"])
app.include_router(arxiv.router, prefix="/api/arxiv", tags=["arxiv"])
app.include_router(school.router, prefix="/api/school", tags=["school"])
app.include_router(leetcode.router, prefix="/api/leetcode", tags=["leetcode"])
app.include_router(english.router, prefix="/api/english", tags=["english"])
app.include_router(finance.router, prefix="/api/finance", tags=["finance"])
app.include_router(github.router, prefix="/api/github", tags=["github"])
app.include_router(deals.router, prefix="/api/deals", tags=["deals"])
app.include_router(today_api.router, prefix="/api/today", tags=["today"])


# —— 静态文件（生产由 nginx 直接 serve；这里作为兜底） ——
FRONTEND_DIR = ROOT / "frontend"


@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app:app", host=APP_HOST, port=APP_PORT, reload=False)
