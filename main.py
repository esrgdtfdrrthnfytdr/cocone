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

sys.stdout.reconfigure(encoding='utf-8')
load_dotenv()

app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key="super-secret-key-cocone-demo")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL, connect_args={"options": "-c client_encoding=utf8"})

# --- Pydanticモデル ---
class GenerateOTPRequest(BaseModel):
    class_id: Optional[str] = None
    period: int = 1

class CheckAttendRequest(BaseModel):
    otp_value: int

# --- ヘルパー関数 ---
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

# --- ルーティング ---
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request, "error": request.query_params.get("error")})

@app.post("/login")
async def login(request: Request, email: str = Form(...), password: str = Form(...)):
    try:
        with engine.connect() as conn:
            t = conn.execute(text("SELECT teacher_id, name, password_hash FROM teachers WHERE email = :email"), {"email": email}).fetchone()
            if t and t.password_hash == password:
                request.session.update({"role": "teacher", "user_id": t.teacher_id, "user_name": t.name})
                return RedirectResponse(url="/rollCall", status_code=303)
            
            s = conn.execute(text("SELECT student_number, name, password_hash, homeroom_class FROM students WHERE email = :email"), {"email": email}).fetchone()
            if s and s.password_hash == password:
                request.session.update({"role": "student", "user_id": s.student_number, "user_name": s.name, "class": s.homeroom_class})
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
    if role != "teacher": return RedirectResponse(url="/", status_code=303)
    classes = get_teacher_classes(user_id)
    return render_page(request, "rollCall.html", {"classes": classes})

@app.get("/register", response_class=HTMLResponse)
async def register(request: Request):
    return render_page(request, "register.html")

@app.get("/attendanceFilter", response_class=HTMLResponse)
async def attendance_filter(request: Request):
    role = request.session.get("role")
    user_id = request.session.get("user_id")
    if role != "teacher": return RedirectResponse(url="/", status_code=303)
    classes = get_teacher_classes(user_id)
    return render_page(request, "attendanceFilter.html", {"classes": classes})

# --- 修正: 出席結果画面 ---
@app.get("/attendanceResult", response_class=HTMLResponse)
async def attendance_result(request: Request, class_name: Optional[str]=None, start_date: Optional[str]=None, end_date: Optional[str]=None):
    if not class_name or not start_date or not end_date:
        return render_page(request, "attendanceResult.html", {"error": "検索条件が指定されていません", "students_data": [], "date_headers": []})

    students_data = []
    date_headers = []
    
    # 日付リスト生成
    try:
        s_date = datetime.datetime.strptime(start_date, '%Y-%m-%d')
        e_date = datetime.datetime.strptime(end_date, '%Y-%m-%d')
        delta = e_date - s_date
        date_headers = [(s_date + timedelta(days=i)).strftime('%Y-%m-%d') for i in range(delta.days + 1)]
    except ValueError:
        return render_page(request, "attendanceResult.html", {"error": "日付形式エラー"})

    try:
        with engine.connect() as conn:
            # 1. 生徒一覧取得
            sql_students = text("SELECT student_number, name, attendance_no FROM students WHERE homeroom_class = :c_name ORDER BY attendance_no")
            students_rows = conn.execute(sql_students, {"c_name": class_name}).fetchall()

            # 2. 授業セッション取得 (★修正: クラスIDではなく、そのクラスの生徒が出席しているセッションを探す)
            # ※ 「生徒が所属するクラス」でフィルタリングして、関連するセッションを引く
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

            # 3. 出席データ取得
            session_ids = [row.session_id for row in sessions_rows]
            attendance_map = {}
            if session_ids:
                bind_params = {f"id{i}": sid for i, sid in enumerate(session_ids)}
                bind_keys = ", ".join([f":{k}" for k in bind_params.keys()])
                sql_results = text(f"SELECT student_number, session_id, status FROM attendance_results WHERE session_id IN ({bind_keys})")
                results_rows = conn.execute(sql_results, bind_params).fetchall()
                for r in results_rows:
                    attendance_map[(r.student_number, r.session_id)] = r.status

            # データ整形
            sessions_by_date = defaultdict(dict)
            for row in sessions_rows:
                p = row.period if row.period else 1
                sessions_by_date[row.date][p] = row.session_id

            for stu in students_rows:
                stu_record = {"number": stu.attendance_no, "student_number": stu.student_number, "name": stu.name, "dates": {}}
                for d in date_headers:
                    day_statuses = []
                    day_session_map = sessions_by_date.get(d, {})
                    for i in range(1, 5):
                        if i in day_session_map:
                            sess_id = day_session_map[i]
                            raw = attendance_map.get((stu.student_number, sess_id))
                            st = {"period": i, "class": "no-data", "text": "データなし"}
                            if raw == "出席": st.update({"class": "attend", "text": "出席"})
                            elif raw == "欠席": st.update({"class": "absent", "text": "欠席"})
                            elif raw == "遅刻": st.update({"class": "late", "text": "遅刻"})
                            elif raw == "早退": st.update({"class": "early", "text": "早退"})
                            elif raw == "公欠": st.update({"class": "public-abs", "text": "公欠"})
                            elif raw == "特欠": st.update({"class": "special-abs", "text": "特欠"})
                            day_statuses.append(st)
                        else:
                            day_statuses.append({"period": i, "class": "no-data", "text": "データなし"})
                    stu_record["dates"][d] = day_statuses
                students_data.append(stu_record)

    except Exception as e:
        print(f"❌ Error: {e}")
        return render_page(request, "attendanceResult.html", {"error": "データ取得エラー"})

    return render_page(request, "attendanceResult.html", {
        "class_name": class_name, "start_date": start_date, "end_date": end_date,
        "date_headers": date_headers, "students_data": students_data
    })

