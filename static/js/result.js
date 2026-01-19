document.addEventListener('DOMContentLoaded', function() {
    
    // --- 戻るボタン (画面左下) ---
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
            alert('CSVダウンロード機能は未実装です');
        });
    }

    // --- モーダル制御 ---
    const modal = document.getElementById('change-status-modal');
    // IDを画像デザインに合わせて変更したため修正
    const modalCloseBtn = document.getElementById('modal-close-btn'); // 「戻る」ボタン
    const modalSaveBtn = document.getElementById('modal-save-btn');   // 「変更」ボタン
    
    // モーダル内の表示要素
    const modalStudentNum = document.getElementById('modal-student-number'); // 追加
    const modalStudentName = document.getElementById('modal-student-name');
    const modalDate = document.getElementById('modal-date');
    const modalPeriod = document.getElementById('modal-period');
    const modalSelect = document.getElementById('modal-status-select');

    let currentTargetElement = null;

    // ステータスセル(.status)クリック時
    const statusCells = document.querySelectorAll('.status');
    statusCells.forEach(function(cell) {
        cell.addEventListener('click', function() {
            currentTargetElement = cell;

            const row = cell.closest('tr');
            
            // 1. 出席番号を取得 (td.student-id)
            const studentIdEl = row.querySelector('.student-id');
            const studentId = studentIdEl ? studentIdEl.textContent.trim() : '';

            // 2. 氏名を取得 (td.student-name)
            const studentNameEl = row.querySelector('.student-name');
            const studentName = studentNameEl ? studentNameEl.textContent.trim() : '';

            // 3. 日付を取得 (列インデックスから)
            const cellTd = cell.closest('td');
            const allTds = Array.from(row.children);
            const tdIndex = allTds.indexOf(cellTd);
            const headerRow = document.querySelector('.result-table thead tr');
            const targetHeader = headerRow ? headerRow.children[tdIndex] : null;
            // ヘッダーが "YYYY-MM-DD" の場合、画像のように "M月D日" に整形してもよいですが、
            // ここではヘッダーのテキストをそのまま使用します。
            const dateText = targetHeader ? targetHeader.textContent : '';

            // 4. 時限を取得
            // data-period="1" -> "1コマ目" に変換
            const rawPeriod = cell.dataset.period || '';
            const periodText = rawPeriod ? rawPeriod + 'コマ目' : '';

            // 5. モーダルにセット
            if (modalStudentNum) modalStudentNum.textContent = studentId;
            if (modalStudentName) modalStudentName.textContent = studentName;
            if (modalDate) modalDate.textContent = dateText;
            if (modalPeriod) modalPeriod.textContent = periodText;

            // 6. 現在のステータスを選択状態にする
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

    // モーダルを閉じる関数
    function closeModal() {
        if (modal) {
            modal.classList.remove('active');
            currentTargetElement = null;
        }
    }

    // 「戻る」ボタンで閉じる
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeModal);
    }

    // オーバーレイクリックで閉じる
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    // 「変更」ボタン
    if (modalSaveBtn && modal) {
        modalSaveBtn.addEventListener('click', function() {
            if (currentTargetElement && modalSelect) {
                const selectedValue = modalSelect.value;
                const selectedText = modalSelect.options[modalSelect.selectedIndex].text;

                // 画面上のクラスとテキストを更新
                currentTargetElement.className = 'status'; 
                currentTargetElement.classList.add(selectedValue);
                currentTargetElement.textContent = selectedText;

                console.log(`変更完了: ${selectedText}`);
                // ここでDB更新APIなどを呼ぶことができます

                closeModal();
            }
        });
    }
});