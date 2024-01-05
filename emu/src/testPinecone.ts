import { Pinecone } from "@pinecone-database/pinecone";
import { v4 as uuidv4 } from "uuid";

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

const indexName = process.env.PINECONE_INDEX;
const namespace = process.env.PINECONE_NAMESPACE;

if (!indexName || !namespace) {
  throw new Error("PINECONE_INDEX and PINECONE_NAMESPACE must be set");
}

console.log(indexName, namespace);

const test = async (): Promise<void> => {
  try {
    const index = pinecone.index(indexName);
    const ns = index.namespace(namespace);
    await ns.upsert([
      {
        id: uuidv4(),
        values: Array.from({ length: 1152 }, () => Math.random() * 2 - 1),
        metadata: {
          title: "hello",
          url: "hello",
        },
      },
    ]);
  } catch (e) {
    console.log("e", e);
    throw new Error(`Failed to upsert ${e}`);
  }
};

export { test };
