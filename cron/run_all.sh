#!/usr/bin/env bash
# AutoTreehole Daily · 主调度
# 每日 5:00 启动 9 个抓取模块，并发跑
# 每个模块自己重试 3 次、跑失败不影响其它模块
set +e  # 单个失败不退出

cd /home/groy/daily
source venv/bin/activate

MODULES=(quant ai_news arxiv school leetcode english finance github deals)
PIDS=()
START_TIME=$(date +%s)

mkdir -p logs
LOG_FILE="logs/run_all.$(date +%Y-%m-%d).log"

echo "=== run_all started at $(date '+%Y-%m-%d %H:%M:%S') ===" >> "$LOG_FILE"

for m in "${MODULES[@]}"; do
  echo "[$(date '+%H:%M:%S')] starting $m" >> "$LOG_FILE"
  python3 cron/daily_$m.py >> "logs/${m}.$(date +%Y-%m-%d).log" 2>&1 &
  PIDS+=($!)
done

# 等待全部完成，最多 55 分钟（5:00 - 5:55），超时 kill
TIMEOUT=3300
while [ ${#PIDS[@]} -gt 0 ]; do
  NEW_PIDS=()
  for pid in "${PIDS[@]}"; do
    if kill -0 $pid 2>/dev/null; then
      NEW_PIDS+=($pid)
    else
      wait $pid 2>/dev/null
      rc=$?
      echo "[$(date '+%H:%M:%S')] pid=$pid exit=$rc" >> "$LOG_FILE"
    fi
  done
  PIDS=("${NEW_PIDS[@]}")
  ELAPSED=$(($(date +%s) - START_TIME))
  if [ $ELAPSED -gt $TIMEOUT ]; then
    echo "TIMEOUT after ${ELAPSED}s, killing remaining: ${PIDS[*]}" >> "$LOG_FILE"
    for pid in "${PIDS[@]}"; do
      kill -9 $pid 2>/dev/null
    done
    break
  fi
  sleep 5
done

echo "=== run_all finished at $(date '+%Y-%m-%d %H:%M:%S') (elapsed $(($(date +%s) - START_TIME))s) ===" >> "$LOG_FILE"

# 跑完触发邮件摘要（8:00 用 cron 触发，这里只在 6 点之前跑完时才触发即时摘要）
HOUR=$(date +%H)
if [ "$HOUR" -lt "7" ]; then
  echo "[$(date '+%H:%M:%S')] triggering email digest" >> "$LOG_FILE"
  python3 scripts/email_digest.py >> "$LOG_FILE" 2>&1
fi
