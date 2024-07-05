import * as niivue from 'https://cdn.jsdelivr.net/npm/@niivue/niivue@0.38.0/+esm';

const nv1 = new niivue.Niivue({
    isResizeCanvas: true,
    dragAndDropEnabled: true
});

let patientSessions = [];
let currentIndex = 0;
let maskOpacity = 0.5;
let imageOpacity = 1.0;
const imageType = new URLSearchParams(window.location.search).get('imageType') || 'T1';

document.addEventListener('DOMContentLoaded', function() {
    nv1.attachTo("gl");
    fetchPatientSessions();

    document.getElementById('sliceType').addEventListener('change', handleSliceTypeChange);
    document.getElementById('maskOpacityRange').addEventListener('input', handleMaskOpacityChange);
    document.getElementById('imageOpacityRange').addEventListener('input', handleImageOpacityChange);

    document.querySelectorAll('.qc-options .button').forEach(button => {
        button.addEventListener('click', () => logQCOption(button.textContent));
    });

    document.getElementById('prevButton').addEventListener('click', loadPrevious);
    document.getElementById('homeButton').addEventListener('click', () => window.location.href = 'filter.html');
    document.getElementById('logoutButton').addEventListener('click', logout);
});

async function fetchPatientSessions() {
    try {
        const response = await fetchWithAuth(`/patients-sessions?imageType=${imageType}`);
        const data = await response.json();
        console.log("Fetched patient sessions:", data);

        if (data.length > 0) {
            patientSessions = data;
            await loadPatientSession(currentIndex);
        } else {
            console.error("No patient sessions found");
            alert("No patient sessions found. Please check the server configuration.");
        }
    } catch (error) {
        console.error("Error fetching patient sessions:", error);
        alert(`Failed to fetch patient sessions: ${error.message}`);
    }
}

async function loadPatientSession(index) {
    const { patient, session } = patientSessions[index];
    document.getElementById("patient-info").textContent = `Patient: ${patient} | Session: ${session}`;

    try {
        const niftiResponse = await fetchWithAuth(`/nifti-files/${patient}/${session}?imageType=${imageType}`);
        const niftiFiles = await niftiResponse.json();

        const segmentationResponse = await fetchWithAuth(`/segmentation-files/${patient}/${session}`);
        const segmentationFiles = await segmentationResponse.json();

        if (niftiFiles.length > 0 && segmentationFiles.length > 0) {
            await loadFiles(patient, session, niftiFiles[0], segmentationFiles[0]);
            await highlightPreviousQCOption(patient, session, imageType);
        } else {
            console.error("No files found", { niftiFiles, segmentationFiles });
            alert("No files found for this patient session.");
        }
    } catch (error) {
        console.error("Error loading patient session files:", error);
        alert(`Failed to load patient session: ${error.message}`);
    }
}

async function loadFiles(patient, session, niftiFile, segmentationFile) {
    try {
        const [niftiResponse, segmentationResponse] = await Promise.all([
            fetchWithAuth(`/nifti/${patient}/${session}/${niftiFile}`),
            fetchWithAuth(`/segmentation/${patient}/${session}/${segmentationFile}`)
        ]);

        const [niftiBlob, segmentationBlob] = await Promise.all([
            niftiResponse.blob(),
            segmentationResponse.blob()
        ]);

        const niftiUrl = URL.createObjectURL(niftiBlob);
        const segmentationUrl = URL.createObjectURL(segmentationBlob);

        await nv1.loadVolumes([
            { url: niftiUrl, name: niftiFile, colormap: "gray", opacity: imageOpacity },
            { url: segmentationUrl, name: segmentationFile, colormap: "red", opacity: maskOpacity }
        ]);

        updateOpacityControls();
    } catch (error) {
        console.error("Error loading files:", error);
        alert(`Failed to load image files: ${error.message}`);
    }
}

function updateOpacityControls() {
    document.getElementById('maskOpacityRange').value = maskOpacity;
    document.getElementById('imageOpacityRange').value = imageOpacity;
}

async function logQCOption(option) {
    const { patient, session } = patientSessions[currentIndex];
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().split(' ')[0];
    const data = {
        patientID: patient,
        sessionID: session,
        option,
        imageType,
        date,
        time
    };
    try {
        const response = await fetchWithAuth('/log-qc', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (result.success) {
            highlightSelectedOption(option);
            loadNext();
        }
    } catch (error) {
        console.error('Error logging QC option:', error);
        alert(`Failed to log QC option: ${error.message}`);
    }
}

async function highlightPreviousQCOption(patient, session, imageType) {
    try {
        const response = await fetchWithAuth(`/get-qc-log?patient=${patient}&session=${session}&imageType=${imageType}`);
        const data = await response.json();
        if (data.option) {
            highlightSelectedOption(data.option);
        }
    } catch (error) {
        console.error("Error fetching QC log:", error);
    }
}

function highlightSelectedOption(option) {
    document.querySelectorAll('.qc-options .button').forEach(button => {
        button.classList.toggle('selected', button.textContent === option);
    });
}

function loadNext() {
    currentIndex = (currentIndex + 1) % patientSessions.length;
    loadPatientSession(currentIndex);
}

function loadPrevious() {
    currentIndex = (currentIndex - 1 + patientSessions.length) % patientSessions.length;
    loadPatientSession(currentIndex);
}

function handleSliceTypeChange(event) {
    let st = parseInt(event.target.value);
    nv1.setSliceType(st);
}

function handleMaskOpacityChange(event) {
    maskOpacity = parseFloat(event.target.value);
    nv1.volumes[1].opacity = maskOpacity;
    nv1.updateGLVolume();
}

function handleImageOpacityChange(event) {
    imageOpacity = parseFloat(event.target.value);
    nv1.volumes[0].opacity = imageOpacity;
    nv1.updateGLVolume();
}

// This function should be defined in your common.js file
async function fetchWithAuth(url, options = {}) {
    const sessionId = localStorage.getItem('sessionId');
    if (!sessionId) {
        window.location.href = '/login';
        return;
    }
    const headers = {
        ...options.headers,
        'X-Session-Id': sessionId,
    };
    try {
        const response = await fetch(url, { ...options, headers });
        if (response.status === 401) {
            window.location.href = '/login';
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

function logout() {
    localStorage.removeItem('sessionId');
    window.location.href = '/login';
}