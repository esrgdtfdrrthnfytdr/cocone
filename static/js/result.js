document.addEventListener('DOMContentLoaded', function() {
    
    // --- 戻るボタン ---
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            window.location.href = '/attendanceFilter';
        });
    }

    // --- ダウンロードボタン ---
    const downloadBtn = document.getElementById('download-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', function() {
            alert('CSVファイルのダウンロードを開始します...');
            // CSVダウンロード処理の実装場所
        });
    }

    // --- モーダル制御 ---
    const modal = document.getElementById('change-status-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalSaveBtn = document.getElementById('modal-save-btn');
    
    // モーダル内要素
    const modalName = document.getElementById('modal-student-name');
    const modalDate = document.getElementById('modal-date');
    const modalPeriod = document.getElementById('modal-period');
    const modalSelect = document.getElementById('modal-status-select');
    const modalNote = document.getElementById('modal-note');

    // 編集対象の保持
    let currentTargetElement = null;

    // ステータスセルクリック時
    const statusCells = document.querySelectorAll('.status');
    statusCells.forEach(function(cell) {
        cell.addEventListener('click', function() {
            currentTargetElement = cell;

            // 1. 名前取得
            const row = cell.closest('tr');
            const studentNameEl = row.querySelector('.student-name');
            const studentName = studentNameEl ? studentNameEl.textContent : '';

            // 2. 日付取得
            const cellTd = cell.closest('td');
            const allTds = Array.from(row.children);
            const tdIndex = allTds.indexOf(cellTd);
            
            const headerRow = document.querySelector('.result-table thead tr');
            const targetHeader = headerRow ? headerRow.children[tdIndex] : null;
            const dateText = targetHeader ? targetHeader.textContent : '';

            // 3. 時限取得
            const periodText = cell.dataset.period ? cell.dataset.period + '限' : '';

            // 4. モーダルにセット
            if (modalName) modalName.textContent = studentName;
            if (modalDate) modalDate.textContent = dateText;
            if (modalPeriod) modalPeriod.textContent = periodText;
            if (modalNote) modalNote.value = ''; // 備考は初期化

            // 5. 現在のステータスを選択
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

            // 表示
            if (modal) modal.classList.add('active');
        });
    });

    // モーダルを閉じる
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

    // 保存ボタン（簡易反映のみ）
    if (modalSaveBtn && modal) {
        modalSaveBtn.addEventListener('click', function() {
            if (currentTargetElement && modalSelect) {
                const selectedValue = modalSelect.value;
                const selectedText = modalSelect.options[modalSelect.selectedIndex].text;
                
                // クラス更新
                currentTargetElement.className = 'status'; 
                currentTargetElement.classList.add(selectedValue);
                currentTargetElement.textContent = selectedText;

                console.log(`Saved: ${selectedText}, Note: ${modalNote ? modalNote.value : ''}`);
                
                closeModal();
            }
        });
    }
});