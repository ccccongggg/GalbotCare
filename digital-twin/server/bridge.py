# bridge.py — 数字孪生桥接服务（符合 R-01：业务逻辑 Python-only）
# 职责：
#   1. 静态托管 web/（数字孪生前端）与 Galbot G1 描述文件（/robot/）
#   2. WebSocket /ws：双向广播 JSON 指令（协议见 web/js/protocol.js 头注释）
# 用法：
#   pip install -r requirements.txt
#   python bridge.py            # 或 uvicorn bridge:app --host 0.0.0.0 --port 8766
#   浏览器打开 http://localhost:8766
import asyncio
import json
import pathlib

import uvicorn
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE = pathlib.Path(__file__).resolve().parents[1]

app = FastAPI(title="陪一把 · 数字孪生桥")
_clients: set[WebSocket] = set()


@app.middleware("http")
async def no_cache_dev(request: Request, call_next):
    """开发期禁用 JS/JSON 缓存，避免改了动作定义页面不刷新。"""
    resp: Response = await call_next(request)
    p = request.url.path
    if p.endswith(".js") or p.endswith(".json") or p.endswith(".html"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


class Command(BaseModel):
    cmd: str
    model_config = {"extra": "allow"}  # 允许任意附加字段，指令体自由


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    _clients.add(ws)
    try:
        while True:
            raw = await ws.receive_text()
            # 前端一般不发数据；收到的消息原样广播（可用于联动调试）
            for c in list(_clients):
                if c is not ws:
                    await c.send_text(raw)
    except WebSocketDisconnect:
        _clients.discard(ws)


async def broadcast(payload: dict):
    """把一条指令发给所有已连接的数字孪生前端。"""
    text = json.dumps(payload, ensure_ascii=False)
    dead = []
    for c in list(_clients):
        try:
            await c.send_text(text)
        except Exception:
            dead.append(c)
    for c in dead:
        _clients.discard(c)


@app.post("/command")
async def command(cmd: Command):
    """REST 入口，方便 curl / 其他模块触发，例如：
    curl -X POST localhost:8765/command -H "Content-Type: application/json" \
         -d '{"cmd":"status","level":"alarm","text":"测试告警"}'
    """
    await broadcast(cmd.model_dump(exclude_none=True))
    return {"ok": True, "clients": len(_clients)}


# 静态资源：/robot = G1 官方描述文件；/ = 前端（放在最后兜底）
app.mount("/robot", StaticFiles(directory=BASE / "assets" / "galbot_one_golf_description"), name="robot")
app.mount("/", StaticFiles(directory=BASE / "web", html=True), name="web")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8766, log_level="info")
