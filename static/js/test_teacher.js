document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 1. DOM要素の取得
    // ==========================================
    const startBtn = document.getElementById('submit-btn'); // 出席開始ボタン
    const stopBtn = document.getElementById('stop-btn');    // 停止ボタン
    const classSelect = document.getElementById('class-select'); // クラス選択プルダウン
    
    const otpNumberDisplay = document.getElementById('otp-number'); // 数字表示エリア
    const statusMessage = document.getElementById('status-message'); // ステータス表示

    // 音響通信用の変数
    let isPlaying = false;
    let sequenceLoop = null;
    let synth = null;

    // ==========================================
    // 2. 音響通信の設定 (Tone.js)
    // ==========================================
    // 変更点: 4ビットの0/1に対応する周波数 + マーカー音
    // 安定性を高めるため、周波数間隔を広げ、速度(DURATION)を落としました
    const FREQ_MARKER = 17000; // 開始合図 (18000 -> 17000Hz)
    const FREQ_BIT_0  = 18000; // ビット0 (18500 -> 18000Hz)
    const FREQ_BIT_1  = 19000; // ビット1 (変更なし)
    const DURATION    = 0.5;   // 1音の長さ(秒) ※0.1 -> 0.5へ変更

    // 音の再生準備
    async function initAudio() {
        await Tone.start();
        if (!synth) {
            synth = new Tone.Synth().toDestination();
            synth.volume.value = -10; // 音量調整
        }
    }

    // OTP(2進数文字列)を音に変換してループ再生
    function playSoundPattern(binaryStr) {
        // パターン作成: [マーカー, bit0, bit1, bit2, bit3, 休止...]
        const pattern = [];
        
        // 1. 開始マーカー
        pattern.push({ time: 0, freq: FREQ_MARKER });

        // 2. データビット (4bit)
        for (let i = 0; i < 4; i++) {
            const bit = binaryStr[i];
            const freq = (bit === '1') ? FREQ_BIT_1 : FREQ_BIT_0;
            pattern.push({ time: (i + 1) * DURATION, freq: freq });
        }

        // 3. ループ設定
        // 変更点: 最後の休止を少し長めにとる (0.5 -> 1.0)
        const totalDuration = (1 + 4) * DURATION + 1.0; 

        sequenceLoop = new Tone.Loop((time) => {
            // マーカー再生
            synth.triggerAttackRelease(FREQ_MARKER, DURATION, time);

            // 各ビット再生
            for (let i = 0; i < 4; i++) {
                const bit = binaryStr[i];
                const freq = (bit === '1') ? FREQ_BIT_1 : FREQ_BIT_0;
                const noteTime = time + ((i + 1) * DURATION);
                synth.triggerAttackRelease(freq, DURATION, noteTime);
            }
        }, totalDuration).start(0);

        Tone.Transport.start();
        isPlaying = true;
    }

    // ==========================================
    // 3. イベントリスナー (ボタン操作)
    // ==========================================

    // ▼ 出席開始ボタン
    startBtn.addEventListener('click', async () => {
        // (1) クラス選択チェック
        const classId = classSelect.value;
        if (!classId) {
            alert("クラスを選択してください！");
            return;
        }

        // (2) オーディオ初期化
        await initAudio();

        // (3) ボタン状態の切り替え
        startBtn.disabled = true;
        classSelect.disabled = true; // 途中でクラスを変えられないようにする
        stopBtn.disabled = false;
        statusMessage.textContent = "出席受付中...音声を送信しています";
        statusMessage.style.color = "red";

        try {
            // (4) APIへOTP生成リクエスト (クラスIDを送信)
            const res = await fetch('/api/generate_otp', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ class_id: classId }) // ★ここでIDを送る
            });

            if (!res.ok) {
                throw new Error("API Error");
            }

            const data = await res.json();
            const otpDisplay = data.otp_display; // 画面表示用 (例: 10)
            const otpBinary  = data.otp_binary;  // 音響用 (例: "1010")

            // (5) 画面更新
            otpNumberDisplay.textContent = otpDisplay;

            // (6) 音声送信開始
            console.log(`Playing Sound for OTP: ${otpDisplay} (${otpBinary})`);
            playSoundPattern(otpBinary);

        } catch (err) {
            console.error(err);
            alert("エラーが発生しました");
            // エラー時はリセット
            stopAttendance();
        }
    });

    // ▼ 停止ボタン
    stopBtn.addEventListener('click', () => {
        stopAttendance();
    });

    // 停止処理
    function stopAttendance() {
        // 音を止める
        if (sequenceLoop) {
            sequenceLoop.stop();
            sequenceLoop.dispose();
            sequenceLoop = null;
        }
        Tone.Transport.stop();
        isPlaying = false;

        // UIを元に戻す
        startBtn.disabled = false;
        classSelect.disabled = false;
        stopBtn.disabled = true;
        
        statusMessage.textContent = "待機中";
        statusMessage.style.color = "#333";
        otpNumberDisplay.textContent = "----";
    }
});