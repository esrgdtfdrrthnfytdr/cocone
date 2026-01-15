import os
import sys
import random
import datetime
from typing import Optional
from fastapi import FastAPI, Request, Depends, Form, status
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel
from dotenv import load_dotenv
import uvicorn

# Windowsでの文字化け対策
sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()

app = FastAPI()

# セッション管理 (Flaskのsecret_key相当)
app.add_middleware(SessionMiddleware, secret_key="secret_key_cocone_dummy")

# 静的ファイルとテンプレートの設定
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# データベース設定 (SQLAlchemy)
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL, connect_args={"options": "-c client_encoding=utf8"})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# DBセッション取得用
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Pydanticモデル (APIのリクエストボディ用)
class GenerateOtpRequest(BaseModel):
    class_id: str

class CheckAttendRequest(BaseModel):
    otp_value: int

# ==================================================
# 1. ログイン画面
# ==================================================
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    # 簡易ログイン画面 (HTML直書き)
    html_content = """
    <html>
    <body style="text-align:center; padding-top:50px;">
        <h1>Cocone ログイン (FastAPI)</h1>
        <form method="post" action="/">
            <input type="text" name="email" placeholder="メールアドレス"><br><br>
            <input type="password" name="password" placeholder="パスワード"><br><br>
            <button type="submit">ログイン</button>
        </form>
        <p>先生: doi@hcs.ac.jp / smoke<br>生徒: student@hcs.ac.jp/ pass</p>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

@app.post("/")
async def login(request: Request, email: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    # 先生テーブル検索
    teacher = db.execute(text("SELECT * FROM teachers WHERE email = :e"), {"e": email}).fetchone()
    if teacher and teacher.password_hash == password:
        request.session['user_role'] = 'teacher'
        request.session['user_id'] = teacher.teacher_id
        request.session['user_name'] = teacher.name
        return RedirectResponse(url="/teacher", status_code=status.HTTP_303_SEE_OTHER)

    # 生徒テーブル検索
    student = db.execute(text("SELECT * FROM students WHERE email = :e"), {"e": email}).fetchone()
    if student and student.password_hash == password:
        request.session['user_role'] = 'student'
        request.session['user_id'] = student.student_number
        request.session['user_name'] = student.name
        request.session['homeroom'] = student.homeroom_class
        return RedirectResponse(url="/student", status_code=status.HTTP_303_SEE_OTHER)

    return HTMLResponse(content="<h1>ログイン失敗</h1><a href='/'>戻る</a>")

# ==================================================
# 2. 先生用ページ
# ==================================================
@app.get("/teacher", response_class=HTMLResponse)
async def teacher_page(request: Request, db: Session = Depends(get_db)):
    if request.session.get('user_role') != 'teacher':
        return RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)

    teacher_id = request.session['user_id']
    # 担当クラス取得
    my_classes = db.execute(text("SELECT * FROM classes WHERE teacher_id = :tid"), {"tid": teacher_id}).fetchall()

    return templates.TemplateResponse("rollCall.html", {
        "request": request,
        "teacher_name": request.session['user_name'],
        "classes": my_classes
    })

# ==================================================
# 3. 生徒用ページ
# ==================================================
@app.get("/student", response_class=HTMLResponse)
async def student_page(request: Request):
    if request.session.get('user_role') != 'student':
        return RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)
    
    return templates.TemplateResponse("register.html", {
        "request": request,
        "student_name": request.session['user_name'],
        "homeroom": request.session['homeroom']
    })

# ==================================================
# 4. 出席開始API
# ==================================================
@app.post("/api/generate_otp")
async def generate_otp(request: Request, data: GenerateOtpRequest, db: Session = Depends(get_db)):
    if request.session.get('user_role') != 'teacher':
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
        
    val = random.randint(0, 15)
    binary_str = format(val, '04b')
    current_date = datetime.date.today().strftime('%Y-%m-%d')
    
    try:
        sql = text("""
            INSERT INTO class_sessions (class_id, date, sound_token)
            VALUES (:cid, :date, :token)
            RETURNING session_id
        """)
        db.execute(sql, {"cid": data.class_id, "date": current_date, "token": str(val)})
        db.commit()
        return {"otp_binary": binary_str, "otp_display": val}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

# ==================================================
# 5. 出席確認API
# ==================================================
@app.post("/api/check_attend")
async def check_attend(request: Request, data: CheckAttendRequest, db: Session = Depends(get_db)):
    if request.session.get('user_role') != 'student':
        return JSONResponse({"status": "error", "message": "ログインしてください"}, status_code=401)

    student_id = request.session['user_id']

    # 最新の授業セッションを取得
    row = db.execute(text("SELECT session_id, sound_token FROM class_sessions ORDER BY session_id DESC LIMIT 1")).fetchone()
    
    if not row:
        return JSONResponse({"status": "error", "message": "授業が開催されていません"})
    
    current_session_id = row.session_id
    correct_otp = int(row.sound_token)
    
    if data.otp_value == correct_otp:
        try:
            sql_insert = text("INSERT INTO attendance_results (session_id, student_number, status, note) VALUES (:sess, :stu, '出席', 'アプリ登録')")
            db.execute(sql_insert, {"sess": current_session_id, "stu": student_id})
            db.commit()
            return {"status": "success", "message": "出席完了"}
        except Exception:
            return JSONResponse({"status": "error", "message": "登録済みかエラー"})
    else:
        return JSONResponse({"status": "error", "message": "コード不一致"})

# ログアウト
@app.get("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)

if __name__ == '__main__':
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)