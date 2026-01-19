document.addEventListener('DOMContentLoaded', function() {
    
    // --- 戻るボタン ---
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            window.location.href = '/attendanceFilter';
        });
    }

    // --- ダウンロードボタン (CSVダウンロード実装) ---
    const downloadBtn = document.getElementById('download-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', function() {
            // URLパラメータから現在の検索条件を取得
            const urlParams = new URLSearchParams(window.location.search);
            const className = urlParams.get('class_name');
            const startDate = urlParams.get('start_date');
            const endDate = urlParams.get('end_date');

            if (!className || !startDate || !endDate) {
                alert("検索条件が見つかりません。");
                return;
            }

            // APIへリダイレクトしてダウンロードを開始
            // encodeURIComponentで日本語クラス名などを安全に送信
            const url = `/api/download_csv?class_name=${encodeURIComponent(className)}&start_date=${startDate}&end_date=${endDate}`;
            window.location.href = url;
        });
    }

    // --- モーダル制御 ---
    const modal = document.getElementById('change-status-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalSaveBtn = document.getElementById('modal-save-btn');
    
    // 表示要素
    const modalStudentNum = document.getElementById('modal-student-number');
    const modalStudentName = document.getElementById('modal-student-name');
    const modalDate = document.getElementById('modal-date');
    const modalPeriod = document.getElementById('modal-period');
    const modalSelect = document.getElementById('modal-status-select');

    let currentTargetElement = null;
    let currentRawDate = ""; 
    
    // 本当の学籍番号を保持する変数
    let currentRealStudentId = ""; 

    // ステータスセルクリックイベント
    const statusCells = document.querySelectorAll('.status');
    statusCells.forEach(function(cell) {
        cell.addEventListener('click', function() {
            currentTargetElement = cell;

            const row = cell.closest('tr');
            
            // 行(tr)から data-real-id を取得
            currentRealStudentId = row.dataset.realId; 

            // 表示用の出席番号
            const studentIdEl = row.querySelector('.student-id');
            const studentIdDisplay = studentIdEl ? studentIdEl.textContent.trim() : '';

            // 氏名
            const studentNameEl = row.querySelector('.student-name');
            const studentName = studentNameEl ? studentNameEl.textContent.trim() : '';

            // 日付
            const cellTd = cell.closest('td');
            const allTds = Array.from(row.children);
            const tdIndex = allTds.indexOf(cellTd);
            const headerRow = document.querySelector('.result-table thead tr');
            const targetHeader = headerRow ? headerRow.children[tdIndex] : null;
            
            currentRawDate = targetHeader ? targetHeader.textContent.trim() : '';

            // 表示用に日付フォーマット
            let dateDisplay = currentRawDate;
            try {
                const d = new Date(currentRawDate);
                if (!isNaN(d.getTime())) {
                    dateDisplay = `${d.getMonth() + 1}月${d.getDate()}日`;
                }
            } catch(e) {}

            // 時限
            const rawPeriod = cell.dataset.period || '1';
            const periodText = rawPeriod + 'コマ目';

            // モーダルにセット
            if (modalStudentNum) modalStudentNum.textContent = studentIdDisplay;
            if (modalStudentName) modalStudentName.textContent = studentName;
            if (modalDate) modalDate.textContent = dateDisplay;
            if (modalPeriod) modalPeriod.textContent = periodText;

            // ステータス選択の初期値
            if (modalSelect) {
                const statusClasses = ['attend', 'absent', 'late', 'early', 'public-abs', 'special-abs', 'no-data'];
                let currentStatus = 'no-data';
                
                statusClasses.forEach(cls => {
                    if (cell.classList.contains(cls)) {
                        currentStatus = cls;
                    }
                });
                modalSelect.value = currentStatus;
            }

            // モーダル表示
            if (modal) modal.classList.add('active');
        });
    });

    // 閉じる処理
    function closeModal() {
        if (modal) {
            modal.classList.remove('active');
            currentTargetElement = null;
        }
    }

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeModal();
        });
    }

    // 変更ボタンクリック時の処理 (API送信)
    if (modalSaveBtn && modal) {
        modalSaveBtn.addEventListener('click', async function() {
            if (currentTargetElement && modalSelect) {
                const selectedValue = modalSelect.value;
                const selectedText = modalSelect.options[modalSelect.selectedIndex].text;
                
                const urlParams = new URLSearchParams(window.location.search);
                const className = urlParams.get('class_name');
                
                // "1コマ目" -> "1" に変換
                const periodStr = modalPeriod.textContent.replace('コマ目', '');
                const period = parseInt(periodStr) || 1;

                if (!className) {
                    alert("クラス情報がURLから取得できませんでした。");
                    return;
                }

                try {
                    // APIへ送信
                    const response = await fetch('/api/update_status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            class_name: className,
                            student_number: currentRealStudentId,
                            date: currentRawDate,
                            period: period,
                            status: selectedText,
                            note: "手動変更"
                        })
                    });

                    if (response.ok) {
                        // 成功したら画面も更新
                        currentTargetElement.className = 'status'; 
                        currentTargetElement.classList.add(selectedValue);
                        currentTargetElement.textContent = selectedText;
                        
                        console.log('Update success');
                        closeModal();
                    } else {
                        const err = await response.json();
                        alert("保存に失敗しました: " + (err.message || "不明なエラー"));
                    }
                } catch (e) {
                    console.error(e);
                    alert("通信エラーが発生しました");
                }
            }
        });
    }
});