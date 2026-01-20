import os
import sys
import random
import datetime
from datetime import timedelta
from typing import Optional, List
from collections import defaultdict
import csv
import io

from fastapi import FastAPI, Request, Form, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, StreamingResponse
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

class GenerateOTPRequest(BaseModel):
    class_id: Optional[str] = None
    period: int = 1

class CheckAttendRequest(BaseModel):
    otp_value: int

class UpdateStatusRequest(BaseModel):
    class_name: str
    student_number: str
    date: str
    period: int
    status: str
    note: Optional[str] = None

class DeleteUsersRequest(BaseModel):
    student_numbers: List[str]

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

@app.get("/attendanceResult", response_class=HTMLResponse)
async def attendance_result(request: Request, class_name: Optional[str]=None, start_date: Optional[str]=None, end_date: Optional[str]=None):
    if not class_name or not start_date or not end_date:
        return render_page(request, "attendanceResult.html", {"error": "検索条件不足", "students_data": [], "date_headers": []})

    students_data = []
    date_headers = []
    
    try:
        s_date = datetime.datetime.strptime(start_date, '%Y-%m-%d')
        e_date = datetime.datetime.strptime(end_date, '%Y-%m-%d')
        delta = e_date - s_date
        date_headers = [(s_date + timedelta(days=i)).strftime('%Y-%m-%d') for i in range(delta.days + 1)]
    except ValueError:
        return render_page(request, "attendanceResult.html", {"error": "日付形式エラー"})

    try:
        with engine.connect() as conn:
            sql_students = text("SELECT student_number, name, attendance_no FROM students WHERE homeroom_class = :c_name ORDER BY attendance_no")
            students_rows = conn.execute(sql_students, {"c_name": class_name}).fetchall()

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
            sessions_rows = conn.execute(sql_sessions, {"c_name": class_name, "start": start_date, "end": end_date}).fetchall()

            session_ids = [row.session_id for row in sessions_rows]
            attendance_map = {}
            if session_ids:
                bind_params = {f"id{i}": sid for i, sid in enumerate(session_ids)}
                bind_keys = ", ".join([f":{k}" for k in bind_params.keys()])
                sql_results = text(f"SELECT student_number, session_id, status FROM attendance_results WHERE session_id IN ({bind_keys})")
                results_rows = conn.execute(sql_results, bind_params).fetchall()
                for r in results_rows:
                    attendance_map[(r.student_number, r.session_id)] = r.status

            sessions_by_date = defaultdict(dict)
            for row in sessions_rows:
                d_str = row.date.strftime('%Y-%m-%d') if isinstance(row.date, datetime.date) else str(row.date)
                p = row.period if row.period else 1
                sessions_by_date[d_str][p] = row.session_id

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
                            raw = attendance_map.get((stu.student_number, sess_id))
                            
                            if raw == "出席": status_data.update({"class": "attend", "text": "出席"})
                            elif raw == "欠席": status_data.update({"class": "absent", "text": "欠席"})
                            elif raw == "遅刻": status_data.update({"class": "late", "text": "遅刻"})
                            elif raw == "早退": status_data.update({"class": "early", "text": "早退"})
                            elif raw == "公欠": status_data.update({"class": "public-abs", "text": "公欠"})
                            elif raw == "特欠": status_data.update({"class": "special-abs", "text": "特欠"})
                        
                        day_statuses.append(status_data)
                    stu_record["dates"][d] = day_statuses
                students_data.append(stu_record)

    except Exception as e:
        print(f"❌ Result Error: {e}")
        return render_page(request, "attendanceResult.html", {"error": "データ取得エラー"})

    return render_page(request, "attendanceResult.html", {
        "class_name": class_name, "start_date": start_date, "end_date": end_date,
        "date_headers": date_headers, "students_data": students_data
    })

@app.get("/attendanceStatus", response_class=HTMLResponse)
async def attendance_status(request: Request): return render_page(request, "attendanceStatus.html")

