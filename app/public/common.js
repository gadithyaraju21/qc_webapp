// common.js

async function checkAuth() {
    const sessionId = localStorage.getItem('sessionId');
    if (!sessionId) {
        window.location.href = '/login.html';
        return null;
    }
    
    try {
        const response = await fetchWithAuth('/user-info');
        const userInfo = await response.json();
        setUserStatus(userInfo.username, userInfo.isAdmin);
        return userInfo;
    } catch (error) {
        console.error('Error checking auth:', error);
        localStorage.removeItem('sessionId');
        localStorage.removeItem('isAdmin');
        window.location.href = '/login.html';
        return null;
    }
}

function setUserStatus(username, isAdmin) {
    const userStatusElement = document.getElementById('userStatus');
    if (userStatusElement) {
        userStatusElement.textContent = `Logged in as: ${username}`;
        if (isAdmin) {
            const adminBadge = document.createElement('span');
            adminBadge.textContent = ' (Admin)';
            adminBadge.className = 'status-admin';
            userStatusElement.appendChild(adminBadge);
        }
    }
}

async function logout() {
    const sessionId = localStorage.getItem('sessionId');
    try {
        const response = await fetchWithAuth('/logout', {
            method: 'GET'
        });
        const data = await response.json();
        if (data.success) {
            localStorage.removeItem('sessionId');
            window.location.href = '/login.html';  // Changed from '/login' to '/login.html'
        } else {
            throw new Error('Logout failed');
        }
    } catch (error) {
        console.error('Error during logout:', error);
        alert('An error occurred during logout. Please try again.');
    }
}

async function fetchWithAuth(url, options = {}) {
    const sessionId = localStorage.getItem('sessionId');
    if (!sessionId) {
        window.location.href = '/login.html';  // Changed from '/login' to '/login.html'
        return;
    }
    const headers = {
        ...options.headers,
        'X-Session-Id': sessionId,
    };
    try {
        const response = await fetch(url, { ...options, headers });
        if (response.status === 401) {
            window.location.href = '/login.html';  // Changed from '/login' to '/login.html'
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        return response;
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
}


async function checkAdminAuth() {
    const sessionId = localStorage.getItem('sessionId');
    if (!sessionId) {
        window.location.href = '/admin-login.html';  
        return;
    }

    try {
        const response = await fetchWithAuth('/admin/check-auth');
        if (response.status === 401) {
            window.location.href = '/admin-login.html';
            return;
        }
    } catch (error) {
        console.error('Error checking admin auth:', error);
        window.location.href = '/admin-login.html';
    }
}

