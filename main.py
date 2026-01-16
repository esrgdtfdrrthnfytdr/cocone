import os
import sys
import random
import datetime
from typing import Optional

from fastapi import FastAPI, Request, Form, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import create_engine, text
from starlette.middleware.sessions import SessionMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Windows等のコンソールでの文字化け対策
sys.stdout.reconfigure(encoding='utf-8')

# .envファイルを読み込む
load_dotenv()

# アプリケーションの初期化
app = FastAPI()

# セッション管理の有効化
app.add_middleware(SessionMiddleware, secret_key="super-secret-key-cocone-demo")

# 静的ファイル (CSS/JS/画像) のマウント
app.mount("/static", StaticFiles(directory="static"), name="static")

# テンプレートエンジンの設定
templates = Jinja2Templates(directory="templates")

# データベース接続設定
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("⚠ Warning: DATABASE_URL is not set in .env")

# 文字化け対策オプション付きでDBエンジンを作成
engine = create_engine(
    DATABASE_URL, 
    connect_args={"options": "-c client_encoding=utf8"}
)

# --- Pydanticモデル (APIのリクエストボディ用) ---
class GenerateOTPRequest(BaseModel):
    class_id: int  # 修正: classe_id -> class_id

class CheckAttendRequest(BaseModel):
    otp_value: int


# ==========================================
#  ルーティング: 画面遷移 (GET)
# ==========================================

# 1. ログイン画面
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    error_code = request.query_params.get("error")
    return templates.TemplateResponse("index.html", {
        "request": request,
        "error": error_code
    })

# ログイン処理 (POST)
@app.post("/login")
async def login(request: Request, email: str = Form(...), password: str = Form(...)):
    try:
        with engine.connect() as conn:
            # 1. Teachersテーブルを検索
            query_teacher = text("SELECT teacher_id, name, password_hash FROM teachers WHERE email = :email")
            result_teacher = conn.execute(query_teacher, {"email": email}).fetchone()

            if result_teacher:
                if result_teacher.password_hash == password:
                    request.session["role"] = "teacher"
                    request.session["user_id"] = result_teacher.teacher_id
                    request.session["user_name"] = result_teacher.name
                    return RedirectResponse(url="/rollCall", status_code=303)
            
            # 2. Studentsテーブルを検索
            query_student = text("SELECT student_number, name, password_hash, homeroom_class FROM students WHERE email = :email")
            result_student = conn.execute(query_student, {"email": email}).fetchone()

            if result_student:
                if result_student.password_hash == password:
                    request.session["role"] = "student"
                    request.session["user_id"] = result_student.student_number
                    request.session["user_name"] = result_student.name
                    request.session["class"] = result_student.homeroom_class
                    return RedirectResponse(url="/register", status_code=303)

            return RedirectResponse(url="/?error=auth_failed", status_code=303)

    except Exception as e:
        print(f"Login Error: {e}")
        return RedirectResponse(url="/?error=server_error", status_code=303)

# ログアウト処理
@app.get("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/", status_code=303)


# --- 共通ヘルパー: ページ描画と権限チェック ---
def render_page(request: Request, template_name: str, extra_context: dict = None):
    role = request.session.get("role")
    if not role:
        return RedirectResponse(url="/", status_code=303)
    
    # ここで is_teacher フラグを設定し、layout.html に渡す
    context = {
        "request": request,
        "is_teacher": (role == "teacher"),
        "user_name": request.session.get("user_name"),
    }
    if extra_context:
        context.update(extra_context)
        
    return templates.TemplateResponse(template_name, context)


# 2. 先生用: 出席確認画面 (rollCall.html)
@app.get("/rollCall", response_class=HTMLResponse)
async def roll_call(request: Request):
    role = request.session.get("role")
    user_id = request.session.get("user_id")

    # 先生以外はトップへリダイレクト
    if role != "teacher":
        return RedirectResponse(url="/", status_code=303)

    classes_list = []
    try:
        with engine.connect() as conn:
            sql = text("SELECT class_id, class_name FROM classes WHERE teacher_id = :tid")
            rows = conn.execute(sql, {"tid": user_id}).fetchall()
            
            # 【重要修正】
            # HTML側が {{ class.id }}, {{ class.name }} を期待していると仮定し、キー名を id, name に設定。
            # HTML側が {{ class.class_id }} の場合は "id" を "class_id" に書き換えてください。
            classes_list = [{"id": c.class_id, "name": c.class_name} for c in rows]
    except Exception as e:
        print(f"DB Error (Fetching classes): {e}")

    # render_page を使い、キー名を "classes" にして渡す（HTMLのループ変数名に合わせる）
    return render_page(request, "rollCall.html", {"classes": classes_list})


