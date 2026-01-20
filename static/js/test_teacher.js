function startReceivingSequence() {
    if (state !== "IDLE") return;
    state = "RECEIVING";
    detectedBits = "";
    let bitCount = 0;

    const readBit = () => {
        let samples = [];      
        let sampleCount = 0;   
        const maxSamples = 15;      // サンプル数を増やして網を広げる
        const sampleInterval = 25;  // 25ms間隔で超高速スキャン

        const takeSample = () => {
            const freq = getDominantFrequency();
            let bit = null;
            
            // 周波数判定の幅をさらに広げる (±300Hz)
            if (freq > 19200 && freq < 19800) bit = "1";      // 19500Hz付近
            else if (freq > 18200 && freq < 18800) bit = "0"; // 18500Hz付近
            
            if (bit !== null) samples.push(bit);
            sampleCount++;

            if (sampleCount < maxSamples) {
                setTimeout(takeSample, sampleInterval);
            } else {
                // 多数決ロジックの「超緩和」
                const count1 = samples.filter(s => s === "1").length;
                const count0 = samples.filter(s => s === "0").length;
                
                let finalBit = "x";
                // 1回でも検知された方を優先。同数の場合は1とする。
                if (count1 > 0 && count1 >= count0) finalBit = "1";
                else if (count0 > 0) finalBit = "0";
                
                detectedBits += finalBit;
                bitCount++;
                console.log(`Bit ${bitCount}: ${finalBit} (1検知:${count1}, 0検知:${count0})`);
                if (debugBits) debugBits.innerText = detectedBits; // リアルタイム更新

                if (bitCount < 4) {
                    setTimeout(readBit, 50); // 次のビットへの遷移を速める
                } else {
                    finishReceiving();
                }
            }
        };
        takeSample();
    };
    // スタート信号直後の待ち時間を短縮（350ms）
    setTimeout(readBit, 350); 
}