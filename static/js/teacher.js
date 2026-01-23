document.addEventListener('DOMContentLoaded', () => {
    // 1. UI要素の取得
    const startBtn = document.getElementById('submit-btn');
    const classSelect = document.getElementById('class-select');
    const otpNumberDisplay = document.getElementById('otp-number');
    const statusMessage = document.getElementById('status-message');
    
    // 追加UI
    const volSlider = document.getElementById('signal-volume');
    const volDisplay = document.getElementById('vol-display');
    const bgmBtn = document.getElementById('bgm-toggle-btn');

    // 2. 音響設定 (テスト済みの確定設定)
    const FREQ_MARKER = 17000; 
    const FREQ_BIT_0  = 18000; 
    const FREQ_BIT_1  = 19000; 
    const DURATION    = 0.5;   
    const TONE_LENGTH = 0.4;   // 0.1秒の無音を作る

    let isPlaying = false;
    let sequenceLoop = null;
    let synth = null;
    let bgmPlayer = null;
    let isBgmOn = true; 

    // 初期化
    async function initAudio() {
        await Tone.start();

        if (!synth) {
            synth = new Tone.Synth({
                oscillator: { type: "sine" }, // 正弦波
                envelope: { attack: 0.05, decay: 0.1, sustain: 0.8, release: 0.05 }
            }).toDestination();
            if (volSlider) updateVolume(volSlider.value);
        }

        if (!bgmPlayer) {
            bgmPlayer = new Tone.Player({
                url: "/static/sounds/bgm.wav", 
                loop: true, volume: -15
            }).toDestination();
        }
    }

    // 音量反映
    function updateVolume(val) {
        if (!synth) return;
        if (val <= 0) synth.volume.value = -100; 
        else synth.volume.rampTo(20 * Math.log10(val), 0.1);
        if (volDisplay) volDisplay.textContent = val;
    }

    // パターン再生 (APIから受け取った binaryStr を再生)
    function playSoundPattern(binaryStr) {
        const totalDuration = (1 + 4) * DURATION + 2.0; 

        sequenceLoop = new Tone.Loop((time) => {
            // Start
            synth.triggerAttackRelease(FREQ_MARKER, TONE_LENGTH, time);
            // Bits
            for (let i = 0; i < 4; i++) {
                const bit = binaryStr[i];
                const freq = (bit === '1') ? FREQ_BIT_1 : FREQ_BIT_0;
                const noteTime = time + ((i + 1) * DURATION);
                synth.triggerAttackRelease(freq, TONE_LENGTH, noteTime);
            }
        }, totalDuration).start(0);

        Tone.Transport.start();
        isPlaying = true;
        if (isBgmOn && bgmPlayer && bgmPlayer.loaded) bgmPlayer.start();
    }

    // イベントリスナー
    startBtn.addEventListener('click', async () => {
        // 停止処理
        if (isPlaying) {
            stopAttendance();
            return;
        }

        const classId = classSelect.value;
        if (!classId) {
            alert("クラスを選択してください！");
            return;
        }

        try {
            await initAudio(); // AudioContext起動

            // UIを準備中に
            startBtn.disabled = true;
            statusMessage.textContent = "OTP取得中...";

            // APIからOTPを取得
            const res = await fetch('/api/generate_otp', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ class_id: classId })
            });

            if (!res.ok) throw new Error("API Error");
            const data = await res.json();
            
            // 取得成功 -> 再生開始
            const otpDisplay = data.otp_display; // "10 (1010)"
            const otpBinary  = data.otp_binary;  // "1010"

            otpNumberDisplay.textContent = otpDisplay;
            statusMessage.textContent = "信号送信中...";
            statusMessage.style.color = "#E74C3C";

            // ボタンを「停止」に変更
            startBtn.textContent = "停止";
            startBtn.style.backgroundColor = "#ff6b6b"; 
            startBtn.disabled = false;
            classSelect.disabled = true;

            console.log(`Sending: ${otpBinary}`);
            playSoundPattern(otpBinary);

        } catch (err) {
            console.error(err);
            alert("エラー: " + err.message);
            stopAttendance();
        }
    });

    // スライダー
    if (volSlider) volSlider.addEventListener('input', (e) => updateVolume(e.target.value));

    // BGMボタン
    if (bgmBtn) {
        bgmBtn.addEventListener('click', async () => {
            await initAudio(); 
            isBgmOn = !isBgmOn;
            if (isBgmOn) {
                bgmBtn.textContent = "🎵 BGM: ON";
                bgmBtn.style.backgroundColor = "#63D2B0";
                bgmBtn.style.color = "white";
                if (isPlaying && bgmPlayer && bgmPlayer.loaded) bgmPlayer.start();
            } else {
                bgmBtn.textContent = "🎵 BGM: OFF";
                bgmBtn.style.backgroundColor = "#ddd";
                bgmBtn.style.color = "black";
                if (bgmPlayer) bgmPlayer.stop();
            }
        });
    }

    function stopAttendance() {
        if (sequenceLoop) { sequenceLoop.stop(); sequenceLoop.dispose(); sequenceLoop = null; }
        if (bgmPlayer) bgmPlayer.stop();
        Tone.Transport.stop();
        isPlaying = false;

        startBtn.textContent = "出席確認";
        startBtn.style.backgroundColor = ""; 
        startBtn.disabled = false;
        classSelect.disabled = false;
        
        statusMessage.textContent = "待機中";
        statusMessage.style.color = "#666";
        otpNumberDisplay.textContent = "----";
    }
});