import { PineconeRecord, RecordMetadata } from "@pinecone-database/pinecone";
import { Pipeline } from "@xenova/transformers/types/pipelines";
import { v4 as uuidv4 } from "uuid";

export type EmbedderInput = {
  id?: string;
  text: string;
  metadata: RecordMetadata;
};

class Embedder {
  private instance: Pipeline | null;
  static task = "feature-extraction";
  static model = "Xenova/all-MiniLM-L6-v2";

  constructor() {
    this.instance = null;
  }

  async init(): Promise<Pipeline | null> {
    if (this.instance === null) {
      // Dynamically import the Transformers.js library
      const { pipeline } = await import("@xenova/transformers");
      this.instance = await pipeline(Embedder.task, Embedder.model);
    }
    // this.extractor = extractor
    return this.instance;
  }

  async embed<T extends RecordMetadata>({
    id,
    text,
    metadata,
  }: {
    id?: string;
    text: string;
    metadata: T;
  }): Promise<PineconeRecord<T>> {
    if (!this.instance) {
      throw new Error("Embedder not initialized");
    }

    // const embedder = await MyClassificationPipeline.getInstance() as unknown as Pipeline;
    // const res = await embedder(text)
    // console.log(`res`, res)

    const embedding = await this.instance(text, {
      pooling: "mean",
      quantized: false,
    });

    if (!embedding || !embedding[0] || !embedding[0].data) {
      throw new Error("Embedding failed");
    }

    console.log(embedding[0].data.length);

    console.log(Array.from(embedding[0].data).length);
    const record: PineconeRecord<T> = {
      id: id || uuidv4(),
      values: Array.from(embedding[0].data) as number[],
      metadata,
    };
    return record;
  }
}

export { Embedder };
