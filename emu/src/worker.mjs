/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
const { Embedder } = require("./embedder");
const { parentPort } = require("node:worker_threads");
require("onnxruntime-node");

const embedder = new Embedder();
embedder.init().then(async () => {
  console.log("initialized");
  parentPort?.on("message", async (input) => {
    const result = await embedder.embed(input);
    parentPort?.postMessage(result);
  });
});
