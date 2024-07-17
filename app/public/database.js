let currentFilter = '';
let isAdmin = false;

document.addEventListener('DOMContentLoaded', async function() {
    const userInfo = await checkAuth();
    if (userInfo) {
        isAdmin = userInfo.isAdmin;
        document.getElementById('userInfo').textContent = `Logged in as: ${userInfo.username}${isAdmin ? ' (Admin)' : ''}`;
        fetchQCLogs();
    }
});

async function fetchQCLogs() {
    try {
        const response = await fetchWithAuth(`/database?filter=${currentFilter}`);
        const qcLogs = await response.json();
        displayQCLogs(qcLogs);
    } catch (error) {
        console.error('Error fetching QC logs:', error);
        alert('Failed to fetch QC logs. Please try again.');
    }
}

function displayQCLogs(qcLogs) {
    const tableBody = document.querySelector('#qcLogTable tbody');
    tableBody.innerHTML = '';
    
    qcLogs.forEach(log => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${log.username}</td>
            <td>${log.patientID}</td>
            <td>${log.sessionID}</td>
            <td>${log.qcType}</td>
            <td>${log.option}</td>
            <td>${log.date}</td>
            <td>${log.time}</td>
        `;
        tableBody.appendChild(row);
    });
}

function filterQCType(qcType) {
    currentFilter = qcType;
    fetchQCLogs();
}

function resetFilter() {
    currentFilter = '';
    fetchQCLogs();
}

async function exportCSV() {
    try {
        const response = await fetchWithAuth(`/export-csv?filter=${currentFilter}`, {
            method: 'POST'
        });
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'qc_log_export.csv';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error exporting CSV:', error);
        alert('Failed to export CSV. Please try again.');
    }
}

document.getElementById('filterT1').addEventListener('click', () => filterQCType('T1'));
document.getElementById('filterFLAIR').addEventListener('click', () => filterQCType('FLAIR'));
document.getElementById('filterLST_AI').addEventListener('click', () => filterQCType('LST_AI'));
document.getElementById('resetFilter').addEventListener('click', resetFilter);
document.getElementById('exportCSV').addEventListener('click', exportCSV);