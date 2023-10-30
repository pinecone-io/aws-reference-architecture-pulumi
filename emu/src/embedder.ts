
import { Index, Pinecone, PineconeRecord, RecordMetadata } from '@pinecone-database/pinecone';
import { Pipeline } from '@xenova/transformers/types/pipelines';
import { v4 as uuidv4 } from 'uuid';

export type EmbedderInput = {
    id?: string,
    text: string,
    metadata: RecordMetadata
}

class Embedder<T extends RecordMetadata> {
    private instance: Pipeline | null;
    private pinecone: Pinecone;
    private index: Index<T>;
    private namespace: Index<T>;

    static task = 'feature-extraction';
    static model = 'Xenova/all-MiniLM-L6-v2';

    constructor() {
        this.instance = null
        this.pinecone = new Pinecone();
        const indexName = process.env.PINECONE_INDEX;
        const namespace = process.env.PINECONE_NAMESPACE;
        if (!indexName || !namespace) {
            throw new Error("PINECONE_INDEX and PINECONE_NAMESPACE must be set");
        }
        this.index = this.pinecone.index<T>(indexName);
        this.namespace = this.index.namespace(namespace);
    }

    async init(): Promise<Pipeline | null> {
        if (this.instance === null) {
            // Dynamically import the Transformers.js library
            const { pipeline } = await import('@xenova/transformers');
            this.instance = await pipeline(Embedder.task, Embedder.model);
        }
        // this.extractor = extractor
        return this.instance
    }

    async embed<T extends RecordMetadata>({ id, text, metadata }: { id?: string, text: string, metadata: T }): Promise<PineconeRecord<T>> {
        if (!this.instance) {
            throw new Error("Embedder not initialized");
        }
        const embedding = await this.instance(text);

        if (!embedding || !embedding[0] || !embedding[0].data) {
            throw new Error("Embedding failed");
        }
        const record: PineconeRecord<T> = {
            id: id || uuidv4(),
            values: Array.from(embedding[0].data),
            metadata
        }
        return record
    }

}



export { Embedder }