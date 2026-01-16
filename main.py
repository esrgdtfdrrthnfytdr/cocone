# 冒頭のインポートに追加
from collections import defaultdict
from typing import Optional # 既に記述済みなら不要

# ... (中略) ...

# 5. 出欠席結果画面 (attendanceResult.html)
@app.get("/attendanceResult", response_class=HTMLResponse)
async def attendance_result(
    request: Request,
    class_name: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    # パラメータが不足している場合はエラー表示などの対策
    if not class_name or not start_date or not end_date:
        return render_page(request, "attendanceResult.html", {
            "error": "検索条件が不足しています",
            "students_data": [],
            "date_headers": []
        })

    students_data = []
    date_headers = []

    try:
        with engine.connect() as conn:
            # -------------------------------------------------------
            # 1. データの準備
            # -------------------------------------------------------
            
            # クラス名から class_id を取得 (セッション検索用)
            # ※ studentsテーブルは文字列(homeroom_class)で結合、sessionsはIDで結合しているため
            class_row = conn.execute(
                text("SELECT class_id FROM classes WHERE class_name = :name"),
                {"name": class_name}
            ).fetchone()
            
            if not class_row:
                return render_page(request, "attendanceResult.html", {
                    "error": "指定されたクラスが見つかりません",
                    "students_data": [], 
                    "date_headers": []
                })
            
            target_class_id = class_row.class_id

            # -------------------------------------------------------
            # 2. 必要なデータをDBから取得
            # -------------------------------------------------------

            # (A) 生徒一覧を取得 (行の基準)
            sql_students = text("""
                SELECT student_number, name, attendance_no 
                FROM students 
                WHERE homeroom_class = :c_name 
                ORDER BY attendance_no
            """)
            students_rows = conn.execute(sql_students, {"c_name": class_name}).fetchall()

            # (B) 対象期間・対象クラスの授業セッションを取得 (列の基準)
            sql_sessions = text("""
                SELECT session_id, date 
                FROM class_sessions 
                WHERE class_id = :cid 
                  AND date >= :start 
                  AND date <= :end
                ORDER BY date, session_id
            """)
            sessions_rows = conn.execute(sql_sessions, {
                "cid": target_class_id,
                "start": start_date,
                "end": end_date
            }).fetchall()

            # セッションIDリスト作成
            session_ids = [row.session_id for row in sessions_rows]

            # (C) 出席結果を一括取得
            attendance_map = {} # キー: (student_number, session_id), 値: status
            
            if session_ids:
                # tuple(session_ids) で IN句に渡す
                # ※SQLAlchemyでのIN句の扱いに注意が必要ですが、ここではtext構文+バインドパラメータ展開で簡易実装
                # session_idsが空でない場合のみ実行
                
                # パラメータ名を動的に生成 (:id0, :id1...) してバインド
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

            # -------------------------------------------------------
            # 3. データの整形 (テンプレートで扱いやすい形に変換)
            # -------------------------------------------------------

            # 日付ごとにセッションIDをまとめる (1日複数コマ対応)
            # sessions_by_date = { '2025-11-16': [id1, id2], ... }
            sessions_by_date = defaultdict(list)
            for row in sessions_rows:
                sessions_by_date[row.date].append(row.session_id)
            
            # 列ヘッダー用日付リスト
            date_headers = sorted(sessions_by_date.keys())

            # 生徒ごとのデータ構築
            for stu in students_rows:
                stu_record = {
                    "number": stu.attendance_no,
                    "student_number": stu.student_number,
                    "name": stu.name,
                    "dates": {} # 日付をキーにしたステータスリスト
                }

                for d in date_headers:
                    day_session_ids = sessions_by_date[d]
                    day_statuses = []

                    for i, sess_id in enumerate(day_session_ids):
                        raw_status = attendance_map.get((stu.student_number, sess_id))
                        
                        # 表示用データ作成
                        status_data = {
                            "period": i + 1, # 何コマ目か
                            "class": "no-data",
                            "text": "データなし" # 欠席ではなく未登録状態
                        }

                        # DBの値をCSSクラスに変換
                        if raw_status == "出席":
                            status_data.update({"class": "attend", "text": "出席"})
                        elif raw_status == "欠席":
                            status_data.update({"class": "absent", "text": "欠席"})
                        elif raw_status == "遅刻":
                            status_data.update({"class": "late", "text": "遅刻"})
                        elif raw_status == "早退":
                            status_data.update({"class": "early", "text": "早退"})
                        elif raw_status == "公欠":
                            status_data.update({"class": "public-abs", "text": "公欠"})
                        
                        day_statuses.append(status_data)

                    stu_record["dates"][d] = day_statuses

                students_data.append(stu_record)

    except Exception as e:
        print(f"❌ Error in attendanceResult: {e}")
        return render_page(request, "attendanceResult.html", {"error": "データ取得中にエラーが発生しました"})

    return render_page(request, "attendanceResult.html", {
        "class_name": class_name,
        "start_date": start_date,
        "end_date": end_date,
        "date_headers": date_headers,   # 日付リスト
        "students_data": students_data, # 整形済みデータ
    })