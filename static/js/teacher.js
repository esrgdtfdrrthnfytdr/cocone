let audioCtx;
const FREQ_START = 21000; // 開始合図
const FREQ_1 = 20000;     // ビット1
const FREQ_0 = 19000;     // ビット0
const BIT_DURATION = 1.0; // 1ビットあたりの秒数（ゆっくり確実）

document.getElementById('btn-send').addEventListener('click', async () => {
    // 1. サーバーからOTPを取得
    const res = await fetch('/api/generate_otp', { method: 'POST' });
    const data = await res.json();
    
    document.getElementById('otp-display').innerText = data.otp_display;
    document.getElementById('otp-binary').innerText = data.otp_binary;
    
    playSequence(data.otp_binary);
});

function playSequence(binaryStr) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    const startTime = audioCtx.currentTime;
    
    // 1. スタート信号 (21kHz) を1秒鳴らす
    osc.frequency.setValueAtTime(FREQ_START, startTime);
    
    // 2. データ信号を順番にスケジュールする
    for (let i = 0; i < binaryStr.length; i++) {
        const bit = binaryStr[i];
        const time = startTime + BIT_DURATION + (i * BIT_DURATION);
        const freq = (bit === '1') ? FREQ_1 : FREQ_0;
        
        // 指定時刻に周波数を変更
        osc.frequency.setValueAtTime(freq, time);
    }
    
    // 3. 終了時刻に音を止める
    const endTime = startTime + BIT_DURATION + (binaryStr.length * BIT_DURATION);
    osc.start(startTime);
    osc.stop(endTime);
    
    updateStatusUI(endTime - startTime);
}

function updateStatusUI(duration) {
    const status = document.getElementById('status');
    status.innerText = "📡 データ送信中...";
    status.style.color = "red";
    
    setTimeout(() => {
        status.innerText = "送信完了";
        status.style.color = "green";
    }, duration * 1000);
}