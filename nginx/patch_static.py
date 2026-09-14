#!/usr/bin/env python3
"""
在 /etc/nginx/sites-enabled/treehole 里：
1. 把通用静态 regex 拆成两个：先匹配 /daily/，再用通用
2. /daily/ 的静态 location 用 alias
"""
PATH = "/etc/nginx/sites-enabled/treehole"

content = open(PATH).read()

# 把通用 regex 拆成两段
old = """    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }"""

new = """    # /daily/ 路径下静态文件优先匹配
    location ~* ^/daily/.+\\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        alias /home/groy/daily/frontend;
        try_files $uri =404;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
    # 其它静态文件
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }"""

if old in content:
    content = content.replace(old, new)
    open(PATH, "w").write(content)
    print("patched")
else:
    print("pattern not found")