@app.get("/userManagement", response_class=HTMLResponse)
async def user_management(request: Request):
    role = request.session.get("role")
    if role != "teacher": return RedirectResponse(url="/", status_code=303)
    
    user_id = request.session.get("user_id")
    classes = get_teacher_classes(user_id)
    
    students = []
    years = set()
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("SELECT student_number, email, name, homeroom_class, attendance_no FROM students ORDER BY homeroom_class, attendance_no")).fetchall()
            students = rows
            for r in rows:
                if r.student_number and len(r.student_number) >= 4:
                    years.add(r.student_number[:4])
    except Exception as e:
        print(f"UserMgmt Error: {e}")

    return render_page(request, "userManagement.html", {
        "students": students,
        "class_list": classes,
        "years": sorted(list(years), reverse=True)
    })

@app.get("/passwordChange", response_class=HTMLResponse)
async def password_change(request: Request): return render_page(request, "passwordChange.html")

@app.post("/api/generate_otp")
async def generate_otp(req: GenerateOTPRequest):
    val = random.randint(0, 15)
    current_date = datetime.date.today().strftime('%Y-%m-%d')
    cid_val = int(req.class_id) if req.class_id and str(req.class_id).strip() else None

    try:
        with engine.begin() as conn:
            new_id = conn.execute(
                text("INSERT INTO class_sessions (class_id, date, period, sound_token) VALUES (:cid, :date, :period, :token) RETURNING session_id"),
                {"cid": cid_val, "date": current_date, "period": req.period, "token": str(val)}
            ).fetchone()[0]
        return JSONResponse({"otp_binary": format(val, '04b'), "otp_display": val})
    except Exception as e:
        print(f"❌ OTP Error: {e}")
        return JSONResponse({"error": "Database error"}, status_code=500)

@app.post("/api/check_attend")
async def check_attend(req: CheckAttendRequest, request: Request):
    student_id = request.session.get("user_id")
    if not student_id: return JSONResponse({"status": "error", "message": "ログインしてください"})

    try:
        with engine.begin() as conn:
            sess = conn.execute(text("SELECT session_id, sound_token FROM class_sessions ORDER BY session_id DESC LIMIT 1")).fetchone()
            if not sess: return JSONResponse({"status": "error", "message": "授業なし"})
            
            if req.otp_value == int(sess.sound_token):
                conn.execute(
                    text("INSERT INTO attendance_results (session_id, student_number, status, note) VALUES (:sid, :stu, '出席', 'アプリ')"),
                    {"sid": sess.session_id, "stu": student_id}
                )
                return JSONResponse({"status": "success", "message": "出席完了"})
            else:
                return JSONResponse({"status": "error", "message": "コード不一致"})
    except Exception as e:
        print(f"❌ Check Error: {e}")
        return JSONResponse({"status": "error", "message": "エラー発生"})

@app.post("/api/update_status")
async def update_status(req: UpdateStatusRequest):
    try:
        with engine.begin() as conn:
            c_row = conn.execute(text("SELECT class_id FROM classes WHERE class_name = :name"), {"name": req.class_name}).fetchone()
            if not c_row: return JSONResponse({"status": "error", "message": "クラス不明"}, status_code=404)
            class_id = c_row.class_id

            s_row = conn.execute(
                text("SELECT session_id FROM class_sessions WHERE class_id = :cid AND date = :date AND period = :period"),
                {"cid": class_id, "date": req.date, "period": req.period}
            ).fetchone()

            if not s_row:
                session_id = conn.execute(
                    text("INSERT INTO class_sessions (class_id, date, period, sound_token) VALUES (:cid, :date, :period, '0000') RETURNING session_id"),
                    {"cid": class_id, "date": req.date, "period": req.period}
                ).fetchone()[0]
            else:
                session_id = s_row.session_id

            exist = conn.execute(
                text("SELECT result_id FROM attendance_results WHERE session_id = :sid AND student_number = :stu"),
                {"sid": session_id, "stu": req.student_number}
            ).fetchone()

            if exist:
                conn.execute(
                    text("UPDATE attendance_results SET status = :st, note = :nt WHERE result_id = :rid"),
                    {"st": req.status, "nt": req.note, "rid": exist.result_id}
                )
            else:
                conn.execute(
                    text("INSERT INTO attendance_results (session_id, student_number, status, note) VALUES (:sid, :stu, :st, :nt)"),
                    {"sid": session_id, "stu": req.student_number, "st": req.status, "nt": req.note}
                )
            
            print(f"✅ Updated: {req.student_number} -> {req.status} (Date: {req.date})")
            return JSONResponse({"status": "success", "message": "更新しました"})

    except Exception as e:
        print(f"❌ Update Error: {e}")
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

