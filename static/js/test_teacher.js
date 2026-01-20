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

// 改良版：高周波シフト設定（モスキート音対策 & 受信精度向上）
const FREQ_START = 19000; // 開始マーカー
const FREQ_BIT_1 = 19500; // ビット1
const FREQ_BIT_0 = 18500; // ビット0

const BIT_DURATION = 0.5;  // 1音の長さ（安定性のため少し長めに設定）
const LOOP_GAP_SEC = 2.0;   // 送信ループ間の空き時間
const BGM_VOLUME = 0.4;     // BGMの音量

// --- UI要素の取得 ---
const submitBtn = document.getElementById('submit-btn');
const classSelect = document.getElementById('class-select'); // 修正：HTMLのIDに合わせる
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

// BGM切り替えボタンの制御
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

// ページ読み込み時にBGMをデコードして準備
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

// --- メイン処理：出席確認ボタンクリック ---
if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
        if (isScanning) {
            stopSound();
            return;
        }

        // ブラウザの自動再生ブロックを解除
        if (audioCtx && audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        // クラス選択チェック（必要に応じてコメントアウトを外してください）
        const selectedValue = classSelect ? classSelect.value : null;
        /*
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
            // APIからOTP（2進数文字列）を取得
            const res = await fetch('/api/generate_otp', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ class_id: selectedValue })
            });
            
            if (!res.ok) throw new Error("Server Response Error");
            const data = await res.json();
            
            startScanningUI();
            playMixedSoundLoop(data.otp_binary);
        } catch(e) {
            console.error(e);
            alert("通信エラーが発生しました");
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

// BGMと信号音を混ぜて再生開始
function playMixedSoundLoop(binaryStr) {
    if (!bgmBuffer || !audioCtx) return;

    bgmSource = audioCtx.createBufferSource();
    bgmSource.buffer = bgmBuffer;
    bgmSource.loop = true;
    
    bgmGainNode = audioCtx.createGain();
    bgmGainNode.gain.value = isBgmOn ? BGM_VOLUME : 0;
    
    bgmSource.connect(bgmGainNode);
    bgmGainNode.connect(audioCtx.destination);
    bgmSource.start(0);

    playSignalRecursive(binaryStr);
}

// 音響信号を再帰的にループ再生
function playSignalRecursive(binaryStr) {
    if (!isScanning || !audioCtx) return;

    osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    
    // スライダーから現在の信号音量を取得
    const currentVol = volSlider ? parseFloat(volSlider.value) : 0.1;
    oscGain.gain.value = currentVol; 
    
    osc.connect(oscGain);
    oscGain.connect(audioCtx.destination);

    const startTime = audioCtx.currentTime;

    // 1. 開始マーカーの周波数を設定
    osc.frequency.setValueAtTime(FREQ_START, startTime);

    // 2. 各ビット（0/1）に応じた周波数を時間差で設定
    for (let i = 0; i < binaryStr.length; i++) {
        const bit = binaryStr[i];
        // マーカーの後に順番に周波数を切り替える
        const time = startTime + BIT_DURATION + (i * BIT_DURATION);
        osc.frequency.setValueAtTime((bit === '1' ? FREQ_BIT_1 : FREQ_BIT_0), time);
    }

    // 終了時間を計算
    const totalDuration = BIT_DURATION + (binaryStr.length * BIT_DURATION);
    const endTime = startTime + totalDuration;

    osc.start(startTime);
    osc.stop(endTime);
    
    // 1回分の再生が終わったら、一定間隔を空けて自分を呼び出す
    osc.onended = () => {
        osc = null;
        if (isScanning) {
            nextSignalTimer = setTimeout(() => {
                playSignalRecursive(binaryStr);
            }, LOOP_GAP_SEC * 1000);
        }
    };
}

// 全ての音を停止
function stopSound() {
    isScanning = false;
    if (nextSignalTimer) {
        clearTimeout(nextSignalTimer);
        nextSignalTimer = null;
    }
    if(osc) { try{ osc.stop(); }catch(e){} osc = null; }
    if(bgmSource) { try{ bgmSource.stop(); }catch(e){} bgmSource = null; }
    
    bgmGainNode = null;
    stopScanningUI();
}