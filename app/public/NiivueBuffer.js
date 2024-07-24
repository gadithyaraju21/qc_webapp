class NiivueBuffer {
    constructor(bufferSize = 7, cacheSize = 20, sessionId, workerCount = 5) {
        this.bufferSize = bufferSize; // Number of images to keep in immediate buffer
        this.cacheSize = cacheSize; // Number of images to keep in LRU cache
        this.sessionId = sessionId;
        this.workerCount = workerCount;
        this.buffer = new Map(); // Immediate buffer for quick access
        this.cache = new Map(); // LRU cache for recently used images
        this.loadQueue = new Set(); // Queue for images to be loaded
        this.currentIndex = 0;
        this.workers = [];
        this.patientSessions = []; // Will be populated in initialize method
        this.qcType = ''; // Will be set in initialize method
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
        this.currentIndex = 0;
        await this.fillBuffer();
    }

    async fillBuffer() {
        const totalImages = this.patientSessions.length;
        const startIndex = Math.max(0, this.currentIndex - 3);
        const endIndex = Math.min(totalImages - 1, this.currentIndex + 3);

        // Add images to load queue if they're not in buffer or cache
        for (let i = startIndex; i <= endIndex; i++) {
            if (!this.buffer.has(i) && !this.cache.has(i) && !this.loadQueue.has(i)) {
                this.loadQueue.add(i);
            }
        }
        this.processQueue();
    }

    processQueue() {
        while (this.loadQueue.size > 0 && this.buffer.size < this.bufferSize) {
            const index = this.loadQueue.values().next().value;
            this.loadQueue.delete(index);
            this.preloadImage(index);
        }
    }

    preloadImage(index) {
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
            if (!this.buffer.has(index) && !this.cache.has(index)) {
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
            this.addToBufferAndCache(index, imageData);
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
        // Check buffer first
        if (this.buffer.has(index)) {
            return this.buffer.get(index);
        }
        // Check cache next
        if (this.cache.has(index)) {
            const imageData = this.cache.get(index);
            this.cache.delete(index);
            this.addToBufferAndCache(index, imageData);
            return imageData;
        }
        // If not in buffer or cache, load the image
        console.log(`Image not in buffer or cache, loading for index: ${index}`);
        return this.loadImage(index);
    }

    async loadImage(index) {
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
                        this.addToBufferAndCache(index, e.data.imageData);
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

    addToBufferAndCache(index, imageData) {
        // Add to buffer
        this.buffer.set(index, imageData);
        if (this.buffer.size > this.bufferSize) {
            const oldestBufferKey = this.buffer.keys().next().value;
            this.buffer.delete(oldestBufferKey);
        }

        // Add to cache
        if (this.cache.size >= this.cacheSize) {
            const oldestCacheKey = this.cache.keys().next().value;
            this.cache.delete(oldestCacheKey);
        }
        this.cache.set(index, imageData);
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
        const totalImages = this.patientSessions.length;
        const minIndex = Math.max(0, this.currentIndex - 3);
        const maxIndex = Math.min(totalImages - 1, this.currentIndex + 3);
        
        // Remove images from buffer that are no longer needed
        for (const [index, _] of this.buffer) {
            if (index < minIndex || index > maxIndex) {
                const imageData = this.buffer.get(index);
                this.buffer.delete(index);
                // Move to cache if not already there
                if (!this.cache.has(index)) {
                    this.addToBufferAndCache(index, imageData);
                }
            }
        }

        // Add new images to the buffer
        for (let i = minIndex; i <= maxIndex; i++) {
            if (!this.buffer.has(i) && !this.loadQueue.has(i)) {
                if (this.cache.has(i)) {
                    // If in cache, move to buffer
                    const imageData = this.cache.get(i);
                    this.cache.delete(i);
                    this.addToBufferAndCache(i, imageData);
                } else {
                    // If not in cache, add to load queue
                    this.loadQueue.add(i);
                }
            }
        }

        this.processQueue();
    }
}

export default NiivueBuffer;