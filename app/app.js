const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const crypto = require('crypto');

const app = express();
const port = 8005;
const niftiDir = '/srv/NFS/ms/data/multms-prospective-ext/derivatives/Lreg_v7.3.2';
const segmentationDir = '/srv/NFS/ms/data/multms-prospective-ext/derivatives/LST_AI';
const qcLogDbPath = 'qc_log.db';

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Session storage (in-memory for simplicity, use a proper session store in production)
const sessions = {};

// Database initialization
let db;

// Store valid patients
let validPatients = [];

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

async function initDatabase() {
    db = await open({
        filename: qcLogDbPath,
        driver: sqlite3.Database
    });

    await db.exec(`CREATE TABLE IF NOT EXISTS qc_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        patientID TEXT NOT NULL,
        sessionID TEXT NOT NULL,
        option TEXT NOT NULL,
        qcType TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        UNIQUE(username, patientID, sessionID, qcType)
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        isAdmin INTEGER DEFAULT 0
    )`);

    const adminUsername = 'admin';
    const adminPassword = 'password123';

    const adminExists = await db.get('SELECT * FROM users WHERE username = ? AND isAdmin = 1', [adminUsername]);
    if (!adminExists) {
        const hashedPassword = hashPassword(adminPassword);
        await db.run('INSERT INTO users (username, password, isAdmin) VALUES (?, ?, 1)', [adminUsername, hashedPassword]);
        console.log('Admin user created successfully');
    } else {
        console.log('Admin user already exists');
    }
}

