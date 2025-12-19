let audioCtx;
let bgmBuffer = null;
let bgmSource = null;
let osc = null;

// 設定
const BGM_URL = '/static/sounds/bgm.wav'; 
const FREQ_START = 21000; // 開始合図
const FREQ_1 = 20000;     // ビット1
const FREQ_0 = 19000;     // ビット0
const BIT_DURATION = 1.0; // 1ビットあたりの秒数

// ページ読み込み時にBGMをロード
window.addEventListener('load', async () => {
    updateStatusUI("BGMを読み込んでいます...", false);
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const response = await fetch(BGM_URL);
        const arrayBuffer = await response.arrayBuffer();
        bgmBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        
        updateStatusUI("準備完了。送信可能です。", false);
        document.getElementById('btn-send').disabled = false;
    } catch (e) {
        console.error(e);
        updateStatusUI("BGM読み込みエラー: " + e, false);
    }
});

document.getElementById('btn-send').addEventListener('click', async () => {
    // 1. サーバーからOTPを取得
    const res = await fetch('/api/generate_otp', { method: 'POST' });
    const data = await res.json();
    
    // UI表示更新
    const otpDisplay = document.querySelector('.otp-number') || document.getElementById('otp-display');
    if(otpDisplay) otpDisplay.innerText = data.otp_display;
    
    // 2. 再生開始
    playMixedSound(data.otp_binary);
});

function playMixedSound(binaryStr) {
    if (!bgmBuffer) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    // --- A. BGM再生 ---
    bgmSource = audioCtx.createBufferSource();
    bgmSource.buffer = bgmBuffer;
    bgmSource.loop = true; 
    
    const bgmGain = audioCtx.createGain();
    bgmGain.gain.value = 0.4; // 音量調整(BGM控えめ)
    bgmSource.connect(bgmGain);
    bgmGain.connect(audioCtx.destination);

    // --- B. データ信号(超音波) ---
    osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    oscGain.gain.value = 0.1; // 超音波も音割れしない程度に
    
    osc.connect(oscGain);
    oscGain.connect(audioCtx.destination);

    const startTime = audioCtx.currentTime;

    // 1. スタート信号
    osc.frequency.setValueAtTime(FREQ_START, startTime);
    
    // 2. データ信号
    for (let i = 0; i < binaryStr.length; i++) {
        const bit = binaryStr[i];
        const time = startTime + BIT_DURATION + (i * BIT_DURATION);
        const freq = (bit === '1') ? FREQ_1 : FREQ_0;
        osc.frequency.setValueAtTime(freq, time);
    }

    // 3. 終了処理
    const totalDuration = BIT_DURATION + (binaryStr.length * BIT_DURATION);
    const endTime = startTime + totalDuration;

    bgmSource.start(startTime);
    osc.start(startTime);

    osc.stop(endTime);
    bgmSource.stop(endTime + 2.0); // BGMは少し余韻を残す

    updateStatusUI("📡 送信中...", true);
    setTimeout(() => updateStatusUI("送信完了", false), (totalDuration + 2) * 1000);
}

function updateStatusUI(msg, isProcessing) {
    const status = document.getElementById('status-area');
    if(status) {
        status.innerText = msg;
        status.style.color = isProcessing ? "red" : "#666";
    }
}