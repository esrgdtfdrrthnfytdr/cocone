import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Windowsの表示エラー対策
sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()
database_url = os.getenv("DATABASE_URL")

print(f"🔗 接続先: {database_url}")

# ▼▼▼ ここが修正ポイント！ ▼▼▼
# connect_argsを追加して、確実にUTF-8でデータを受け取るようにします
engine = create_engine(
    database_url, 
    connect_args={"options": "-c client_encoding=utf8"}
)
# ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

try:
    with engine.connect() as conn:
        result = conn.execute(text("SELECT * FROM students"))
        
        print("\n=== 👩‍🎓 学生リスト ===")
        for row in result:
            # ここでエラーが出なくなります
            print(f"名前: {row.name}, 学籍番号: {row.student_number}")
            
    print("\n✅ 接続成功！データが見えました！")
    
except Exception as e:
    print("\n❌ エラーが発生しました...")
    print(e)