@app.post("/api/delete_users")
async def delete_users(req: DeleteUsersRequest):
    if not req.student_numbers:
        return JSONResponse({"status": "error", "message": "No users selected"})
    
    try:
        with engine.begin() as conn:
            conn.execute(
                text("DELETE FROM attendance_results WHERE student_number = ANY(:ids)"),
                {"ids": req.student_numbers}
            )
            conn.execute(
                text("DELETE FROM students WHERE student_number = ANY(:ids)"),
                {"ids": req.student_numbers}
            )
        return JSONResponse({"status": "success"})
    except Exception as e:
        print(f"Delete Error: {e}")
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

@app.get("/api/download_csv")
async def download_csv(class_name: str, start_date: str, end_date: str):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['日付', '時限', 'クラス', '出席番号', '学籍番号', '氏名', '状態', '備考'])

    try:
        s_date = datetime.datetime.strptime(start_date, '%Y-%m-%d')
        e_date = datetime.datetime.strptime(end_date, '%Y-%m-%d')
        delta = e_date - s_date
        date_list = [(s_date + timedelta(days=i)).strftime('%Y-%m-%d') for i in range(delta.days + 1)]

        with engine.connect() as conn:
            sql_students = text("SELECT student_number, name, attendance_no FROM students WHERE homeroom_class = :c_name ORDER BY attendance_no")
            students = conn.execute(sql_students, {"c_name": class_name}).fetchall()

            sql_sessions = text("""
                SELECT s.session_id, s.date, s.period
                FROM class_sessions s
                JOIN attendance_results ar ON s.session_id = ar.session_id
                JOIN students stu ON ar.student_number = stu.student_number
                WHERE stu.homeroom_class = :c_name 
                  AND s.date >= :start 
                  AND s.date <= :end
            """)
            sessions = conn.execute(sql_sessions, {"c_name": class_name, "start": start_date, "end": end_date}).fetchall()
            
            session_map = defaultdict(dict)
            for s in sessions:
                d_str = s.date.strftime('%Y-%m-%d') if isinstance(s.date, datetime.date) else str(s.date)
                session_map[d_str][s.period] = s.session_id

            res_map = {}
            if sessions:
                s_ids = [s.session_id for s in sessions]
                bind_params = {f"id{i}": sid for i, sid in enumerate(s_ids)}
                bind_keys = ", ".join([f":{k}" for k in bind_params.keys()])
                sql_res = text(f"SELECT student_number, session_id, status, note FROM attendance_results WHERE session_id IN ({bind_keys})")
                results = conn.execute(sql_res, bind_params).fetchall()
                for r in results:
                    res_map[(r.student_number, r.session_id)] = (r.status, r.note)

            for d_str in date_list:
                for period in range(1, 5):
                    sess_id = session_map.get(d_str, {}).get(period)
                    
                    for stu in students:
                        status = "データなし"
                        note = ""
                        if sess_id:
                            val = res_map.get((stu.student_number, sess_id))
                            if val:
                                status, note = val
                        
                        writer.writerow([
                            d_str, period, class_name,
                            stu.attendance_no, stu.student_number, stu.name,
                            status, note or ""
                        ])

    except Exception as e:
        print(f"CSV Gen Error: {e}")
        writer.writerow(["Error", str(e)])

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8-sig')),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=attendance_{class_name}_{start_date}.csv"}
    )