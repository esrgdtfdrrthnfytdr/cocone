import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Windowsの文字化け対策
sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()
database_url = os.getenv("DATABASE_URL")

# 接続設定
engine = create_engine(
    database_url, 
    connect_args={"options": "-c client_encoding=utf8"}
)

try:
    with engine.connect() as conn:
        print("\n=== 👩‍🎓 生徒リスト (students) ===")
        result = conn.execute(text("SELECT * FROM students"))
        for row in result:
            # 新しいカラム homeroom_class, attendance_no も表示
            print(f"[{row.homeroom_class}-{row.attendance_no}] {row.name} (ID: {row.student_number})")

        print("\n=== 👨‍🏫 講師リスト (teachers) ===")
        result = conn.execute(text("SELECT * FROM teachers"))
        for row in result:
            print(f"ID:{row.teacher_id} {row.name} ({row.email})")

        print("\n=== 📚 授業リスト (courses) ===")
        result = conn.execute(text("SELECT * FROM courses"))
        for row in result:
            print(f"ID:{row.course_id} {row.course_name} (担当講師ID: {row.teacher_id})")
            
    print("\n✅ 接続成功！データは正しく登録されています。")
    
except Exception as e:
    print("\n❌ エラーが発生しました...")
    print(e)