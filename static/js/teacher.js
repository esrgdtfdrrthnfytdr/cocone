document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 1. UI要素の取得
    // ==========================================
    const startBtn = document.getElementById('submit-btn');
    const statusArea = document.getElementById('status-area');

    // ==========================================
    // 2. 音響設定 (BGM + 信号)
    // ==========================================
    const FREQ_MARKER = 17000; 
    const FREQ_BIT_0  = 18000; 
    const FREQ_BIT_1  = 19000; 
    const DURATION    = 0.5;   
    const TONE_LENGTH = 0.4;   

    let isPlaying = false;
    let sequenceLoop = null;
    let synth = null;
    
    // ▼▼▼ ここが重要！変数の宣言 ▼▼▼
    let bgmPlayer = null; 

    async function initAudio() {
        await Tone.start();
        
        // 信号用のシンセサイザー
        if (!synth) {
            synth = new Tone.Synth({
                oscillator: { type: "sine" },
                envelope: { attack: 0.05, decay: 0.1, sustain: 0.8, release: 0.05 }
            }).toDestination();
            synth.volume.value = -5; 
        }

        // ★BGMプレーヤーの初期化
        if (!bgmPlayer) {
            bgmPlayer = new Tone.Player({
                url: "/static/sounds/bgm.wav", 
                loop: true, 
                volume: -15
            }).toDestination();
        }
        
        // 音声ファイルの読み込み待ち
        await Tone.loaded();
    }

    function playSoundPattern(binaryStr) {
        // ▼ BGM再生開始
        if (bgmPlayer && bgmPlayer.loaded) {
            bgmPlayer.start();
        }

        // 信号パターンのループ再生
        const totalDuration = (1 + 4) * DURATION + 2.0; 
        sequenceLoop = new Tone.Loop((time) => {
            synth.triggerAttackRelease(FREQ_MARKER, TONE_LENGTH, time);
            for (let i = 0; i < 4; i++) {
                const bit = binaryStr[i];
                const freq = (bit === '1') ? FREQ_BIT_1 : FREQ_BIT_0;
                const noteTime = time + ((i + 1) * DURATION);
                synth.triggerAttackRelease(freq, TONE_LENGTH, noteTime);
            }
        }, totalDuration).start(0);

        Tone.Transport.start();
        isPlaying = true;
    }

    function updateDisplay(msg, otp = null, color = "#666") {
        if (!statusArea) return;
        if (otp !== null) {
            statusArea.innerHTML = `
                <div style="font-size: 3rem; font-weight: bold; color: #333; margin-bottom: 10px;">${otp}</div>
                <div style="font-size: 1.2rem; color: ${color};">${msg}</div>
            `;
        } else {
            statusArea.innerHTML = `<div style="font-size: 1.2rem; color: ${color};">${msg}</div>`;
        }
    }

    // ==========================================
    // 3. イベント処理
    // ==========================================
    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            if (isPlaying) {
                stopAttendance();
                return;
            }

            const classId = "1"; // 文字列で指定

            try {
                updateDisplay("準備中...");
                await initAudio(); // ここでBGMも読み込まれます

                startBtn.disabled = true;
                updateDisplay("OTP取得中...");

                const res = await fetch('/api/generate_otp', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ class_id: classId })
                });

                if (!res.ok) {
                    const errData = await res.json();
                    console.error("API Detail Error:", errData);
                    throw new Error("API Error");
                }
                const data = await res.json();
                
                const otpDisplay = data.otp_display; 
                const otpBinary  = data.otp_binary;  

                updateDisplay("信号送信中...", otpDisplay, "#E74C3C");

                startBtn.textContent = "停止";
                startBtn.style.backgroundColor = "#ff6b6b"; 
                startBtn.disabled = false;
                
                console.log(`Sending: ${otpBinary}`);
                playSoundPattern(otpBinary);

            } catch (err) {
                console.error(err);
                alert("エラー: " + err.message);
                stopAttendance();
            }
        });
    } else {
        console.error("エラー: 'submit-btn' が見つかりません");
    }

    function stopAttendance() {
        // ループと信号の停止
        if (sequenceLoop) {
            sequenceLoop.stop();
            sequenceLoop.dispose();
            sequenceLoop = null;
        }
        
        // ★BGMの停止
        if (bgmPlayer) {
            bgmPlayer.stop();
        }

        Tone.Transport.stop();
        isPlaying = false;

        if (startBtn) {
            startBtn.textContent = "出席確認";
            startBtn.style.backgroundColor = ""; 
            startBtn.disabled = false;
        }
        
        updateDisplay("待機中");
    }
});