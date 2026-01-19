import os
import sys
import random
import datetime
from datetime import timedelta
from typing import Optional
from collections import defaultdict

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
    class_id: Optional[str] = None
    period: int = 1

class CheckAttendRequest(BaseModel):
    otp_value: int

# ▼ 追加: ステータス更新用モデル
class UpdateStatusRequest(BaseModel):
    class_name: str
    student_number: str
    date: str
    period: int
    status: str
    note: Optional[str] = None


# ---------------------------------------------------------
# ヘルパー関数
# ---------------------------------------------------------
def get_teacher_classes(teacher_id: int):
    classes_list = []
    try:
        with engine.connect() as conn:
            sql = text("SELECT class_id, class_name FROM classes WHERE teacher_id = :tid ORDER BY class_name")
            rows = conn.execute(sql, {"tid": teacher_id}).fetchall()
            classes_list = [{"id": r.class_id, "name": r.class_name} for r in rows]
    except Exception as e:
        print(f"Error fetching classes: {e}")
    return classes_list

def render_page(request: Request, template_name: str, extra_context: dict = None):
    role = request.session.get("role")
    if not role:
        return RedirectResponse(url="/", status_code=303)
    
    context = {
        "request": request,
        "is_teacher": (role == "teacher"),
        "user_name": request.session.get("user_name"),
    }
    if extra_context:
        context.update(extra_context)
        
    return templates.TemplateResponse(template_name, context)


# ==========================================
#  ルーティング: 画面遷移 (GET)
# ==========================================

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {
        "request": request,
        "error": request.query_params.get("error")
    })

@app.post("/login")
async def login(request: Request, email: str = Form(...), password: str = Form(...)):
    try:
        with engine.connect() as conn:
            query_teacher = text("SELECT teacher_id, name, password_hash FROM teachers WHERE email = :email")
            result_teacher = conn.execute(query_teacher, {"email": email}).fetchone()

            if result_teacher and result_teacher.password_hash == password:
                request.session["role"] = "teacher"
                request.session["user_id"] = result_teacher.teacher_id
                request.session["user_name"] = result_teacher.name
                return RedirectResponse(url="/rollCall", status_code=303)
            
            query_student = text("SELECT student_number, name, password_hash, homeroom_class FROM students WHERE email = :email")
            result_student = conn.execute(query_student, {"email": email}).fetchone()

            if result_student and result_student.password_hash == password:
                request.session["role"] = "student"
                request.session["user_id"] = result_student.student_number
                request.session["user_name"] = result_student.name
                request.session["class"] = result_student.homeroom_class
                return RedirectResponse(url="/register", status_code=303)

            return RedirectResponse(url="/?error=auth_failed", status_code=303)

    except Exception as e:
        print(f"Login Error: {e}")
        return RedirectResponse(url="/?error=server_error", status_code=303)

@app.get("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/", status_code=303)

@app.get("/rollCall", response_class=HTMLResponse)
async def roll_call(request: Request):
    role = request.session.get("role")
    user_id = request.session.get("user_id")
    if role != "teacher":
        return RedirectResponse(url="/", status_code=303)
    classes = get_teacher_classes(user_id)
    return render_page(request, "rollCall.html", {"classes": classes})

@app.get("/register", response_class=HTMLResponse)
async def register(request: Request):
    return render_page(request, "register.html")

@app.get("/attendanceFilter", response_class=HTMLResponse)
async def attendance_filter(request: Request):
    role = request.session.get("role")
    user_id = request.session.get("user_id")
    if role != "teacher":
        return RedirectResponse(url="/", status_code=303)
    classes = get_teacher_classes(user_id)
    return render_page(request, "attendanceFilter.html", {"classes": classes})

