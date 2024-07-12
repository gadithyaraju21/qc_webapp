// data-fetch-worker.js
console.log('Data fetch worker initialized');

self.onerror = function(error) {
    console.error('Worker global error:', error);
    self.postMessage({ action: 'error', error: error.message });
};

self.onmessage = async function(e) {
    const { action, patient, session, imageType, qcType, index, sessionId } = e.data;
    
    if (action === 'preload') {
        try {
            // console.log(`Worker: Preloading data for patient ${patient}, session ${session}, index ${index}`);
            const headers = { 'X-Session-Id': sessionId };
            const niftiResponse = await fetch(`/nifti-files/${patient}/${session}?imageType=${imageType}`, { headers });
            
            if (!niftiResponse.ok) {
                throw new Error(`HTTP error! status: ${niftiResponse.status}`);
            }
            
            const niftiFiles = await niftiResponse.json();

            if (niftiFiles.length > 0) {
                const volumes = [];
                const niftiBlob = await (await fetch(`/nifti/${patient}/${session}/${niftiFiles[0]}`, { headers })).blob();
                volumes.push({ url: URL.createObjectURL(niftiBlob), name: niftiFiles[0], colormap: "gray", opacity: 1 });

                if (qcType === 'LST_AI') {
                    const segmentationResponse = await fetch(`/segmentation-files/${patient}/${session}`, { headers });
                    if (!segmentationResponse.ok) {
                        throw new Error(`HTTP error! status: ${segmentationResponse.status}`);
                    }
                    const segmentationFiles = await segmentationResponse.json();
                    if (segmentationFiles.length > 0) {
                        const segmentationBlob = await (await fetch(`/segmentation/${patient}/${session}/${segmentationFiles[0]}`, { headers })).blob();
                        volumes.push({ url: URL.createObjectURL(segmentationBlob), name: segmentationFiles[0], colormap: "red", opacity: 1.0 });
                    }
                }

                // console.log(`Worker: Preload complete for index ${index}`);
                self.postMessage({ action: 'preloadComplete', index, imageData: volumes });
            } else {
                throw new Error("No NIFTI files found");
            }
        } catch (error) {
            console.error(`Worker: Error processing index ${index}:`, error);
            self.postMessage({ action: 'preloadComplete', index, error: error.message });
        }
    }
};

console.log('Data fetch worker setup complete');