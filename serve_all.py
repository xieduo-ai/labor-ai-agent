"""备用镜像入口：单进程同时托管前端静态页面与后端 API（同源）。

用途：当 Railway 边缘网络在国内不可达时，用本入口把整套系统部署到
国内可访问的单端口 HTTP 服务上。前端由 STATIC_EXPORT=1 npm run build
导出，发布目录里放在 static/（避免被发布工具当作 build output 排除）。

启动：
    uvicorn serve_all:app --host 0.0.0.0 --port $PORT

注意：不改动 main.py —— Railway 现有部署仍用 main:app，行为完全不变。
"""
import os
from pathlib import Path

from fastapi.staticfiles import StaticFiles

from main import app  # 复用全部 /api/* 路由（在挂载之前注册，优先级更高）

ROOT = Path(__file__).resolve().parent

# 发布目录用 static/；本地直接用导出产物时回退到 frontend/out
STATIC = next(
    (d for d in (ROOT / "static", ROOT / "frontend" / "out") if d.is_dir()),
    None,
)
if STATIC is None:
    raise SystemExit(
        "缺少静态产物：请先执行 STATIC_EXPORT=1 npm --prefix frontend run build，"
        "并把 out/ 复制为 static/"
    )

# 兜底挂载：/api/* 等显式路由已注册在前，不会被静态资源拦截。
# html=True 让 /agent → /agent/ → agent/index.html 自动解析。
app.mount("/", StaticFiles(directory=str(STATIC), html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
