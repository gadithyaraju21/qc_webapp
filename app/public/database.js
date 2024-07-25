document.addEventListener('DOMContentLoaded', async function() {
    const userInfo = await checkAuth();
    if (userInfo) {
        if (isAdmin()) {
            document.getElementById('adminControls').style.display = 'block';
            await populateUserFilter();
        }
        fetchQCLogs();
    }
});

let currentFilter = '';
let currentUserFilter = '';

async function fetchQCLogs() {
    try {
        const response = await fetchWithAuth(`/database?filter=${currentFilter}&userFilter=${currentUserFilter}`);
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
            ${isAdmin() ? `<td><button class="btn danger" onclick="deleteEntry('${log.username}', '${log.patientID}', '${log.sessionID}', '${log.qcType}')"><i class="fas fa-trash-alt"></i> Delete</button></td>` : ''}
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
    currentUserFilter = '';
    document.getElementById('userFilter').value = '';
    fetchQCLogs();
}

async function exportCSV() {
    try {
        const response = await fetchWithAuth(`/export-csv?filter=${currentFilter}&userFilter=${currentUserFilter}`, {
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

async function deleteEntry(username, patientID, sessionID, qcType) {
    if (confirm(`Are you sure you want to delete this entry?\nUsername: ${username}\nPatient ID: ${patientID}\nSession ID: ${sessionID}\nQC Type: ${qcType}`)) {
        try {
            const response = await fetchWithAuth('/admin/deleteEntry', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, patientID, sessionID, qcType }),
            });
            if (response.ok) {
                alert('Entry deleted successfully');
                fetchQCLogs();
            } else {
                alert('Failed to delete entry. Please try again.');
            }
        } catch (error) {
            console.error('Error deleting entry:', error);
            alert('An error occurred while deleting the entry. Please try again.');
        }
    }
}

async function populateUserFilter() {
    try {
        const response = await fetchWithAuth('/admin/users');
        const users = await response.json();
        const userFilter = document.getElementById('userFilter');
        userFilter.innerHTML = '<option value="">All Users</option>';
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.username;
            option.textContent = user.username + (user.isAdmin ? ' (Admin)' : '');
            userFilter.appendChild(option);
        });
    } catch (error) {
        console.error('Error fetching users:', error);
    }
}

function applyUserFilter() {
    currentUserFilter = document.getElementById('userFilter').value;
    fetchQCLogs();
}

async function deleteAllUserEntries() {
    const selectedUser = document.getElementById('userFilter').value;
    if (!selectedUser) {
        alert('Please select a user first.');
        return;
    }
    
    if (confirm(`Are you sure you want to delete ALL entries for user "${selectedUser}"? This action cannot be undone.`)) {
        try {
            const response = await fetchWithAuth('/admin/deleteAllUserEntries', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username: selectedUser }),
            });
            if (response.ok) {
                alert(`All entries for user "${selectedUser}" have been deleted successfully.`);
                fetchQCLogs();
            } else {
                alert('Failed to delete user entries. Please try again.');
            }
        } catch (error) {
            console.error('Error deleting user entries:', error);
            alert('An error occurred while deleting user entries. Please try again.');
        }
    }
}