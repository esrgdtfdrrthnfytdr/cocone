let audioCtx, analyser, dataArray;
let isListening = false;
let detectedBits = "";
let state = "IDLE";

// ==========================================
// 1. 周波数設定 (範囲を広げて安定させる)
// ==========================================
// マーカー(Start): 17000Hz (16500 - 17500)
const FREQ_START_MIN = 16500;
const FREQ_START_MAX = 17500;

// Bit 0: 18000Hz (17600 - 18400)
const FREQ_BIT_0_MIN = 17600;
const FREQ_BIT_0_MAX = 18400;

// Bit 1: 19000Hz (18600 - 19400)
// ※ 19125Hzなどのズレもカバーできるように広めに設定
const FREQ_BIT_1_MIN = 18600;
const FREQ_BIT_1_MAX = 19400;

// テスト用正解定義
const TARGET_BINARY = "1111";

// UI要素
const registerBtn = document.getElementById('register-btn');
const statusMsg = document.getElementById('status-msg');
const debugFreq = document.getElementById('debug-freq');
const debugBits = document.getElementById('debug-bits');

// --- イベントリスナー ---
if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
        if (registerBtn.classList.contains('is-processing')) return;
        try {
            await startMic();
        } catch (e) {
            alert("マイクエラー: " + e);
        }
    });
}

// --- 音響処理 ---
async function startMic() {
    registerBtn.textContent = '信号待機中...';
    registerBtn.classList.add('is-processing');
    if(statusMsg) statusMsg.innerText = "マイク起動: '1111'を待っています";
    if(debugBits) debugBits.innerText = "";

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // iOS対策(無音再生)
    const emptyBuffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = emptyBuffer;
    source.connect(audioCtx.destination);
    source.start(0);
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } 
    });
    const mediaSource = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048; 
    analyser.smoothingTimeConstant = 0.5; // 滑らかに

    // 16kHz以上のハイパスフィルタ
    const filter = audioCtx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 16000; 
    mediaSource.connect(filter);
    filter.connect(analyser);
    
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    isListening = true;
    state = "IDLE";
    updateLoop();
}

// 最も強い周波数を取得
function getDominantFrequency() {
    analyser.getByteFrequencyData(dataArray);
    let maxVal = 0;
    let maxIndex = 0;
    const nyquist = audioCtx.sampleRate / 2;
    const minIndex = Math.floor(16000 * dataArray.length / nyquist);

    for (let i = minIndex; i < dataArray.length; i++) {
        if (dataArray[i] > maxVal) {
            maxVal = dataArray[i];
            maxIndex = i;
        }
    }
    // ノイズ閾値（静かな環境なら30くらい、騒がしいなら50くらい）
    if (maxVal < 40) return 0; 
    return maxIndex * nyquist / dataArray.length;
}

// 待機ループ
function updateLoop() {
    if (!isListening) return;
    requestAnimationFrame(updateLoop);
    
    const freq = getDominantFrequency();
    if (debugFreq) {
        // 現在の周波数を大きく表示
        debugFreq.innerText = Math.round(freq) + " Hz";
        // 判定色付け
        if (freq > FREQ_BIT_1_MIN && freq < FREQ_BIT_1_MAX) debugFreq.style.color = "red"; // Bit 1
        else if (freq > FREQ_BIT_0_MIN && freq < FREQ_BIT_0_MAX) debugFreq.style.color = "blue"; // Bit 0
        else debugFreq.style.color = "#333";
    }

    // スタート信号検知 (Idle時のみ)
    if (state === "IDLE" && freq > FREQ_START_MIN && freq < FREQ_START_MAX) {
        console.log("🚀 START SIGNAL DETECTED");
        if(statusMsg) statusMsg.innerText = `受信開始! (${Math.round(freq)}Hz)`;
        startReceivingSequence();
    }
}

// ==========================================
// 2. 受信ロジック (多数決方式)
// ==========================================
async function startReceivingSequence() {
    if (state !== "IDLE") return;
    state = "RECEIVING";
    detectedBits = "";

    // スタート信号の余韻と、最初のビットへの切り替わりを待つ
    // 0.5秒(Start) + マージン
    await sleep(600); 

    // 4ビット分ループ
    for (let i = 1; i <= 4; i++) {
        const bit = await sampleBit(); // 多数決でビットを決定
        detectedBits += bit;
        
        if(debugBits) debugBits.innerText += bit + " ";
        console.log(`Bit ${i}: ${bit}`);
        
        // 次のビットの開始まで少し待つ調整（サンプリング時間分は経過しているので、残り時間を待つ）
        // sampleBit関数は約300ms消費する。1ビットは500msなので、残り200ms待つ。
        await sleep(200); 
    }

    finishReceiving();
}

// 1ビットの区間（約300ms）をサンプリングして多数決をとる関数
async function sampleBit() {
    let count0 = 0;
    let count1 = 0;
    let countUnknown = 0;
    
    const samples = 10; // 10回チェックする
    const interval = 30; // 30ms間隔 (計300ms)

    for (let j = 0; j < samples; j++) {
        const freq = getDominantFrequency();
        
        if (freq > FREQ_BIT_1_MIN && freq < FREQ_BIT_1_MAX) {
            count1++;
        } else if (freq > FREQ_BIT_0_MIN && freq < FREQ_BIT_0_MAX) {
            count0++;
        } else {
            countUnknown++;
        }
        await sleep(interval);
    }

    console.log(`Sampling: 1=${count1}, 0=${count0}, ?=${countUnknown}`);

    // 判定
    if (count1 > count0 && count1 > 2) return "1"; // 1が優勢
    if (count0 > count1 && count0 > 2) return "0"; // 0が優勢
    
    // どちらでもない、または同数の場合は前回の値を引き継ぐか、エラーとする
    // ここではテスト用に「拾えなかったら0」とするが、1111テストなら1に倒しても良い
    return "?"; 
}

function finishReceiving() {
    state = "IDLE";
    isListening = false;
    registerBtn.classList.remove('is-processing');
    registerBtn.textContent = '出席登録(テスト)';

    console.log("Final Result:", detectedBits);

    // ? が含まれていたら0に変換して判定してみる（簡易エラー訂正）
    const fixedBits = detectedBits.replace(/\?/g, "0");

    if (fixedBits === TARGET_BINARY) {
        alert("【テスト成功】\n正しく '1111' を受信しました！\n(検出値: " + detectedBits + ")");
        if(statusMsg) {
            statusMsg.innerText = "受信成功: 1111";
            statusMsg.style.color = "green";
            statusMsg.style.fontWeight = "bold";
        }
        if(debugBits) debugBits.innerHTML += "<br>✅ MATCHED!";
    } else {
        alert(`【テスト失敗】\n期待値: ${TARGET_BINARY}\n検出値: ${detectedBits}\n\n周波数範囲外の可能性があります。`);
        if(statusMsg) {
            statusMsg.innerText = `不一致: ${detectedBits}`;
            statusMsg.style.color = "red";
        }
    }
}

// ヘルパー関数: 指定ミリ秒待機
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}