from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import random

app = FastAPI(
    title="Cocone Attendance System",
    description="音とカメラを使った出席管理システム",
    version="0.3.0"
)

# 静的ファイルの公開設定
app.mount("/static", StaticFiles(directory="static"), name="static")

# テンプレートエンジンの設定
templates = Jinja2Templates(directory="templates")

# 簡易DB (サーバーメモリ)
current_session = {
    "otp_value": None,
    "otp_binary": ""
}

# データモデル
class AttendRequest(BaseModel):
    otp_value: int

# --- ページ表示 (Routing) ---

@app.get("/", response_class=HTMLResponse)
async def index():
    return """
    <h1>Cocone System V2</h1>
    <ul>
        <li><a href="/rollCall">先生用ページ (出席確認)</a></li>
        <li><a href="/register">生徒用ページ (出席登録)</a></li>
        <li><a href="/docs">APIドキュメント</a></li>
    </ul>
    """

@app.get("/rollCall", response_class=HTMLResponse)
async def teacher_page(request: Request):
    return templates.TemplateResponse("rollCall.html", {"request": request})

@app.get("/register", response_class=HTMLResponse)
async def student_page(request: Request):
    return templates.TemplateResponse("register.html", {"request": request})

# --- API (Backend Logic) ---

@app.post("/api/generate_otp")
async def generate_otp():
    val = random.randint(0, 15)
    binary_str = format(val, '04b')
    current_session["otp_value"] = val
    current_session["otp_binary"] = binary_str
    print(f"🔑 [FastAPI] 新規OTP: {val} (Binary: {binary_str})")
    return {"otp_binary": binary_str, "otp_display": val}

@app.post("/api/check_attend")
async def check_attend(data: AttendRequest):
    print(f"📝 [FastAPI] 照合: 生徒={data.otp_value} vs 正解={current_session['otp_value']}")
    if data.otp_value == current_session["otp_value"]:
        return {"status": "success", "message": "出席完了"}
    else:
        return {"status": "error", "message": "コード不一致"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)