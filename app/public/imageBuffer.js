class ImageBuffer {
    constructor(bufferSize = 10, sessionId, workerCount = 4) {
        this.bufferSize = bufferSize;
        this.buffer = new WeakMap();
        this.loadQueue = [];
        this.currentIndex = 0;
        this.sessionId = sessionId;
        this.workerCount = workerCount;
        this.preloadWorkers = [];
        this.activeTasks = 0;

        // Create multiple preload workers
        for (let i = 0; i < workerCount; i++) {
            const worker = new Worker('preload-worker.js');
            worker.onmessage = this.handlePreloadMessage.bind(this);
            this.preloadWorkers.push(worker);
        }
    }

    async initialize(patientSessions, qcType) {
        this.patientSessions = patientSessions;
        this.qcType = qcType;
        await this.fillBuffer();
    }

    async fillBuffer() {
        const centerIndex = this.currentIndex;
        const start = Math.max(centerIndex - 2, 0);
        const end = Math.min(centerIndex + 3, this.patientSessions.length);

        for (let i = start; i < end; i++) {
            const patient = this.patientSessions[i];
            if (!this.buffer.has(patient)) {
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
            this.buffer.set(this.patientSessions[index], volumes);
        }
        this.processQueue(); // Continue processing the queue
    }

    async getImage(index) {
        const patient = this.patientSessions[index];
        if (this.buffer.has(patient)) {
            return this.buffer.get(patient);
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
        this.bufferHead = Math.max(this.currentIndex - 2, 0);
        this.bufferTail = Math.min(this.currentIndex + 3, this.patientSessions.length);

        // Remove old entries from the buffer
        for (let i = this.bufferHead; i < this.bufferTail; i++) {
            if (!this.buffer.has(this.patientSessions[i])) {
                this.buffer.delete(this.patientSessions[i]);
            }
        }

        await this.fillBuffer();
    }
}

export default ImageBuffer;