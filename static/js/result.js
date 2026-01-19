document.addEventListener('DOMContentLoaded', function() {
    
    // 戻るボタン (画面左下)
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            window.location.href = '/attendanceFilter';
        });
    }

    // ダウンロードボタン
    const downloadBtn = document.getElementById('download-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', function() {
            alert('CSVダウンロード機能は未実装です');
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

    // ステータスセルクリックイベント
    const statusCells = document.querySelectorAll('.status');
    statusCells.forEach(function(cell) {
        cell.addEventListener('click', function() {
            currentTargetElement = cell;

            const row = cell.closest('tr');
            
            // 出席番号
            const studentIdEl = row.querySelector('.student-id');
            const studentId = studentIdEl ? studentIdEl.textContent.trim() : '';

            // 氏名
            const studentNameEl = row.querySelector('.student-name');
            const studentName = studentNameEl ? studentNameEl.textContent.trim() : '';

            // 日付
            const cellTd = cell.closest('td');
            const allTds = Array.from(row.children);
            const tdIndex = allTds.indexOf(cellTd);
            const headerRow = document.querySelector('.result-table thead tr');
            const targetHeader = headerRow ? headerRow.children[tdIndex] : null;
            
            // 日付フォーマット調整 (2025-11-25 -> 11月25日)
            let dateText = targetHeader ? targetHeader.textContent : '';
            try {
                const d = new Date(dateText);
                if (!isNaN(d.getTime())) {
                    dateText = `${d.getMonth() + 1}月${d.getDate()}日`;
                }
            } catch(e) {}

            // 時限
            const rawPeriod = cell.dataset.period || '1';
            const periodText = rawPeriod + 'コマ目';

            // モーダルにセット
            if (modalStudentNum) modalStudentNum.textContent = studentId;
            if (modalStudentName) modalStudentName.textContent = studentName;
            if (modalDate) modalDate.textContent = dateText;
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

    // 変更ボタン
    if (modalSaveBtn && modal) {
        modalSaveBtn.addEventListener('click', function() {
            if (currentTargetElement && modalSelect) {
                const selectedValue = modalSelect.value;
                const selectedText = modalSelect.options[modalSelect.selectedIndex].text;

                // 画面更新
                currentTargetElement.className = 'status'; 
                currentTargetElement.classList.add(selectedValue);
                currentTargetElement.textContent = selectedText;

                console.log('Updated:', selectedText);
                closeModal();
            }
        });
    }
});