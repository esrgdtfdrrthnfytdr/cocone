// static/js/test_teacher.js

let audioCtx;
let bgmBuffer = null;
let bgmSource = null;
let bgmGainNode = null;
let osc = null;
let isScanning = false;
let nextSignalTimer = null;
let isBgmOn = true;

// --- 設定 ---
const BGM_URL = '/static/sounds/bgm.wav';

const FREQ_START = 19000; // スタート信号（実績あり）
const FREQ_BIT_0 = 19300; // 旧18500 -> 19300へ変更（19000以上にする）
const FREQ_BIT_1 = 19700; // 旧19500 -> 19700へ変更（さらに高く）

// 信号の長さ設定
// 受信側の多数決処理（約400ms）に対して余裕を持たせるため 0.6秒 に設定
const BIT_DURATION = 0.6;
const LOOP_GAP_SEC = 2.0;   // ループ間の休憩時間
const BGM_VOLUME = 0.4;     // BGMの音量

// --- UI要素 ---
const submitBtn = document.getElementById('submit-btn');
// HTML側のIDが 'class-select' であることに注意
const classSelect = document.getElementById('class-select'); 
const errorMessage = document.getElementById('error-message');
const volSlider = document.getElementById('signal-volume');
const volDisplay = document.getElementById('vol-display');
const bgmToggleBtn = document.getElementById('bgm-toggle-btn');

// 音量スライダーの表示更新
if (volSlider && volDisplay) {
    volSlider.addEventListener('input', (e) => {
        volDisplay.textContent = e.target.value;
    });
}

// BGM切り替えボタン
if (bgmToggleBtn) {
    bgmToggleBtn.addEventListener('click', () => {
        isBgmOn = !isBgmOn;
        if (isBgmOn) {
            bgmToggleBtn.textContent = "🎵 BGM: ON";
            bgmToggleBtn.style.backgroundColor = "#63D2B0";
        } else {
            bgmToggleBtn.textContent = "🔇 BGM: OFF";
            bgmToggleBtn.style.backgroundColor = "#95A5A6";
        }
        if (bgmGainNode) {
            bgmGainNode.gain.value = isBgmOn ? BGM_VOLUME : 0;
        }
    });
}

// 初期化：ページロード時にBGMを読み込む
window.addEventListener('load', async () => {
    try {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();

        const response = await fetch(BGM_URL);
        const arrayBuffer = await response.arrayBuffer();
        bgmBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        console.log("BGM Ready");
    } catch (e) {
        console.error("BGM Load Error:", e);
    }
});

// 出席確認ボタンクリック処理
if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
        if (isScanning) {
            stopSound();
            return;
        }

        // ブラウザの自動再生制限解除
        if (audioCtx && audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        /* 必要に応じてクラス選択チェックを有効化してください
        const selectedValue = classSelect ? classSelect.value : null;
        if (!selectedValue) {
             if(errorMessage) {
                 errorMessage.textContent = 'クラスを選択してください';
                 errorMessage.classList.add('show');
             }
             return;
        }
        */

        if(errorMessage) {
            errorMessage.textContent = '';
            errorMessage.classList.remove('show');
        }

        try {
            // APIからOTP取得
            const res = await fetch('/api/generate_otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}) // 必要なら { class_id: ... }
            });

            if (!res.ok) throw new Error("Server Response Error");
            const data = await res.json();

            startScanningUI();
            playMixedSoundLoop(data.otp_binary);

        } catch(e) {
            console.error(e);
            alert("通信エラーが発生しました");
            stopSound();
        }
    });
}

function startScanningUI() {
    isScanning = true;
    submitBtn.textContent = '停止する';
    submitBtn.classList.add('is-processing');
    if(classSelect) classSelect.disabled = true;
}

function stopScanningUI() {
    isScanning = false;
    submitBtn.textContent = '出席確認';
    submitBtn.classList.remove('is-processing');
    if(classSelect) classSelect.disabled = false;
}

// BGMと信号の再生開始
function playMixedSoundLoop(binaryStr) {
    if (!audioCtx) return;

    // BGM再生
    if (bgmBuffer) {
        bgmSource = audioCtx.createBufferSource();
        bgmSource.buffer = bgmBuffer;
        bgmSource.loop = true;

        bgmGainNode = audioCtx.createGain();
        bgmGainNode.gain.value = isBgmOn ? BGM_VOLUME : 0;

        bgmSource.connect(bgmGainNode);
        bgmGainNode.connect(audioCtx.destination);
        bgmSource.start(0);
    }

    playSignalRecursive(binaryStr);
}

// 信号パターンの再帰再生
function playSignalRecursive(binaryStr) {
    if (!isScanning || !audioCtx) return;

    osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();

    // スライダーから信号音量を取得
    const currentVol = volSlider ? parseFloat(volSlider.value) : 0.1;
    oscGain.gain.value = currentVol;

    osc.connect(oscGain);
    oscGain.connect(audioCtx.destination);

    const startTime = audioCtx.currentTime;

    // 1. スタートマーカー (19000Hz)
    osc.frequency.setValueAtTime(FREQ_START, startTime);

    // 2. データビット (18500Hz / 19500Hz)
    for (let i = 0; i < binaryStr.length; i++) {
        const bit = binaryStr[i];
        const time = startTime + BIT_DURATION + (i * BIT_DURATION);
        
        // ビット0なら18500Hz, ビット1なら19500Hzへ切り替え
        osc.frequency.setValueAtTime((bit === '1' ? FREQ_BIT_1 : FREQ_BIT_0), time);
    }

    // 終了時間を計算 (マーカー1音 + データ4音)
    const totalDuration = BIT_DURATION + (binaryStr.length * BIT_DURATION);
    const endTime = startTime + totalDuration;

    osc.start(startTime);
    osc.stop(endTime);

    osc.onended = () => {
        osc = null;
        if (isScanning) {
            // ループ間隔をあけて再実行
            nextSignalTimer = setTimeout(() => {
                playSignalRecursive(binaryStr);
            }, LOOP_GAP_SEC * 1000);
        }
    };
}

// 停止処理
function stopSound() {
    isScanning = false;
    if (nextSignalTimer) {
        clearTimeout(nextSignalTimer);
        nextSignalTimer = null;
    }
    if(osc) {
        try{ osc.stop(); }catch(e){}
        osc = null;
    }
    if(bgmSource) {
        try{ bgmSource.stop(); }catch(e){}
        bgmSource = null;
    }

    bgmGainNode = null;
    stopScanningUI();
}