# 3. 生徒用: 出席登録画面 (register.html)
@app.get("/register", response_class=HTMLResponse)
async def register(request: Request):
    return render_page(request, "register.html")


# 4. 出欠席絞り込み画面 (attendanceFilter.html)
@app.get("/attendanceFilter", response_class=HTMLResponse)
async def attendance_filter(request: Request):
    return render_page(request, "attendanceFilter.html")


# 5. 出欠席結果画面 (attendanceResult.html)
@app.get("/attendanceResult", response_class=HTMLResponse)
async def attendance_result(request: Request):
    return render_page(request, "attendanceResult.html")


# 6. 出欠席状況画面 (attendanceStatus.html)
@app.get("/attendanceStatus", response_class=HTMLResponse)
async def attendance_status(request: Request):
    return render_page(request, "attendanceStatus.html")


# 7. ユーザー管理画面 (userManagement.html)
@app.get("/userManagement", response_class=HTMLResponse)
async def user_management(request: Request):
    return render_page(request, "userManagement.html")


# 8. パスワード変更画面 (passwordChange.html)
@app.get("/passwordChange", response_class=HTMLResponse)
async def password_change(request: Request):
    return render_page(request, "passwordChange.html")


# ==========================================
#  API (非同期通信用)
# ==========================================

# API 1: OTP生成と授業セッション開始 (先生が実行)
@app.post("/api/generate_otp")
async def generate_otp(req: GenerateOTPRequest):
    val = random.randint(0, 15)
    binary_str = format(val, '04b')
    current_date = datetime.date.today().strftime('%Y-%m-%d')

    sql = text("""
        INSERT INTO class_sessions (class_id, date, sound_token)
        VALUES (:cid, :date, :token)
        RETURNING session_id
    """)
    
    try:
        with engine.connect() as conn:
            # req.class_id を使用
            result = conn.execute(sql, {
                "cid": req.class_id,
                "date": current_date,
                "token": str(val)
            })
            conn.commit()
            new_id = result.fetchone()[0]
            print(f"✅ Session Started: ID={new_id}, classID={req.class_id}, Token={val}")
        
        return JSONResponse({"otp_binary": binary_str, "otp_display": val})
        
    except Exception as e:
        print(f"❌ DB Error (generate_otp): {e}")
        return JSONResponse({"error": "Database error"}, status_code=500)


# API 2: 出席確認 (生徒が実行)
@app.post("/api/check_attend")
async def check_attend(req: CheckAttendRequest, request: Request):
    student_otp = req.otp_value
    student_id = request.session.get("user_id")

    if not student_id:
         print("⚠ Warning: No student ID found in session.")
         student_id = "guest_unknown"

    print(f"📝 Received OTP: {student_otp} from {student_id}")

    sql_get_session = text("""
        SELECT session_id, sound_token 
        FROM class_sessions 
        ORDER BY session_id DESC 
        LIMIT 1
    """)
    
    try:
        with engine.connect() as conn:
            session_row = conn.execute(sql_get_session).fetchone()
            
            if not session_row:
                return JSONResponse({"status": "error", "message": "授業が開催されていません"})
            
            current_session_id = session_row.session_id
            correct_otp = int(session_row.sound_token)
            
            if student_otp == correct_otp:
                sql_insert_result = text("""
                    INSERT INTO attendance_results (session_id, student_number, status, note)
                    VALUES (:sess_id, :stu_num, '出席', 'アプリから')
                """)
                
                conn.execute(sql_insert_result, {
                    "sess_id": current_session_id,
                    "stu_num": student_id
                })
                conn.commit()
                print(f"🎉 Attendance Recorded: {student_id}")
                return JSONResponse({"status": "success", "message": "出席登録完了"})
            
            else:
                return JSONResponse({"status": "error", "message": f"コード不一致 (正解は{correct_otp})"})

    except Exception as e:
        print(f"❌ DB Error (check_attend): {e}")
        return JSONResponse({"status": "error", "message": "サーバーエラーが発生しました"})