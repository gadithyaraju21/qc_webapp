class ImageBuffer {
    constructor(bufferSize = 10, sessionId, workerCount = 4) {
        this.bufferSize = bufferSize;
        this.buffer = new Map();
        this.loadQueue = [];
        this.currentIndex = 0;
        this.sessionId = sessionId;
        this.workerCount = workerCount;
        this.preloadWorkers = [];
        this.niftiParserWorker = new Worker('nifti-parser-worker.js');
        this.activeTasks = 0;

        // Create multiple preload workers
        for (let i = 0; i < workerCount; i++) {
            const worker = new Worker('preload-worker.js');
            worker.onmessage = this.handlePreloadMessage.bind(this);
            this.preloadWorkers.push(worker);
        }

        this.niftiParserWorker.onmessage = this.handleNiftiParseMessage.bind(this);
    }

    async initialize(patientSessions, qcType) {
        this.patientSessions = patientSessions;
        this.qcType = qcType;
        await this.fillBuffer();
    }

    async fillBuffer() {
        const endIndex = Math.min(this.currentIndex + this.bufferSize, this.patientSessions.length);
        for (let i = this.currentIndex; i < endIndex; i++) {
            if (!this.buffer.has(i) && !this.loadQueue.includes(i)) {
                this.loadQueue.push(i);
            }
        }
        this.processQueue();
    }

    processQueue() {
        const MAX_CONCURRENT_TASKS = this.workerCount; // Limit to the number of workers
        while (this.loadQueue.length > 0 && this.buffer.size < this.bufferSize && this.activeTasks < MAX_CONCURRENT_TASKS) {
            const index = this.loadQueue.shift();
            this.preloadImage(index);
        }
    }

    preloadImage(index) {
        this.activeTasks++;
        const { patient, session } = this.patientSessions[index];
        const imageType = this.qcType === 'LST_AI' ? 'FLAIR' : this.qcType;

        // Select a worker in a round-robin fashion
        const worker = this.preloadWorkers[index % this.workerCount];
        worker.postMessage({ patient, session, imageType, qcType: this.qcType, index, sessionId: this.sessionId });
    }

    handlePreloadMessage(e) {
        this.activeTasks--;
        const { error, volumes, index } = e.data;
        if (error) {
            console.error(`Preload error for index ${index}:`, error);
        } else {
            this.sendToParser(volumes, index);
        }
        this.processQueue(); // Continue processing the queue
    }

    sendToParser(volumes, index) {
        volumes.forEach(volume => {
            this.niftiParserWorker.postMessage({
                data: volume.data,
                filename: volume.name,
                index: index
            }, [volume.data]);
        });
        
        this.buffer.set(index, volumes.map(v => ({...v, data: null})));
    }

    handleNiftiParseMessage(e) {
        const { error, parsedData, index, filename } = e.data;
        if (error) {
            console.error(`NIFTI parse error for index ${index}:`, error);
        } else {
            const volumes = this.buffer.get(index);
            const volumeIndex = volumes.findIndex(v => v.name === filename);
            if (volumeIndex !== -1) {
                volumes[volumeIndex].parsedData = parsedData;
                this.buffer.set(index, volumes);
            }
        }
    }

    async getImage(index) {
        if (this.buffer.has(index)) {
            return this.buffer.get(index);
        }
        return this.loadImage(index);
    }

    async loadImage(index) {
        return new Promise((resolve, reject) => {
            const handlePreloadMessage = (e) => {
                if (e.data.index === index) {
                    this.preloadWorkers[index % this.workerCount].removeEventListener('message', handlePreloadMessage);
                    if (e.data.error) {
                        reject(new Error(e.data.error));
                    } else {
                        resolve(e.data.volumes);
                    }
                }
            };
            this.preloadWorkers[index % this.workerCount].addEventListener('message', handlePreloadMessage);
            this.preloadImage(index);
        });
    }

    async moveNext() {
        this.currentIndex = (this.currentIndex + 1) % this.patientSessions.length;
        await this.updateBuffer();
        return this.currentIndex;
    }

    async movePrevious() {
        this.currentIndex = (this.currentIndex - 1 + this.patientSessions.length) % this.patientSessions.length;
        await this.updateBuffer();
        return this.currentIndex;
    }

    async updateBuffer() {
        const minIndex = this.currentIndex - Math.floor(this.bufferSize / 2);
        const maxIndex = this.currentIndex + Math.floor(this.bufferSize / 2);
        
        for (const [index, volumes] of this.buffer) {
            if (index < minIndex || index > maxIndex) {
                volumes.forEach(vol => URL.revokeObjectURL(vol.url));
                this.buffer.delete(index);
            }
        }

        await this.fillBuffer();
    }
}

export default ImageBuffer;
