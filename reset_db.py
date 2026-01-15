import os
import sys
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# 文字化け対策
sys.stdout.reconfigure(encoding='utf-8')

# .env読み込み
load_dotenv()

# DB接続
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("❌ .env が見つかりません")
    sys.exit(1)

# DBエンジンの作成
engine = create_engine(DATABASE_URL, connect_args={"options": "-c client_encoding=utf8"})

def run_sql_file(filename):
    """指定されたSQLファイルを読み込んで実行する"""
    print(f"📂 ファイル読み込み中: {filename}")
    
    if not os.path.exists(filename):
        print(f"❌ ファイルが見つかりません: {filename}")
        return False

    try:
        with open(filename, 'r', encoding='utf-8') as f:
            sql_content = f.read()
            
        with engine.connect() as conn:
            # トランザクション開始
            trans = conn.begin()
            try:
                # SQLファイルの中身を一括実行
                conn.execute(text(sql_content))
                trans.commit()
                print(f"✅ 実行成功: {filename}")
                return True
            except Exception as e:
                trans.rollback()
                print(f"❌ SQL実行エラー ({filename}):\n{e}")
                return False
                
    except Exception as e:
        print(f"❌ ファイル読み込みエラー: {e}")
        return False

def main():
    print(f"🔗 データベース接続: {DATABASE_URL}")
    print("-" * 30)

    # 1. テーブル初期化 (db/init.sql)
    if run_sql_file("db/init.sql"):
        
        # 2. テストデータ投入 (db/test_data.sql)
        if run_sql_file("db/test_data.sql"):
            print("-" * 30)
            print("🎉 すべての処理が完了しました！")
            print("ブラウザからログインを試してください。")
        else:
            print("⚠ データの投入に失敗しました。")
    else:
        print("⚠ テーブルの初期化に失敗しました。")

if __name__ == "__main__":
    main()