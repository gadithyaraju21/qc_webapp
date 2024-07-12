class NiivueBuffer {
    constructor(bufferSize = 5, sessionId, workerCount = 5) {
        this.bufferSize = bufferSize;
        this.sessionId = sessionId;
        this.workerCount = workerCount;
        this.buffer = new Map();
        this.loadQueue = new Set();
        this.currentIndex = 0;
        this.workers = [];
        this.initializeWorkers();
    }

    initializeWorkers() {
        for (let i = 0; i < this.workerCount; i++) {
            try {
                const worker = new Worker('niivue-worker.js');
                worker.onmessage = this.handleWorkerMessage.bind(this);
                worker.onerror = this.handleWorkerError.bind(this);
                this.workers.push(worker);
                console.log(`Worker ${i} initialized`);
            } catch (error) {
                console.error(`Failed to initialize worker ${i}:`, error);
            }
        }
    }

    async initialize(patientSessions, qcType) {
        this.patientSessions = patientSessions;
        this.qcType = qcType;
        await this.fillBuffer();
    }

    async fillBuffer() {
        // console.log('Filling buffer...');
        const endIndex = Math.min(this.currentIndex + this.bufferSize, this.patientSessions.length);
        for (let i = this.currentIndex; i < endIndex; i++) {
            if (!this.buffer.has(i) && !this.loadQueue.has(i)) {
                this.loadQueue.add(i);
            }
        }
        this.processQueue();
    }

    processQueue() {
        // console.log(`Processing queue. Queue size: ${this.loadQueue.size}, Buffer size: ${this.buffer.size}`);
        while (this.loadQueue.size > 0 && this.buffer.size < this.bufferSize) {
            const index = this.loadQueue.values().next().value;
            this.loadQueue.delete(index);
            this.preloadImage(index);
        }
    }

    preloadImage(index) {
        // console.log(`Preloading image for index: ${index}`);
        const { patient, session } = this.patientSessions[index];
        const imageType = this.qcType === 'LST_AI' ? 'FLAIR' : this.qcType;
        const worker = this.workers[index % this.workerCount];
        worker.postMessage({ 
            action: 'preload',
            patient, 
            session, 
            imageType, 
            qcType: this.qcType, 
            index, 
            sessionId: this.sessionId 
        });

        // Set a timeout for the worker
        setTimeout(() => {
            if (!this.buffer.has(index)) {
                console.error(`Timeout for image loading at index: ${index}`);
                this.handleWorkerError({ message: 'Timeout', index });
            }
        }, 30000); // 30 seconds timeout
    }

    handleWorkerMessage(e) {
        const { action, index, imageData, error } = e.data;
        if (error) {
            console.error(`Worker error for index ${index}:`, error);
            this.handleWorkerError({ message: error, index });
        } else if (action === 'preloadComplete') {
            // console.log(`Preload complete for index: ${index}`);
            this.buffer.set(index, imageData);
            this.processQueue();
        }
    }

    handleWorkerError(error) {
        console.error('Worker error:', error);
        if (error.index !== undefined) {
            this.loadQueue.delete(error.index);
            this.processQueue();
        }
    }

    async getImage(index) {
        // console.log(`Attempting to get image for index: ${index}`);
        if (this.buffer.has(index)) {
            // console.log(`Image found in buffer for index: ${index}`);
            return this.buffer.get(index);
        }
        console.log(`Image not in buffer, loading for index: ${index}`);
        return this.loadImage(index);
    }

    async loadImage(index) {
       // console.log(`Loading image for index: ${index}`);
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Timeout while loading image for index: ${index}`));
            }, 30000); // 30 seconds timeout

            const handleMessage = (e) => {
                if (e.data.index === index) {
                    clearTimeout(timeout);
                    this.workers[index % this.workerCount].removeEventListener('message', handleMessage);
                    if (e.data.error) {
                        reject(new Error(e.data.error));
                    } else {
                        resolve(e.data.imageData);
                    }
                }
            };
            this.workers[index % this.workerCount].addEventListener('message', handleMessage);
            if (!this.loadQueue.has(index)) {
                this.loadQueue.add(index);
                this.processQueue();
            }
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
        // console.log('Updating buffer...');
        const minIndex = this.currentIndex - Math.floor(this.bufferSize / 2);
        const maxIndex = this.currentIndex + Math.floor(this.bufferSize / 2);
        
        for (const [index, _] of this.buffer) {
            if (index < minIndex || index > maxIndex) {
                this.buffer.delete(index);
            }
        }

        await this.fillBuffer();
    }
}

export default NiivueBuffer;