from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import random

app = FastAPI(
    title="Cocone Attendance System",
    description="音とカメラを使った出席管理システム",
    version="0.2.0"
)

# --- 静的ファイルの設定 ---
# HTMLから "css/style.css" ではなく "/static/css/style.css" でアクセスするようにします
# ディレクトリ構成: templates/static の中身を /static というURLで公開
app.mount("/static", StaticFiles(directory="templates/static"), name="static")

# --- テンプレートエンジンの設定 ---
templates = Jinja2Templates(directory="templates")

# --- データ管理 (簡易DB) ---
# 本番ではここをPostgreSQLに置き換えますが、まずはメモリ上で動かします
current_session = {
    "otp_value": None,   # 正解の数値 (例: 10)
    "otp_binary": ""     # 正解の2進数 (例: "1010")
}

# --- リクエストボディの定義 ---
# 生徒から送られてくるデータの型を決めておきます
class AttendRequest(BaseModel):
    otp_value: int

# ==========================
# ページ表示 (Frontend)
# ==========================

@app.get("/", response_class=HTMLResponse)
async def index():
    return """
    <h1>Cocone System V2 (FastAPI)</h1>
    <ul>
        <li><a href="/teacher">先生用ページ (送信)</a></li>
        <li><a href="/student">生徒用ページ (受信)</a></li>
        <li><a href="/docs">APIドキュメント (Swagger UI)</a></li>
    </ul>
    """

@app.get("/teacher", response_class=HTMLResponse)
async def teacher_page(request: Request):
    return templates.TemplateResponse("teacher.html", {"request": request})

@app.get("/student", response_class=HTMLResponse)
async def student_page(request: Request):
    return templates.TemplateResponse("student.html", {"request": request})

# ==========================
# API (Backend)
# ==========================

@app.post("/api/generate_otp")
async def generate_otp():
    """
    【先生用】新しいワンタイムパスワード(OTP)を生成する
    """
    val = random.randint(0, 15)
    binary_str = format(val, '04b')
    
    current_session["otp_value"] = val
    current_session["otp_binary"] = binary_str
    
    print(f"🔑 [FastAPI] 新規OTP生成: {val} (Binary: {binary_str})")
    
    # フロントエンド(JS)が期待する形式で返す
    return {"otp_binary": binary_str, "otp_display": val}

@app.post("/api/check_attend")
async def check_attend(data: AttendRequest):
    """
    【生徒用】解析したコードを送信して出席判定を行う
    """
    student_otp = data.otp_value
    correct_otp = current_session["otp_value"]
    
    print(f"📝 [FastAPI] 照合: 生徒={student_otp} vs 正解={correct_otp}")

    if student_otp == correct_otp:
        return {"status": "success", "message": "出席が確認されました！"}
    else:
        # あえてエラー詳細を返さず、セキュリティを高めても良い
        return {"status": "error", "message": "コードが一致しません"}

# 開発用起動コマンド（ファイルの末尾に書いておくと便利）
if __name__ == "__main__":
    import uvicorn
    # reload=True にすると、コードを書き換えるたびに自動で再起動してくれます
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)