// Authentication middleware
const authenticate = (req, res, next) => {
    const sessionId = req.headers['x-session-id'];
    if (sessions[sessionId]) {
        req.username = sessions[sessionId].username;
        req.isAdmin = sessions[sessionId].isAdmin;
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// Admin authentication middleware
const requireAdminAuth = (req, res, next) => {
    if (req.isAdmin) {
        next();
    } else {
        res.status(403).json({ error: 'Admin access required' });
    }
};

app.get('/user-info', authenticate, (req, res) => {
    res.json({ username: req.username, isAdmin: req.isAdmin });
});

// Function to scan and filter images
async function scanAndFilterImages(baseDir) {
    const patients = await fs.readdir(baseDir);
    const validPatients = [];

    for (const patient of patients) {
        if (patient.startsWith('.')) continue;

        const patientDir = path.join(baseDir, patient);
        const sessions = await fs.readdir(patientDir);

        for (const session of sessions) {
            if (session.startsWith('.')) continue;

            const anatPath = path.join(patientDir, session, 'anat');
            try {
                const files = await fs.readdir(anatPath);
                const hasT1 = files.some(file => file.includes('_T1'));
                const hasFLAIR = files.some(file => file.includes('_FLAIR'));
                
                if (hasT1 && hasFLAIR) {
                    const segPath = path.join(segmentationDir, patient, session);
                    let hasSegmentation = false;
                    try {
                        const segFiles = await fs.readdir(segPath);
                        hasSegmentation = segFiles.some(file => file.endsWith('orig_seg-lst.nii') || file.endsWith('orig_seg-lst.nii.gz'));
                    } catch (error) {
                        // Segmentation directory or files not found
                    }

                    validPatients.push({
                        patient,
                        session,
                        hasT1,
                        hasFLAIR,
                        hasSegmentation
                    });
                }
            } catch (error) {
                console.error(`Error processing anat path for ${patient}/${session}:`, error);
            }
        }
    }

    return validPatients;
}


// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', async (req, res) => {
    const { username, password, isAdmin } = req.body;
    console.log(`Login attempt: username=${username}, isAdmin=${isAdmin}`);

    try {
        const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        console.log('User found:', user ? 'Yes' : 'No');

        if (!user || user.password !== hashPassword(password)) {
            console.log('Invalid credentials');
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (isAdmin && !user.isAdmin) {
            console.log('Not authorized as admin');
            return res.status(403).json({ error: 'Not authorized as admin' });
        }

        console.log('Login successful');
        const sessionId = crypto.randomBytes(16).toString('hex');
        sessions[sessionId] = { username: user.username, isAdmin: user.isAdmin == 1 };
        res.json({ sessionId, isAdmin: user.isAdmin==1 });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/patients-sessions', authenticate, (req, res) => {
    const { qcType } = req.query;
    let filteredPatients;

    if (qcType === 'T1') {
        filteredPatients = validPatients.filter(p => p.hasT1);
    } else if (qcType === 'FLAIR') {
        filteredPatients = validPatients.filter(p => p.hasFLAIR);
    } else if (qcType === 'LST_AI') {
        filteredPatients = validPatients.filter(p => p.hasFLAIR && p.hasSegmentation);
    } else {
        return res.status(400).json({ error: 'Invalid qcType' });
    }

    res.json(filteredPatients.map(({ patient, session, hasT1, hasFLAIR, hasSegmentation }) => ({ 
        patient, 
        session, 
        hasT1, 
        hasFLAIR, 
        hasSegmentation 
    })));
});

app.get('/nifti-files/:patient/:session', authenticate, async (req, res) => {
    try {
        const { patient, session } = req.params;
        const { imageType } = req.query;
        const anatPath = path.join(niftiDir, patient, session, 'anat');
        
        try {
            await fs.access(anatPath);
        } catch (error) {
            return res.status(404).json({ error: 'Anat directory not found' });
        }

        const files = await fs.readdir(anatPath);
        const niftiFiles = files.filter(file => {
            return (imageType === 'T1' && file.includes('_T1')) || (imageType === 'FLAIR' && file.includes('_FLAIR'));
        });

        if (niftiFiles.length === 0) {
            return res.status(404).json({ error: `No ${imageType} files found` });
        }

        res.json(niftiFiles);
    } catch (error) {
        console.error('Error in /nifti-files:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

app.get('/segmentation-files/:patient/:session', authenticate, async (req, res) => {
    try {
        const { patient, session } = req.params;
        const segmentationPath = path.join(segmentationDir, patient, session);
        const files = await fs.readdir(segmentationPath);
        const segmentationFiles = files.filter(file => file.endsWith('orig_seg-lst.nii') || file.endsWith('orig_seg-lst.nii.gz'));
        res.json(segmentationFiles);
    } catch (error) {
        console.error('Error in /segmentation-files:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/nifti/:patient/:session/:filename', authenticate, (req, res) => {
    const { patient, session, filename } = req.params;
    const filePath = path.join(niftiDir, patient, session, 'anat', filename);
    res.sendFile(filePath);
});

app.get('/segmentation/:patient/:session/:filename', authenticate, (req, res) => {
    const { patient, session, filename } = req.params;
    const filePath = path.join(segmentationDir, patient, session, filename);
    res.sendFile(filePath);
});

app.get('/get-qc-log', authenticate, async (req, res) => {
    const { patient, session, qcType } = req.query;
    const username = req.username;

    try {
        const row = await db.get(`SELECT option FROM qc_log 
            WHERE username = ? AND patientID = ? AND sessionID = ? AND qcType = ?`,
            [username, patient, session, qcType]);
        
        if (row) {
            res.json({ option: row.option });
        } else {
            res.json({ option: null });
        }
    } catch (error) {
        console.error('Error fetching QC log:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/log-qc', authenticate, async (req, res) => {
    const { patientID, sessionID, option, qcType, date, time } = req.body;
    const username = req.username;

    try {
        await db.run(`INSERT OR REPLACE INTO qc_log 
            (username, patientID, sessionID, option, qcType, date, time) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [username, patientID, sessionID, option, qcType, date, time]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error logging QC:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update the database route to handle user-specific access and user filtering
app.get('/database', authenticate, async (req, res) => {
    const { filter, userFilter } = req.query;
    try {
        let query = `SELECT username, patientID, sessionID, qcType, option, date, time FROM qc_log`;
        const params = [];

        if (!req.isAdmin) {
            query += ` WHERE username = ?`;
            params.push(req.username);
        } else if (userFilter) {
            query += ` WHERE username = ?`;
            params.push(userFilter);
        }

        if (filter) {
            query += params.length ? ` AND qcType = ?` : ` WHERE qcType = ?`;
            params.push(filter);
        }

        const rows = await db.all(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching database content:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update the export-csv route to handle user-specific access and user filtering
app.post('/export-csv', authenticate, async (req, res) => {
    const { filter, userFilter } = req.query;
    try {
        let query = `SELECT username, patientID, sessionID, qcType, option, date, time FROM qc_log`;
        const params = [];

        if (!req.isAdmin) {
            query += ` WHERE username = ?`;
            params.push(req.username);
        } else if (userFilter) {
            query += ` WHERE username = ?`;
            params.push(userFilter);
        }

        if (filter) {
            query += params.length ? ` AND qcType = ?` : ` WHERE qcType = ?`;
            params.push(filter);
        }

        const rows = await db.all(query, params);
        
        const csvContent = [
            'username,patientID,sessionID,qcType,option,date,time',
            ...rows.map(row => Object.values(row).join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=exported_qc_log.csv');
        res.send(csvContent);
    } catch (error) {
        console.error('Error exporting CSV:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/logout', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    if (sessionId && sessions[sessionId]) {
        delete sessions[sessionId];
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'No active session' });
    }
});

app.get('/admin/check-auth', authenticate, (req, res) => {
    console.log('Admin check-auth request received');
    console.log('User:', req.username, 'isAdmin:', req.isAdmin);
    if (req.isAdmin) {
        console.log('Admin check successful');
        res.sendStatus(200);
    } else {
        console.log('Admin check failed - not an admin');
        res.status(403).json({ error: 'Admin access required' });
    }
});

app.post('/admin/addUser', authenticate, requireAdminAuth, async (req, res) => {
    const { username, password, isAdmin } = req.body;

    try {
        const existingUser = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const hashedPassword = hashPassword(password);
        await db.run('INSERT INTO users (username, password, isAdmin) VALUES (?, ?, ?)', [username, hashedPassword, isAdmin ? 1 : 0]);
        res.status(201).json({ message: 'User added successfully' });
    } catch (error) {
        console.error('Error adding user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/admin/resetPassword/:username', authenticate, requireAdminAuth, async (req, res) => {
    const username = req.params.username;
    const tempPassword = crypto.randomBytes(8).toString('hex');
    const hashedPassword = hashPassword(tempPassword);

    try {
        const result = await db.run('UPDATE users SET password = ? WHERE username = ?', [hashedPassword, username]);
        if (result.changes > 0) {
            res.json({ message: 'Password reset successfully', tempPassword });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/admin/editUser/:username', authenticate, requireAdminAuth, async (req, res) => {
    const username = req.params.username;
    const { newUsername, isAdmin } = req.body;

    try {
        if (newUsername && newUsername !== username) {
            const existingUser = await db.get('SELECT * FROM users WHERE username = ?', [newUsername]);
            if (existingUser) {
                return res.status(400).json({ error: 'New username already exists' });
            }
        }

        let query = 'UPDATE users SET';
        const params = [];
        if (newUsername) {
            query += ' username = ?,';
            params.push(newUsername);
        }
        if (isAdmin !== undefined) {
            query += ' isAdmin = ?,';
            params.push(isAdmin ? 1 : 0);
        }
        query = query.slice(0, -1); // Remove the last comma
        query += ' WHERE username = ?';
        params.push(username);

        const result = await db.run(query, params);
        if (result.changes > 0) {
            res.json({ message: 'User updated successfully' });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/admin/users', authenticate, requireAdminAuth, async (req, res) => {
    try {
        const users = await db.all('SELECT username, isAdmin FROM users');
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/admin/deleteUser/:username', authenticate, requireAdminAuth, async (req, res) => {
    const username = req.params.username;

    try {
        const result = await db.run('DELETE FROM users WHERE username = ? AND isAdmin = 0', [username]);
        if (result.changes > 0) {
            res.json({ message: 'User deleted successfully' });
        } else {
            res.status(404).json({ error: 'User not found or cannot be deleted' });
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add a new route for deleting entries
app.delete('/admin/deleteEntry', authenticate, requireAdminAuth, async (req, res) => {
    const { username, patientID, sessionID, qcType } = req.body;

    try {
        const result = await db.run('DELETE FROM qc_log WHERE username = ? AND patientID = ? AND sessionID = ? AND qcType = ?', 
            [username, patientID, sessionID, qcType]);
        
        if (result.changes > 0) {
            res.json({ message: 'Entry deleted successfully' });
        } else {
            res.status(404).json({ error: 'Entry not found' });
        }
    } catch (error) {
        console.error('Error deleting entry:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add a new route for deleting all entries for a user
app.delete('/admin/deleteAllUserEntries', authenticate, requireAdminAuth, async (req, res) => {
    const { username } = req.body;

    try {
        const result = await db.run('DELETE FROM qc_log WHERE username = ?', [username]);
        
        if (result.changes > 0) {
            res.json({ message: `All entries for user "${username}" deleted successfully` });
        } else {
            res.status(404).json({ error: 'No entries found for the specified user' });
        }
    } catch (error) {
        console.error('Error deleting user entries:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/admin/users/:username', authenticate, requireAdminAuth, async (req, res) => {
    const username = req.params.username;
    try {
        const user = await db.get('SELECT username, isAdmin FROM users WHERE username = ?', [username]);
        if (user) {
            res.json(user);
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start the server
async function startServer() {
    try {
        await initDatabase();
        validPatients = await scanAndFilterImages(niftiDir);
        console.log(`Scanned and filtered ${validPatients.length} valid patients.`);
        
        app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}`);
            console.log(`Serving NIFTI files from directory: ${niftiDir}`);
            console.log(`Serving segmentation files from directory: ${segmentationDir}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();