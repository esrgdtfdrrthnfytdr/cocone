let audioCtx, analyser, dataArray;
let isListening = false;
let detectedBits = "";
let state = "IDLE"; // IDLE, LISTENING_START, RECEIVING
let receiveTimer = null;

// 定数定義（先生側と完全に一致させる）
const FREQ_START_MIN = 20800; // スタート信号(21000)の検知範囲下限
const FREQ_START_MAX = 21200; // スタート信号(21000)の検知範囲上限
const FREQ_1_TARGET = 20000;
const FREQ_0_TARGET = 19000;
const FREQ_TOLERANCE = 400;   // ±400Hzのズレを許容

// iOS対策: ボタンクリック以外でAudioContextを触らない
const btnAttend = document.getElementById('btn-attend');

btnAttend.addEventListener('click', async () => {
    // すでに受信完了していたら何もしない（あるいはリセット）
    if (btnAttend.classList.contains('success')) return;

    try {
        await startMic();
    } catch (e) {
        alert("マイクの起動に失敗しました。\n・ブラウザの設定でマイクを許可してください\n・HTTPS(またはlocalhost)接続か確認してください");
        console.error(e);
        document.getElementById('status-msg').innerText = "エラー: マイクを使用できません";
    }
});

async function startMic() {
    // 1. iOS対策: ここでAudioContextを作る（ユーザー操作直下）
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // 2. マイクの取得
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // UI更新
    btnAttend.classList.add('listening');
    document.getElementById('status-msg').innerText = "👂 信号を探しています...";

    // 3. オーディオ処理グラフの構築
    const source = audioCtx.createMediaStreamSource(stream);

    // 【重要】バンドパスフィルタ (BGM除去用)
    // 18kHz以下の音（BGMや環境音）をバッサリカットします
    const filter = audioCtx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 18000;

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048; // 分解能の設定
    analyser.smoothingTimeConstant = 0.5; // 少し数値をならす

    source.connect(filter);
    filter.connect(analyser); // フィルタを通した音を解析

    dataArray = new Uint8Array(analyser.frequencyBinCount);

    isListening = true;
    updateLoop();
}

function getFrequencyStrength(targetFreq) {
    // 指定した周波数周辺の音量(強さ)を取得する
    const nyquist = audioCtx.sampleRate / 2;
    const index = Math.round(targetFreq / nyquist * analyser.fftSize / 2);

    // ピンポイントだと外すことがあるので、前後も含めて最大値を取る
    let maxVal = 0;
    for (let i = -2; i <= 2; i++) {
        const val = dataArray[index + i] || 0;
        if (val > maxVal) maxVal = val;
    }
    return maxVal;
}

function updateLoop() {
    if (!isListening) return;
    requestAnimationFrame(updateLoop);
    analyser.getByteFrequencyData(dataArray);

    // スタート信号 (21kHz) を監視
    const startSigStrength = getFrequencyStrength(21000);

    // デバッグ用表示（必要に応じて）
    // console.log("21k strength:", startSigStrength);

    // しきい値（環境によるが、150〜200くらいで反応したら検知とする）
    if (state === "IDLE" && startSigStrength > 100) {
        console.log("🚀 スタート信号検知！");
        startReceivingSequence();
    }
}

function startReceivingSequence() {
    if (state !== "IDLE") return;
    state = "RECEIVING";
    detectedBits = "";
    document.getElementById('status-msg').innerText = "📡 データ受信中...";
    document.getElementById('status-msg').style.color = "red";

    // タイミング同期
    // スタート信号(1秒) → [ビット開始]
    // 確実を期すため、スタート検知から「1.5秒後」に最初のビット(の真ん中)を読む

    let bitCount = 0;
    const TOTAL_BITS = 4; // 0-15までなので4ビット

    const readBit = () => {
        analyser.getByteFrequencyData(dataArray);
        const str1 = getFrequencyStrength(FREQ_1_TARGET); // 20kHz
        const str0 = getFrequencyStrength(FREQ_0_TARGET); // 19kHz

        let bit = "?";

        console.log(`Bit check: 1(20k)=${str1}, 0(19k)=${str0}`);

        // 判定ロジック：どちらかが強く鳴っているか
        if (str1 > 50 && str1 > str0) {
            bit = "1";
        } else if (str0 > 50 && str0 > str1) {
            bit = "0";
        } else {
            // ノイズなどで判定不能時。前のビットと同じか、エラーとするか。
            // 今回はとりあえずノイズでも強い方を取るか、'0'とみなす
            bit = (str1 > str0) ? "1" : "0";
        }

        detectedBits += bit;
        // 開発者用ログ
        logDebug(`Bit ${bitCount + 1}: ${bit} (Vol: ${Math.max(str1, str0)})`);

        bitCount++;

        if (bitCount < TOTAL_BITS) {
            // 次のビットは1秒後
            receiveTimer = setTimeout(readBit, 1000);
        } else {
            finishReceiving();
        }
    };

    // 最初の読み取り予約 (スタート信号検知直後だと早すぎるので調整)
    // 送信側：Start(1.0s) -> Bit1(1.0s) -> ...
    // 検知時点はStartの中盤〜後半。
    // Startの終わりまで待って、さらにBit1の中央(0.5s)を狙うため、ここでのwaitは要調整。
    // 仮に検知から1.2秒後に読んでみる。
    receiveTimer = setTimeout(readBit, 1200);
}

function finishReceiving() {
    state = "IDLE";
    isListening = false; // ループ停止

    // 数値変換
    const finalVal = parseInt(detectedBits, 2);

    document.getElementById('status-msg').innerText = "受信完了！";
    document.getElementById('status-msg').style.color = "green";

    // UI更新: 成功状態へ
    const btn = document.getElementById('btn-attend');
    btn.classList.remove('listening');
    btn.classList.add('active'); // 本来は照合成功後にsuccessにするが、演出として

    btn.innerHTML = `<span>${finalVal}</span><span class="btn-text">出席登録する</span>`;

    // 実際に登録APIを叩く処理へ（クリックイベントを差し替え）
    // ここでは自動で送信しちゃうのもアリ
    submitAttendance(finalVal);
}

async function submitAttendance(value) {
    try {
        const res = await fetch('/api/check_attend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ otp_value: value })
        });
        const result = await res.json();

        if (result.status === "success") {
            const btn = document.getElementById('btn-attend');
            btn.classList.remove('active');
            btn.classList.add('success');
            btn.innerHTML = `<span>OK</span><span class="btn-text">${result.message}</span>`;
            document.getElementById('status-msg').innerText = "";
        } else {
            alert("出席コードが違います: " + result.message);
            // 失敗したらリセットしてリトライ可能にする
            location.reload();
        }
    } catch (e) {
        alert("通信エラー");
    }
}