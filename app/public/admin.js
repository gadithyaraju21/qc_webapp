document.addEventListener('DOMContentLoaded', function() {
    checkAdminAuth().then(() => {
        fetchUsers();
        document.getElementById('addUserForm').addEventListener('submit', addUser);
        document.getElementById('logoutButton').addEventListener('click', logout);
    }).catch(() => {
        window.location.href = '/admin.html';
    });
});

async function fetchUsers() {
    try {
        const response = await fetchWithAuth('/admin/users');
        const users = await response.json();
        displayUsers(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        document.getElementById('userListFeedback').textContent = 'Failed to fetch users. Please try again.';
    }
}

function displayUsers(users) {
    const userTableBody = document.querySelector('#userTable tbody');
    userTableBody.innerHTML = '';

    if (users.length === 0) {
        document.getElementById('userListFeedback').textContent = 'No users found.';
        return;
    }

    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.username}</td>
            <td><button class="button danger" onclick="deleteUser('${user.username}')">Delete</button></td>
        `;
        userTableBody.appendChild(row);
    });
    document.getElementById('userListFeedback').textContent = '';
}

async function addUser(event) {
    event.preventDefault();
    const newUsername = document.getElementById('newUsername').value;
    const newPassword = document.getElementById('newPassword').value;
    const feedbackElement = document.getElementById('addUserFeedback');

    try {
        const response = await fetchWithAuth('/admin/addUser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: newUsername, password: newPassword })
        });

        if (response.ok) {
            feedbackElement.textContent = 'User added successfully';
            feedbackElement.style.color = 'green';
            document.getElementById('newUsername').value = '';
            document.getElementById('newPassword').value = '';
            fetchUsers();  // Refresh the user list
        } else {
            const errorData = await response.json();
            feedbackElement.textContent = errorData.error || 'Failed to add user';
            feedbackElement.style.color = 'red';
        }
    } catch (error) {
        console.error('Error adding user:', error);
        feedbackElement.textContent = 'An error occurred while adding the user';
        feedbackElement.style.color = 'red';
    }
}

async function deleteUser(username) {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
        return;
    }

    try {
        const response = await fetchWithAuth(`/admin/deleteUser/${username}`, { method: 'DELETE' });
        if (response.ok) {
            fetchUsers();  // Refresh the user list
        } else {
            const errorData = await response.json();
            alert(errorData.error || 'Failed to delete user');
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        alert('An error occurred while deleting the user');
    }
}

async function logout() {
    try {
        const response = await fetchWithAuth('/logout', { method: 'GET' });
        const data = await response.json();
        if (data.success) {
            localStorage.removeItem('sessionId');
            window.location.href = '/login.html';
        } else {
            throw new Error('Logout failed');
        }
    } catch (error) {
        console.error('Error during logout:', error);
        alert('An error occurred during logout. Please try again.');
    }
}