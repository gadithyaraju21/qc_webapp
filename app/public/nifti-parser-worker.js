importScripts('https://cdn.jsdelivr.net/npm/nifti-reader-js@0.5.4/release/current/nifti-reader.js');

self.onmessage = function(e) {
    const { data, filename, index } = e.data;
    
    try {
        const parser = new nifti.NiftiParser();
        const header = parser.parseHeader(data);
        const image = parser.parseImage(header, data);

        self.postMessage({
            parsedData: { header, image },
            filename,
            index
        });
    } catch (error) {
        self.postMessage({ error: error.message, filename, index });
    }
};
