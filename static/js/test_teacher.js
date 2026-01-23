document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 1. DOM要素の取得
    // ==========================================
    const startBtn = document.getElementById('submit-btn');
    // test_teacher.htmlにはstop-btnがないため、作成するか、トグル動作にする必要があります。
    // 今回は「出席確認」ボタンを押すと送信開始する仕様に合わせます。
    
    // HTMLのIDに合わせて取得
    const volSlider = document.getElementById('signal-volume');
    const volDisplay = document.getElementById('vol-display');
    const bgmBtn = document.getElementById('bgm-toggle-btn');
    const statusArea = document.getElementById('status-area');

    // ==========================================
    // 2. 音響設定 (Tone.js)
    // ==========================================
    const FREQ_MARKER = 17000; 
    const FREQ_BIT_0  = 18000; 
    const FREQ_BIT_1  = 19000; 
    const DURATION    = 0.5;   // 1ビットの長さ
    const TONE_LENGTH = 0.4;   // 実際に鳴らす時間(歯切れよく)

    // テスト用固定値
    const FIXED_OTP_BINARY = "1111"; 

    let isPlaying = false;
    let sequenceLoop = null;
    let synth = null;
    let bgmPlayer = null;
    let isBgmOn = true; // HTMLの初期表示が「ON」なのでtrue開始

    // 音響初期化
    async function initAudio() {
        await Tone.start();

        // 信号用シンセサイザー
        if (!synth) {
            synth = new Tone.Synth({
                oscillator: { type: "sine" }, // 正弦波
                envelope: {
                    attack: 0.05,
                    decay: 0.1,
                    sustain: 0.8,
                    release: 0.05
                }
            }).toDestination();
            
            // スライダーの値を適用 (0.0~1.0 を デシベルに変換するか、そのまま使うか)
            // Tone.jsのvolumeはデシベル(-infinity ~ 0)が一般的ですが、
            // 簡易的にゲイン調整として扱うため、ここではスライダー値を反映させます。
            // ただし、直接 .volume.value に入れるにはデシベル変換が必要です。
            // 0.1 (スライダー) -> -20dB くらい。
            updateVolume(volSlider.value);
        }

        // BGMプレイヤー
        if (!bgmPlayer) {
            bgmPlayer = new Tone.Player({
                url: "/static/sounds/bgm.wav", 
                loop: true,
                volume: -15, // BGMは控えめに
                onload: () => {
                    console.log("BGM Loaded");
                }
            }).toDestination();
        }
    }

    // 音量更新ロジック
    function updateVolume(val) {
        if (!synth) return;
        // 入力 0.0〜1.0 を デシベル -60〜0 にマッピングする簡易計算
        // 0ならミュート(-Infinity)
        if (val <= 0) {
            synth.volume.value = -100;
        } else {
            // 20 * log10(val) がデシベル変換の基本
            // 例: 0.1 -> -20dB, 1.0 -> 0dB
            const db = 20 * Math.log10(val);
            synth.volume.rampTo(db, 0.1);
        }
        if (volDisplay) volDisplay.textContent = val;
    }

    // OTP再生パターン
    function playSoundPattern(binaryStr) {
        // マーカー + 4ビット + 2.0秒休止
        const totalDuration = (1 + 4) * DURATION + 2.0; 

        sequenceLoop = new Tone.Loop((time) => {
            // 1. 開始合図
            synth.triggerAttackRelease(FREQ_MARKER, TONE_LENGTH, time);

            // 2. データビット
            for (let i = 0; i < 4; i++) {
                const bit = binaryStr[i];
                const freq = (bit === '1') ? FREQ_BIT_1 : FREQ_BIT_0;
                const noteTime = time + ((i + 1) * DURATION);
                synth.triggerAttackRelease(freq, TONE_LENGTH, noteTime);
            }
        }, totalDuration).start(0);

        Tone.Transport.start();
        isPlaying = true;

        // BGM再生
        if (isBgmOn && bgmPlayer && bgmPlayer.loaded) {
            bgmPlayer.start();
        }
    }

    // ==========================================
    // 3. イベントリスナー
    // ==========================================

    // ▼ 送信ボタン
    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            // 既に再生中なら停止する（トグル動作）
            if (isPlaying) {
                stopAttendance();
                return;
            }

            try {
                await initAudio();
                
                // UI変更
                startBtn.textContent = "停止";
                startBtn.style.backgroundColor = "#ff6b6b"; // 赤色に
                if (statusArea) statusArea.textContent = `送信中: ${FIXED_OTP_BINARY}`;

                console.log(`Test Playing: ${FIXED_OTP_BINARY}`);
                playSoundPattern(FIXED_OTP_BINARY);

            } catch (e) {
                alert("オーディオエラー: " + e);
            }
        });
    }

    // ▼ 音量スライダー
    if (volSlider) {
        volSlider.addEventListener('input', (e) => {
            updateVolume(e.target.value);
        });
    }

    // ▼ BGMボタン
    if (bgmBtn) {
        bgmBtn.addEventListener('click', async () => {
            await initAudio(); // 初回クリック対策
            isBgmOn = !isBgmOn;

            if (isBgmOn) {
                bgmBtn.textContent = "🎵 BGM: ON";
                bgmBtn.style.backgroundColor = "#63D2B0";
                // 送信中なら再生開始
                if (isPlaying && bgmPlayer && bgmPlayer.loaded) bgmPlayer.start();
            } else {
                bgmBtn.textContent = "🎵 BGM: OFF";
                bgmBtn.style.backgroundColor = "#95A5A6"; // グレー
                if (bgmPlayer) bgmPlayer.stop();
            }
        });
    }

    // 停止処理
    function stopAttendance() {
        if (sequenceLoop) {
            sequenceLoop.stop();
            sequenceLoop.dispose();
            sequenceLoop = null;
        }
        if (bgmPlayer) {
            bgmPlayer.stop();
        }
        Tone.Transport.stop();
        isPlaying = false;

        // UI戻し
        startBtn.textContent = "出席確認";
        startBtn.style.backgroundColor = ""; // 元の色へ
        if (statusArea) statusArea.textContent = "待機中";
    }
});