@app.get("/attendanceResult", response_class=HTMLResponse)
async def attendance_result(
    request: Request,
    class_name: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    if not class_name or not start_date or not end_date:
        return render_page(request, "attendanceResult.html", {
            "error": "検索条件が指定されていません",
            "students_data": [],
            "date_headers": []
        })

    students_data = []
    date_headers = []
    
    try:
        s_date = datetime.datetime.strptime(start_date, '%Y-%m-%d')
        e_date = datetime.datetime.strptime(end_date, '%Y-%m-%d')
        delta = e_date - s_date
        for i in range(delta.days + 1):
            day = s_date + timedelta(days=i)
            date_headers.append(day.strftime('%Y-%m-%d'))
    except ValueError:
        return render_page(request, "attendanceResult.html", {"error": "日付の形式が不正です"})

    try:
        with engine.connect() as conn:
            # 1. 生徒一覧 (所属クラスでフィルタ)
            sql_students = text("""
                SELECT student_number, name, attendance_no 
                FROM students 
                WHERE homeroom_class = :c_name 
                ORDER BY attendance_no
            """)
            students_rows = conn.execute(sql_students, {"c_name": class_name}).fetchall()

            # 2. 授業セッション (生徒が所属するクラスに関連するセッション)
            # 生徒テーブル経由で紐づけ、または単純に「そのクラス名に紐づく生徒がいる授業」として検索
            # ここではシンプルに「AttendanceResults」があるものを引くか、
            # もしくは「class_sessions」自体にはクラス名を持たせていないため、
            # 「指定期間内の全セッション」から「結果テーブル」を結合して絞り込むのが確実ですが、
            # 簡易的に「クラスID」で絞り込みたいところです。
            # しかし現在の構造上、授業時のclass_idはNULLの可能性もあるため、
            # 「attendance_results」に紐づく「students」の「homeroom_class」が一致するもの、とします。
            
            sql_sessions = text("""
                SELECT DISTINCT s.session_id, s.date, s.period 
                FROM class_sessions s
                JOIN attendance_results ar ON s.session_id = ar.session_id
                JOIN students stu ON ar.student_number = stu.student_number
                WHERE stu.homeroom_class = :c_name 
                  AND s.date >= :start 
                  AND s.date <= :end
                ORDER BY s.date, s.period
            """)
            sessions_rows = conn.execute(sql_sessions, {
                "c_name": class_name,
                "start": start_date,
                "end": end_date
            }).fetchall()

            # 3. 出席データ
            session_ids = [row.session_id for row in sessions_rows]
            attendance_map = {}
            
            if session_ids:
                bind_params = {f"id{i}": sid for i, sid in enumerate(session_ids)}
                bind_keys = ", ".join([f":{k}" for k in bind_params.keys()])
                
                sql_results = text(f"""
                    SELECT student_number, session_id, status 
                    FROM attendance_results 
                    WHERE session_id IN ({bind_keys})
                """)
                
                results_rows = conn.execute(sql_results, bind_params).fetchall()
                for r in results_rows:
                    attendance_map[(r.student_number, r.session_id)] = r.status

            # データ整形
            sessions_by_date = defaultdict(dict)
            for row in sessions_rows:
                p = row.period if row.period else 1
                sessions_by_date[row.date][p] = row.session_id
            
            for stu in students_rows:
                stu_record = {
                    "number": stu.attendance_no,
                    "student_number": stu.student_number,
                    "name": stu.name,
                    "dates": {} 
                }

                for d in date_headers:
                    day_statuses = []
                    day_session_map = sessions_by_date.get(d, {})
                    
                    for i in range(1, 5):
                        status_data = {"period": i, "class": "no-data", "text": "データなし"}
                        
                        if i in day_session_map:
                            sess_id = day_session_map[i]
                            raw_status = attendance_map.get((stu.student_number, sess_id))
                            
                            if raw_status == "出席": status_data.update({"class": "attend", "text": "出席"})
                            elif raw_status == "欠席": status_data.update({"class": "absent", "text": "欠席"})
                            elif raw_status == "遅刻": status_data.update({"class": "late", "text": "遅刻"})
                            elif raw_status == "早退": status_data.update({"class": "early", "text": "早退"})
                            elif raw_status == "公欠": status_data.update({"class": "public-abs", "text": "公欠"})
                            elif raw_status == "特欠": status_data.update({"class": "special-abs", "text": "特欠"})
                        
                        day_statuses.append(status_data)

                    stu_record["dates"][d] = day_statuses

                students_data.append(stu_record)

    except Exception as e:
        print(f"❌ Error in attendanceResult: {e}")
        return render_page(request, "attendanceResult.html", {"error": f"データ取得エラー: {e}"})

    return render_page(request, "attendanceResult.html", {
        "class_name": class_name,
        "start_date": start_date,
        "end_date": end_date,
        "date_headers": date_headers,
        "students_data": students_data,
    })

@app.get("/attendanceStatus", response_class=HTMLResponse)
async def attendance_status(request: Request):
    return render_page(request, "attendanceStatus.html")

@app.get("/userManagement", response_class=HTMLResponse)
async def user_management(request: Request):
    return render_page(request, "userManagement.html")

@app.get("/passwordChange", response_class=HTMLResponse)
async def password_change(request: Request):
    return render_page(request, "passwordChange.html")


# ==========================================
#  API (非同期通信用)
# ==========================================

@app.post("/api/generate_otp")
async def generate_otp(req: GenerateOTPRequest):
    val = random.randint(0, 15)
    current_date = datetime.date.today().strftime('%Y-%m-%d')
    
    # class_idの処理 (フォームには無いが、student起点でデータを作るため問題なし)
    cid_val = None
    if req.class_id and str(req.class_id).strip():
        try:
            cid_val = int(req.class_id)
        except ValueError:
            cid_val = None

    sql = text("""
        INSERT INTO class_sessions (class_id, date, period, sound_token)
        VALUES (:cid, :date, :period, :token)
        RETURNING session_id
    """)
    
    try:
        with engine.connect() as conn:
            result = conn.execute(sql, {
                "cid": cid_val, 
                "date": current_date,
                "period": req.period,
                "token": str(val)
            })
            conn.commit()
            new_id = result.fetchone()[0]
            print(f"✅ Session Started: ID={new_id}, Token={val}")
        
        return JSONResponse({"otp_binary": format(val, '04b'), "otp_display": val})
        
    except Exception as e:
        print(f"❌ DB Error (generate_otp): {e}")
        return JSONResponse({"error": "Database error"}, status_code=500)


@app.post("/api/check_attend")
async def check_attend(req: CheckAttendRequest, request: Request):
    student_otp = req.otp_value
    student_id = request.session.get("user_id")

    if not student_id:
         return JSONResponse({"status": "error", "message": "ログインしてください"})

    sql_get_session = text("SELECT session_id, sound_token FROM class_sessions ORDER BY session_id DESC LIMIT 1")
    
    try:
        with engine.connect() as conn:
            session_row = conn.execute(sql_get_session).fetchone()
            
            if not session_row:
                return JSONResponse({"status": "error", "message": "授業が開催されていません"})
            
            if student_otp == int(session_row.sound_token):
                conn.execute(
                    text("INSERT INTO attendance_results (session_id, student_number, status, note) VALUES (:sess_id, :stu_num, '出席', 'アプリから')"),
                    {"sess_id": session_row.session_id, "stu_num": student_id}
                )
                conn.commit()
                return JSONResponse({"status": "success", "message": "出席登録完了"})
            else:
                return JSONResponse({"status": "error", "message": "コード不一致"})

    except Exception as e:
        print(f"❌ DB Error (check_attend): {e}")
        return JSONResponse({"status": "error", "message": "サーバーエラーが発生しました"})


# ▼▼▼ 追加: 出欠席ステータス更新API ▼▼▼
@app.post("/api/update_status")
async def update_status(req: UpdateStatusRequest):
    try:
        with engine.connect() as conn:
            # 1. クラスIDの特定 (クラス名から)
            c_row = conn.execute(
                text("SELECT class_id FROM classes WHERE class_name = :name"),
                {"name": req.class_name}
            ).fetchone()
            
            if not c_row:
                # 簡易的に最初のクラスIDを使う、またはエラーにする
                # ここではエラーを返す
                return JSONResponse({"status": "error", "message": "クラスが見つかりません"}, status_code=404)
            
            class_id = c_row.class_id

            # 2. セッションIDの特定または作成
            s_row = conn.execute(
                text("SELECT session_id FROM class_sessions WHERE class_id = :cid AND date = :date AND period = :period"),
                {"cid": class_id, "date": req.date, "period": req.period}
            ).fetchone()

            if not s_row:
                # セッションがなければ作成 (データなしの箇所を変更した場合など)
                ins_sess = conn.execute(
                    text("INSERT INTO class_sessions (class_id, date, period, sound_token) VALUES (:cid, :date, :period, '0000') RETURNING session_id"),
                    {"cid": class_id, "date": req.date, "period": req.period}
                )
                session_id = ins_sess.fetchone()[0]
                conn.commit() # セッション作成を確定
            else:
                session_id = s_row.session_id

            # 3. 出欠結果の更新 (Upsert)
            exist_row = conn.execute(
                text("SELECT result_id FROM attendance_results WHERE session_id = :sid AND student_number = :stu"),
                {"sid": session_id, "stu": req.student_number}
            ).fetchone()

            if exist_row:
                conn.execute(
                    text("UPDATE attendance_results SET status = :st, note = :nt WHERE result_id = :rid"),
                    {"st": req.status, "nt": req.note, "rid": exist_row.result_id}
                )
            else:
                conn.execute(
                    text("INSERT INTO attendance_results (session_id, student_number, status, note) VALUES (:sid, :stu, :st, :nt)"),
                    {"sid": session_id, "stu": req.student_number, "st": req.status, "nt": req.note}
                )
            
            conn.commit()
            return JSONResponse({"status": "success", "message": "更新しました"})

    except Exception as e:
        print(f"❌ Update Error: {e}")
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)