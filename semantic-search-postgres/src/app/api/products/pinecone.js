import { Pinecone } from "@pinecone-database/pinecone";

/** @type Pinecone */
let pinecone;
export function getPinecone() {
	if (pinecone) {
		return pinecone;
	}
	pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
	return pinecone;
}
