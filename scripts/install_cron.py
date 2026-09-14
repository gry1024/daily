#!/usr/bin/env python3
"""
重置 cron 到正确状态
"""
import subprocess

PATH = "/home/groy/daily"

# 当前 cron
existing = subprocess.check_output(["crontab", "-l"], text=True)
lines = [l for l in existing.splitlines() if "daily/cron/run_all" not in l and "scripts/backup" not in l and "scripts/email_digest" not in l]

# 加正确的行
lines.append("0 5 * * * /home/groy/daily/cron/run_all.sh > /home/groy/daily/logs/run_all.cron.log 2>&1")
lines.append("30 6 * * * /home/groy/daily/scripts/backup.sh > /home/groy/daily/logs/backup.log 2>&1")
lines.append("0 8 * * * /home/groy/daily/venv/bin/python3 /home/groy/daily/scripts/email_digest.py > /home/groy/daily/logs/email.log 2>&1")

new = "\n".join(lines) + "\n"
proc = subprocess.Popen(["crontab", "-"], stdin=subprocess.PIPE, text=True)
proc.communicate(new)
print("installed")
print("\n".join(lines))
