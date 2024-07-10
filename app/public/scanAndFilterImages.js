// scanAndFilterImages.js

const fs = require('fs').promises;
const path = require('path');

async function scanAndFilterImages(baseDir) {
    const validPatients = [];

    try {
        const patients = await fs.readdir(baseDir);

        for (const patient of patients) {
            const patientDir = path.join(baseDir, patient);
            const sessions = await fs.readdir(patientDir);

            for (const session of sessions) {
                const sessionDir = path.join(patientDir, session, 'anat');
                try {
                    const files = await fs.readdir(sessionDir);
                    const hasT1w = files.some(file => file.includes('_T1w.nii.gz'));
                    const hasFLAIR = files.some(file => file.includes('_FLAIR.nii.gz'));

                    if (hasT1w && hasFLAIR) {
                        validPatients.push({
                            patient,
                            session,
                            T1Path: path.join(sessionDir, files.find(file => file.includes('_T1w.nii.gz'))),
                            FLAIRPath: path.join(sessionDir, files.find(file => file.includes('_FLAIR.nii.gz')))
                        });
                    }
                } catch (error) {
                    console.error(`Error reading session directory ${sessionDir}:`, error);
                }
            }
        }
    } catch (error) {
        console.error('Error scanning directory:', error);
    }

    return validPatients;
}

module.exports = scanAndFilterImages;