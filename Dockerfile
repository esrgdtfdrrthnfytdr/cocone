# Python 3.11 をベースにする
FROM python:3.11-slim

# Docker内の作業場所を決める
WORKDIR /app

# 必要なOSの部品を入れる (PostgreSQL接続用など)
RUN apt-get update && apt-get install -y \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

# ライブラリをインストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# コードをコピー
COPY . .

# サーバー起動コマンド
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]