# --- API ---
@app.post("/api/generate_otp")
async def generate_otp(req: GenerateOTPRequest):
    val = random.randint(0, 15)
    current_date = datetime.date.today().strftime('%Y-%m-%d')

    # class_id が無くても保存できるようにする (student起点の紐づけ)
    cid_val = int(req.class_id) if (req.class_id and str(req.class_id).strip()) else None

    sql = text("INSERT INTO class_sessions (class_id, date, period, sound_token) VALUES (:cid, :date, :period, :token) RETURNING session_id")
    try:
        with engine.connect() as conn:
            new_id = conn.execute(sql, {"cid": cid_val, "date": current_date, "period": req.period, "token": str(val)}).fetchone()[0]
            conn.commit()
        return JSONResponse({"otp_binary": format(val, '04b'), "otp_display": val})
    except Exception as e:
        print(f"❌ DB Error: {e}")
        return JSONResponse({"error": "Database error"}, status_code=500)

@app.post("/api/check_attend")
async def check_attend(req: CheckAttendRequest, request: Request):
    student_otp = req.otp_value
    student_id = request.session.get("user_id")
    if not student_id: return JSONResponse({"status": "error", "message": "ログインしてください"})

    try:
        with engine.connect() as conn:
            # 最新のセッションを取得
            session_row = conn.execute(text("SELECT session_id, sound_token FROM class_sessions ORDER BY session_id DESC LIMIT 1")).fetchone()
            if not session_row: return JSONResponse({"status": "error", "message": "授業が開催されていません"})
            
            if student_otp == int(session_row.sound_token):
                conn.execute(text("INSERT INTO attendance_results (session_id, student_number, status, note) VALUES (:sid, :stu, '出席', 'アプリから')"),
                             {"sid": session_row.session_id, "stu": student_id})
                conn.commit()
                return JSONResponse({"status": "success", "message": "出席登録完了"})
            else:
                return JSONResponse({"status": "error", "message": "コード不一致"})
    except Exception as e:
        print(f"Check Error: {e}")
        return JSONResponse({"status": "error", "message": "エラーが発生しました"})

@app.get("/attendanceStatus", response_class=HTMLResponse)
async def attendance_status(request: Request): return render_page(request, "attendanceStatus.html")

@app.get("/userManagement", response_class=HTMLResponse)
async def user_management(request: Request): return render_page(request, "userManagement.html")

@app.get("/passwordChange", response_class=HTMLResponse)
async def password_change(request: Request): return render_page(request, "passwordChange.html")