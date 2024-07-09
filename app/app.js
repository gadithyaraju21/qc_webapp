const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const crypto = require('crypto');

const app = express();
const port = 2025;
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
}

// Authentication middleware
const authenticate = (req, res, next) => {
    const sessionId = req.headers['x-session-id'];
    if (sessions[sessionId]) {
        req.username = sessions[sessionId];
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    // In a real application, you would validate against a database
    if (username === 'admin' && password === 'password123') {
        const sessionId = crypto.randomBytes(16).toString('hex');
        sessions[sessionId] = username;
        res.json({ sessionId });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});


app.get('/patients-sessions', authenticate, async (req, res) => {
    try {
        const { qcType } = req.query;
        const patients = await fs.readdir(niftiDir);
        const patientSessions = [];
  
        for (const patient of patients) {
            if (patient.startsWith('.')) continue;
  
            const sessionsPath = path.join(niftiDir, patient);
            try {
                const stats = await fs.lstat(sessionsPath);
                if (stats.isDirectory()) {
                    const sessions = await fs.readdir(sessionsPath);
                    for (const session of sessions) {
                        if (session.startsWith('.')) continue;
  
                        const anatPath = path.join(sessionsPath, session, 'anat');
                        try {
                            const anatStats = await fs.lstat(anatPath);
                            if (anatStats.isDirectory()) {
                                const files = await fs.readdir(anatPath);
                                const hasT1 = files.some(file => file.includes('_T1'));
                                const hasFLAIR = files.some(file => file.includes('_FLAIR'));
                                
                                if (qcType === 'T1' && hasT1) {
                                    patientSessions.push({ patient, session });
                                } else if ((qcType === 'FLAIR' || qcType === 'LST_AI') && hasFLAIR) {
                                    if (qcType === 'LST_AI') {
                                        const segPath = path.join(segmentationDir, patient, session);
                                        try {
                                            await fs.access(segPath);
                                            const segFiles = await fs.readdir(segPath);
                                            if (segFiles.some(file => file.endsWith('orig_seg-lst.nii') || file.endsWith('orig_seg-lst.nii.gz'))) {
                                                patientSessions.push({ patient, session });
                                            }
                                        } catch (error) {
                                            // Segmentation directory or files not found, skip this session
                                        }
                                    } else {
                                        patientSessions.push({ patient, session });
                                    }
                                }
                            }
                        } catch (error) {
                            console.error(`Error processing anat path for ${patient}/${session}:`, error);
                        }
                    }
                }
            } catch (error) {
                console.error(`Error processing patient path ${patient}:`, error);
            }
        }
  
        res.json(patientSessions);
    } catch (error) {
        console.error('Error in /patients-sessions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
  });

app.get('/nifti-files/:patient/:session', authenticate, async (req, res) => {
    try {
        const { patient, session } = req.params;
        const { imageType } = req.query;
        const anatPath = path.join(niftiDir, patient, session, 'anat');
        const files = await fs.readdir(anatPath);
        const niftiFiles = files.filter(file => {
            return (imageType === 'T1' && file.includes('_T1')) || (imageType === 'FLAIR' && file.includes('_FLAIR'));
        });
        res.json(niftiFiles);
    } catch (error) {
        console.error('Error in /nifti-files:', error);
        res.status(500).json({ error: 'Internal server error' });
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

app.post('/export-csv', authenticate, async (req, res) => {
    const { filter } = req.body;
    try {
        let query = `SELECT username, patientID, sessionID, qcType, option, date, time FROM qc_log`;
        if (filter) {
            query += ` WHERE qcType = ?`;
        }
        const rows = await db.all(query, filter ? [filter] : []);
        
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

app.get('/database', authenticate, async (req, res) => {
    try {
        const rows = await db.all(`SELECT username, patientID, sessionID, option, qcType, date, time FROM qc_log`);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching database content:', error.message);
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


// Start the server
async function startServer() {
    try {
        await initDatabase();
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