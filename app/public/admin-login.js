document.getElementById('adminLoginForm').addEventListener('submit', adminLogin);

async function adminLogin(event) {
    event.preventDefault();
    const adminUsername = document.getElementById('adminUsername').value;
    const adminPassword = document.getElementById('adminPassword').value;
    
    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: adminUsername, password: adminPassword, isAdmin: true })
        });
        
        const data = await response.json();
        
        if (response.ok && data.isAdmin) {
            localStorage.setItem('sessionId', data.sessionId);
            window.location.href = '/admin-panel.html';
        } else {
            const errorMessage = document.getElementById('error-message');
            errorMessage.innerText = data.error || 'Invalid admin username or password';
        }
    } catch (error) {
        console.error('Error during admin login:', error);
        alert('An error occurred during admin login');
    }
}